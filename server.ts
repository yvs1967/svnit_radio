import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube title filtering forbidden terms
const FORBIDDEN_WORDS = ['vlog', 'trailer', 'gameplay', 'episode'];

// Known track info for instant resolution with exact durations
const KNOWN_TRACK_INFO: Record<string, { title: string; artist: string; duration: number }> = {
  'IAIGnS9BPKs': {
    title: 'Ek Ladki Ko Dekha Toh Aisa Laga - Title Song',
    artist: 'Saregama Music',
    duration: 122, // 2:02
  },
  '4HRC6c5-2lQ': {
    title: 'Yeh Raaten Yeh Mausam - SANAM ft. Simran Sehgal',
    artist: 'SANAM',
    duration: 209, // 3:29
  },
  't-a6VlOUEtc': {
    title: 'Sakkarakatti - Marudaani Cover by Sanah Moidutty',
    artist: 'Sony Music South',
    duration: 178, // 2:58
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
let isLooping: boolean = false; // Enabled only when exactly 1 listener is online

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

  // Track connected sockets to distinct user IDs for accurate active listener count
  const socketUserMap = new Map<string, string>(); // socket.id -> userId

  const getActiveUserCount = () => {
    const uniqueUsers = new Set(socketUserMap.values());
    return Math.max(1, uniqueUsers.size);
  };

  const getStrikeThreshold = () => {
    const count = getActiveUserCount();
    if (count <= 1) return 1;
    if (count <= 3) return 2; // majority for 2 or 3 active listeners
    return 3; // standard 3-strike rule when >3 listeners
  };

  const broadcastListenerCount = () => {
    const count = getActiveUserCount();
    const strikeThreshold = getStrikeThreshold();
    const isSmallRoom = count <= 3;
    // Looping is strictly a 1-listener feature: automatically disable if another user joins
    if (count > 1 && isLooping) {
      isLooping = false;
      io.emit('loop:status', { isLooping: false, reason: 'multiuser_active' });
    }
    io.emit('listeners:count', count);
    io.emit('room:config', { count, strikeThreshold, isSmallRoom, isLooping: count <= 1 && isLooping });
  };

  // 1-second interval for "7-minute rule", looping & duration auto-rotation
  setInterval(() => {
    if (!currentSong) return; // Station is on standby
    const elapsedSeconds = Math.floor((Date.now() - currentSongStartedAt) / 1000);
    // The "7-Minute Rule": if a song plays for 7 minutes (420s), automatically skip to next song
    const maxAllowedSeconds = Math.min(420, currentSong.duration || 420);

    if (elapsedSeconds >= maxAllowedSeconds) {
      // If exactly 1 listener and loop is toggled on, loop this song continuously from 0:00!
      if (isLooping && getActiveUserCount() <= 1 && currentSong) {
        currentSongStartedAt = Date.now();
        console.log(`[Radio Loop] 1-listener solo loop: Repeating "${currentSong.title}" from 0:00.`);
        io.emit('track:changed', {
          currentSong,
          startedAt: currentSongStartedAt,
          seekSeconds: 0,
          serverTime: Date.now(),
          reason: 'loop',
        });
      } else {
        const reason = elapsedSeconds >= 420 ? 'skipped_7min' : 'finished';
        rotateToNextSong(io, reason);
      }
    }
  }, 1000);

  // REST endpoints for status & health
  app.get('/api/radio/status', (req, res) => {
    const elapsedSeconds = currentSongStartedAt > 0 ? Math.floor((Date.now() - currentSongStartedAt) / 1000) : 0;
    const count = getActiveUserCount();
    res.json({
      currentSong,
      startedAt: currentSongStartedAt,
      elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: count,
      strikeThreshold: getStrikeThreshold(),
      isSmallRoom: count <= 3,
      isLooping: count <= 1 && isLooping,
    });
  });

  // WebSocket event handling
  io.on('connection', (socket: Socket) => {
    const handshakeAuth = socket.handshake.auth || {};
    const userId = (handshakeAuth.userId as string) || (socket.handshake.query?.userId as string) || socket.handshake.address || socket.id;
    socketUserMap.set(socket.id, userId);
    const clientIp = socket.handshake.address || 'unknown';
    console.log(`[Socket] Listener connected: ${socket.id} (User: ${userId}, Total unique: ${getActiveUserCount()})`);

    // Broadcast updated listener count to all clients
    broadcastListenerCount();

    // Time Syncing: Send full current state + exact seek seconds
    const elapsedSeconds = currentSongStartedAt > 0 ? Math.floor((Date.now() - currentSongStartedAt) / 1000) : 0;
    const count = getActiveUserCount();
    socket.emit('state:sync', {
      currentSong,
      startedAt: currentSongStartedAt,
      seekSeconds: elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: count,
      strikeThreshold: getStrikeThreshold(),
      isSmallRoom: count <= 3,
      isLooping: count <= 1 && isLooping,
    });

    // Handle user song request
    socket.on('song:request', async (payload: { url: string; userId: string; username?: string; bypassCooldown?: boolean; duration?: number }, callback) => {
      try {
        const { url, userId, username, bypassCooldown, duration } = payload;
        const rateLimitKey = userId || clientIp;
        const activeCount = getActiveUserCount();
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

        // Duplicate Check: Cannot add if already playing or waiting in the queue
        const isDuplicateInQueue = globalQueue.some((s) => s.youtubeId === videoId);
        const isDuplicatePlaying = currentSong?.youtubeId === videoId;
        if (isDuplicateInQueue || isDuplicatePlaying) {
          const duplicateMsg = isDuplicatePlaying
            ? `"${currentSong?.title || 'This track'}" is currently playing live on air`
            : `This song is already waiting in the queue`;
          if (callback) {
            callback({
              success: false,
              error: `Duplicate track rejected: ${duplicateMsg}. Songs already in the queue or on air cannot be added again.`,
            });
          }
          return;
        }

        // 3. Fetch metadata via YouTube oEmbed or known track info
        const oembedData = await fetchOEmbed(url);
        const knownTrack = KNOWN_TRACK_INFO[videoId];
        const title = oembedData?.title || knownTrack?.title || `YouTube Audio #${videoId}`;
        const artist = oembedData?.author_name || knownTrack?.artist || 'YouTube Creator';
        const thumbnail = oembedData?.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        // Accurate duration: prefer known exact info first, then client detected duration, then standard fallback
        let resolvedDuration = 180;
        if (knownTrack && knownTrack.duration > 0) {
          resolvedDuration = knownTrack.duration;
        } else if (typeof duration === 'number' && duration > 0) {
          resolvedDuration = Math.round(duration);
        }

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
          duration: resolvedDuration,
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
          console.log(`[Radio Request] Station was idle. Started broadcasting "${newSong.title}" (${resolvedDuration}s).`);

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

    // Authoritative duration sync from YouTube player API
    socket.on('track:duration_sync', (payload: { songId: string; duration: number }) => {
      if (typeof payload.duration === 'number' && payload.duration > 0) {
        const trueDuration = Math.round(payload.duration);
        if (currentSong && currentSong.id === payload.songId) {
          if (currentSong.duration !== trueDuration) {
            console.log(`[Duration Update] Authoritative sync for "${currentSong.title}": ${currentSong.duration}s -> ${trueDuration}s`);
            currentSong.duration = trueDuration;
            io.emit('track:duration_updated', { songId: currentSong.id, duration: trueDuration });
          }
        }
        const queuedSong = globalQueue.find((s) => s.id === payload.songId);
        if (queuedSong && queuedSong.duration !== trueDuration) {
          queuedSong.duration = trueDuration;
          io.emit('queue:updated', globalQueue);
          io.emit('track:duration_updated', { songId: queuedSong.id, duration: trueDuration });
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
      const activeCount = getActiveUserCount();
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
      const count = getActiveUserCount();
      socket.emit('state:sync', {
        currentSong,
        startedAt: currentSongStartedAt,
        seekSeconds: elapsed,
        serverTime: Date.now(),
        queue: globalQueue,
        listenerCount: count,
        strikeThreshold: getStrikeThreshold(),
        isSmallRoom: count <= 3,
        isLooping: count <= 1 && isLooping,
      });
    });

    // Handle loop toggle (available only when exactly 1 listener is online)
    socket.on('player:toggle_loop', (payload: { enabled?: boolean } | undefined, callback) => {
      const count = getActiveUserCount();
      if (count > 1) {
        isLooping = false;
        io.emit('loop:status', { isLooping: false, reason: 'multiuser_active' });
        if (callback) {
          callback({
            success: false,
            isLooping: false,
            error: 'Looping is only available when you are the only listener tuned in.',
          });
        }
        return;
      }

      if (typeof payload?.enabled === 'boolean') {
        isLooping = payload.enabled;
      } else {
        isLooping = !isLooping;
      }

      console.log(`[Radio Loop] 1-listener loop set to ${isLooping}`);
      io.emit('loop:status', { isLooping });
      if (callback) {
        callback({ success: true, isLooping });
      }
    });

    socket.on('disconnect', () => {
      socketUserMap.delete(socket.id);
      console.log(`[Socket] Listener disconnected: ${socket.id} (Remaining unique: ${getActiveUserCount()})`);
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
