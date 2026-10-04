import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube title filtering forbidden terms
const FORBIDDEN_WORDS = ['vlog', 'trailer', 'gameplay', 'episode'];

// Known track info for instant resolution
const KNOWN_TRACK_INFO: Record<string, { title: string; artist: string }> = {
  'IAIGnS9BPKs': {
    title: 'Ek Ladki Ko Dekha Toh Aisa Laga - Title Song',
    artist: 'Saregama Music',
  },
  '4HRC6c5-2lQ': {
    title: 'Yeh Raaten Yeh Mausam - SANAM ft. Simran Sehgal',
    artist: 'SANAM',
  },
  't-a6VlOUEtc': {
    title: 'Sakkarakatti - Marudaani Cover by Sanah Moidutty',
    artist: 'Sony Music South',
  },
};

interface ServerSong {
  id: string;
  title: string;
  artist: string;
  youtubeUrl: string;
  youtubeId: string;
  thumbnail: string;
  duration: number;
  requestedBy: string;
  requestedAt: number; // Unix timestamp ms
  strikes: number;
  struckByUsers: string[]; // List of user UUIDs or IPs who struck this song
  status: 'playing' | 'queued' | 'struck_out';
}

// Global server state: starts empty with no default tracks or queue items
let currentSong: ServerSong | null = null;
let currentSongStartedAt: number = 0; // 0 when station is idle
let globalQueue: ServerSong[] = [];

// Rate limiting: 1 request per hour (3600 seconds) per user UUID / IP
const userRateLimits = new Map<string, number>();
const RATE_LIMIT_SECONDS = 3600;

function checkTitleAllowed(title: string): { allowed: boolean; matchedWord?: string } {
  if (!title) return { allowed: true };
  const lower = title.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lower) || lower.includes(word)) {
      return { allowed: false, matchedWord: word };
    }
  }
  return { allowed: true };
}

function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const regExp = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.trim().match(regExp);
  return match && match[1] ? match[1] : null;
}

async function fetchOEmbed(url: string) {
  const videoId = extractYouTubeId(url);
  const known = videoId ? KNOWN_TRACK_INFO[videoId] : undefined;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('oEmbed fetch error:', e);
  }
  if (known) {
    return {
      title: known.title,
      author_name: known.artist,
      thumbnail_url: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '',
    };
  }
  return null;
}

function rotateToNextSong(io: Server, reason: 'finished' | 'skipped_7min' | 'manual' = 'finished') {
  if (globalQueue.length > 0) {
    const nextSong = globalQueue.shift()!;
    nextSong.status = 'playing';
    currentSong = nextSong;
    currentSongStartedAt = Date.now();
    console.log(`[Radio Rotation] Switched to "${currentSong.title}" (${reason}). Broadcasted to all listeners.`);
  } else {
    // No default songs: station stays on idle standby waiting for user requests
    currentSong = null;
    currentSongStartedAt = 0;
    console.log(`[Radio Rotation] Queue is now empty. Station on standby (${reason}).`);
  }

  io.emit('track:changed', {
    currentSong,
    startedAt: currentSongStartedAt,
    seekSeconds: 0,
    serverTime: Date.now(),
    reason,
  });

  io.emit('queue:updated', globalQueue);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  // Track connected sockets for active listener count
  const activeSockets = new Set<string>();

  const getStrikeThreshold = () => {
    const count = Math.max(1, activeSockets.size);
    if (count <= 1) return 1;
    if (count <= 3) return 2; // majority for 2 or 3 active listeners
    return 3; // standard 3-strike rule when >3 listeners
  };

  const broadcastListenerCount = () => {
    const count = Math.max(1, activeSockets.size);
    const strikeThreshold = getStrikeThreshold();
    const isSmallRoom = count <= 3;
    io.emit('listeners:count', count);
    io.emit('room:config', { count, strikeThreshold, isSmallRoom });
  };

  // 1-second interval for "7-minute rule" & duration auto-rotation
  setInterval(() => {
    if (!currentSong) return; // Station is on standby
    const elapsedSeconds = Math.floor((Date.now() - currentSongStartedAt) / 1000);
    // The "7-Minute Rule": if a song plays for 7 minutes (420s), automatically skip to next song
    const maxAllowedSeconds = Math.min(420, currentSong.duration || 420);

    if (elapsedSeconds >= maxAllowedSeconds) {
      const reason = elapsedSeconds >= 420 ? 'skipped_7min' : 'finished';
      rotateToNextSong(io, reason);
    }
  }, 1000);

  // REST endpoints for status & health
  app.get('/api/radio/status', (req, res) => {
    const elapsedSeconds = currentSongStartedAt > 0 ? Math.floor((Date.now() - currentSongStartedAt) / 1000) : 0;
    const count = Math.max(1, activeSockets.size);
    res.json({
      currentSong,
      startedAt: currentSongStartedAt,
      elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: count,
      strikeThreshold: getStrikeThreshold(),
      isSmallRoom: count <= 3,
    });
  });

  // WebSocket event handling
  io.on('connection', (socket: Socket) => {
    activeSockets.add(socket.id);
    const clientIp = socket.handshake.address || 'unknown';
    console.log(`[Socket] Listener connected: ${socket.id} (Total: ${activeSockets.size})`);

    // Broadcast updated listener count to all clients
    broadcastListenerCount();

    // Time Syncing: Send full current state + exact seek seconds
    const elapsedSeconds = currentSongStartedAt > 0 ? Math.floor((Date.now() - currentSongStartedAt) / 1000) : 0;
    const count = Math.max(1, activeSockets.size);
    socket.emit('state:sync', {
      currentSong,
      startedAt: currentSongStartedAt,
      seekSeconds: elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: count,
      strikeThreshold: getStrikeThreshold(),
      isSmallRoom: count <= 3,
    });

    // Handle user song request
    socket.on('song:request', async (payload: { url: string; userId: string; username?: string; bypassCooldown?: boolean }, callback) => {
      try {
        const { url, userId, username, bypassCooldown } = payload;
        const rateLimitKey = userId || clientIp;
        const activeCount = Math.max(1, activeSockets.size);
        const isSmallRoom = activeCount <= 3; // 1, 2, or 3 active listeners

        // 1. Rate Limiting: 1 song per hour (waived if 1, 2, or 3 active listeners)
        if (!isSmallRoom && !bypassCooldown && userRateLimits.has(rateLimitKey)) {
          const lastRequestTime = userRateLimits.get(rateLimitKey)!;
          const elapsed = (Date.now() - lastRequestTime) / 1000;
          if (elapsed < RATE_LIMIT_SECONDS) {
            const remaining = Math.ceil(RATE_LIMIT_SECONDS - elapsed);
            if (callback) {
              callback({
                success: false,
                error: `Rate limit: You can only request 1 song per hour when >3 listeners are online. Please wait ${Math.floor(remaining / 60)}m ${remaining % 60}s.`,
                remainingSeconds: remaining,
              });
            }
            return;
          }
        }

        // 2. Validate URL
        const videoId = extractYouTubeId(url);
        if (!videoId) {
          if (callback) {
            callback({ success: false, error: 'Invalid YouTube link. Please provide a valid YouTube URL.' });
          }
          return;
        }

        // 3. Fetch metadata via YouTube oEmbed
        const oembedData = await fetchOEmbed(url);
        const title = oembedData?.title || `YouTube Audio #${videoId}`;
        const artist = oembedData?.author_name || 'YouTube Creator';
        const thumbnail = oembedData?.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        // 4. Title Filtering: Reject 'vlog', 'trailer', 'gameplay', or 'episode'
        const filterResult = checkTitleAllowed(title);
        if (!filterResult.allowed) {
          if (callback) {
            callback({
              success: false,
              error: `Submission rejected: Title contains prohibited keyword "${filterResult.matchedWord}". The station accepts music tracks only (no vlogs, trailers, gameplay, or episodes).`,
              matchedWord: filterResult.matchedWord,
            });
          }
          return;
        }

        // 5. Append to Global Queue (or play immediately if station is idle)
        const newSong: ServerSong = {
          id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          artist,
          youtubeUrl: url,
          youtubeId: videoId,
          thumbnail,
          duration: 270, // Default estimate if unknown
          requestedBy: username || `@listener_${rateLimitKey.slice(0, 5)}`,
          requestedAt: Date.now(),
          strikes: 0,
          struckByUsers: [],
          status: 'queued',
        };

        if (!currentSong) {
          newSong.status = 'playing';
          currentSong = newSong;
          currentSongStartedAt = Date.now();
          console.log(`[Radio Request] Station was idle. Started broadcasting "${newSong.title}".`);

          io.emit('track:changed', {
            currentSong,
            startedAt: currentSongStartedAt,
            seekSeconds: 0,
            serverTime: Date.now(),
            reason: 'new_request',
          });
        } else {
          globalQueue.push(newSong);
          io.emit('queue:updated', globalQueue);
        }

        // Only enforce the rate limit timestamp when not in a small room (<=3 listeners)
        if (!isSmallRoom) {
          userRateLimits.set(rateLimitKey, Date.now());
        }

        io.emit('notification:new_request', {
          title: newSong.title,
          requestedBy: newSong.requestedBy,
        });

        if (callback) {
          callback({
            success: true,
            song: newSong,
            remainingCooldown: isSmallRoom ? 0 : RATE_LIMIT_SECONDS,
            isSmallRoom,
          });
        }
      } catch (err: any) {
        console.error('[Error] song:request failed:', err);
        if (callback) {
          callback({ success: false, error: 'Internal server error while processing request.' });
        }
      }
    });

    // Handle song strike (adaptive strikes: 1 for 1 user, 2 for 2-3 users, 3 for >3 users; user strike restriction waived for <= 3 users)
    socket.on('song:strike', (payload: { songId: string; userId: string; peerId?: string }, callback) => {
      const { songId, userId, peerId } = payload;
      const strikeUserId = peerId || userId || clientIp;

      const targetIndex = globalQueue.findIndex((s) => s.id === songId);
      if (targetIndex === -1) {
        if (callback) callback({ success: false, error: 'Song not found in queue.' });
        return;
      }

      const song = globalQueue[targetIndex];
      const activeCount = Math.max(1, activeSockets.size);
      const isSmallRoom = activeCount <= 3;
      const strikeThreshold = getStrikeThreshold();

      // In large rooms (>3 listeners), each user can only strike once.
      // In small rooms (1, 2, or 3 listeners), the restriction is waived so moderation isn't blocked.
      if (!isSmallRoom && song.struckByUsers.includes(strikeUserId)) {
        if (callback) callback({ success: false, error: 'You have already struck this song.' });
        return;
      }

      song.struckByUsers.push(strikeUserId);
      song.strikes += 1;

      // When threshold is reached, pull from queue immediately
      if (song.strikes >= strikeThreshold) {
        globalQueue.splice(targetIndex, 1);
        io.emit('queue:updated', globalQueue);
        io.emit('notification:song_pulled', {
          songTitle: song.title,
          reason: `Reached ${song.strikes}/${strikeThreshold} strike(s) (${activeCount} active listener${activeCount === 1 ? '' : 's'}) and was pulled from the air.`,
        });
        if (callback) callback({ success: true, pulled: true, strikes: song.strikes, strikeThreshold });
        return;
      }

      io.emit('queue:updated', globalQueue);
      if (callback) callback({ success: true, strikes: song.strikes, strikeThreshold });
    });

    // Client requests re-sync (e.g. after user interacts with play button)
    socket.on('sync:request', () => {
      const elapsed = currentSongStartedAt > 0 ? Math.floor((Date.now() - currentSongStartedAt) / 1000) : 0;
      const count = Math.max(1, activeSockets.size);
      socket.emit('state:sync', {
        currentSong,
        startedAt: currentSongStartedAt,
        seekSeconds: elapsed,
        serverTime: Date.now(),
        queue: globalQueue,
        listenerCount: count,
        strikeThreshold: getStrikeThreshold(),
        isSmallRoom: count <= 3,
      });
    });

    socket.on('disconnect', () => {
      activeSockets.delete(socket.id);
      console.log(`[Socket] Listener disconnected: ${socket.id} (Remaining: ${activeSockets.size})`);
      broadcastListenerCount();
    });
  });

  // Vite development vs production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 SVNIT Radio Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
