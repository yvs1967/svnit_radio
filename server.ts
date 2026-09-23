import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube title filtering forbidden terms
const FORBIDDEN_WORDS = ['vlog', 'trailer', 'gameplay', 'episode'];

// Default curated campus radio tracks
const DEFAULT_TRACKS = [
  {
    title: 'Coke Studio | Pasoori | Ali Sethi x Shae Gill',
    artist: 'Coke Studio Pakistan',
    youtubeId: '5Eqb_-j3FDA',
    youtubeUrl: 'https://www.youtube.com/watch?v=5Eqb_-j3FDA',
    thumbnail: 'https://img.youtube.com/vi/5Eqb_-j3FDA/hqdefault.jpg',
    duration: 228,
    requestedBy: '@svnit_radio_desk',
  },
  {
    title: 'Ed Sheeran - Shape of You (Official Music Video)',
    artist: 'Ed Sheeran',
    youtubeId: 'JGwWNGJdvx8',
    youtubeUrl: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
    thumbnail: 'https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    duration: 234,
    requestedBy: '@priya_ece',
  },
  {
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    artist: 'Luis Fonsi',
    youtubeId: 'kJQP7kiw5Fk',
    youtubeUrl: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    duration: 282,
    requestedBy: '@rohit_mech',
  },
  {
    title: 'Queen - Bohemian Rhapsody (Official Video)',
    artist: 'Queen',
    youtubeId: 'fJ9rUzIMcZQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
    thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
    duration: 359,
    requestedBy: '@neha_cs',
  },
];

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

// Global server state
let currentSong: ServerSong = {
  ...DEFAULT_TRACKS[0],
  id: `track-${Date.now()}`,
  requestedAt: Date.now() - 60000,
  strikes: 0,
  struckByUsers: [],
  status: 'playing',
};

let currentSongStartedAt: number = Date.now() - 60000; // current playback start time
let globalQueue: ServerSong[] = DEFAULT_TRACKS.slice(1).map((track, i) => ({
  ...track,
  id: `queued-${Date.now()}-${i}`,
  requestedAt: Date.now() - (300000 * (i + 1)),
  strikes: 0,
  struckByUsers: [],
  status: 'queued',
}));

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
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('oEmbed fetch error:', e);
  }
  return null;
}

function rotateToNextSong(io: Server, reason: 'finished' | 'skipped_7min' | 'manual' = 'finished') {
  if (globalQueue.length > 0) {
    const nextSong = globalQueue.shift()!;
    nextSong.status = 'playing';
    currentSong = nextSong;
  } else {
    // Loop through default curated station tracks
    const randomDefault = DEFAULT_TRACKS[Math.floor(Math.random() * DEFAULT_TRACKS.length)];
    currentSong = {
      ...randomDefault,
      id: `station-${Date.now()}`,
      requestedAt: Date.now(),
      strikes: 0,
      struckByUsers: [],
      status: 'playing',
    };
  }

  currentSongStartedAt = Date.now();
  console.log(`[Radio Rotation] Switched to "${currentSong.title}" (${reason}). Broadcasted to all listeners.`);

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

  const broadcastListenerCount = () => {
    const count = Math.max(1, activeSockets.size);
    io.emit('listeners:count', count);
  };

  // 1-second interval for "7-minute rule" & duration auto-rotation
  setInterval(() => {
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
    const elapsedSeconds = Math.floor((Date.now() - currentSongStartedAt) / 1000);
    res.json({
      currentSong,
      startedAt: currentSongStartedAt,
      elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: Math.max(1, activeSockets.size),
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
    const elapsedSeconds = Math.floor((Date.now() - currentSongStartedAt) / 1000);
    socket.emit('state:sync', {
      currentSong,
      startedAt: currentSongStartedAt,
      seekSeconds: elapsedSeconds,
      serverTime: Date.now(),
      queue: globalQueue,
      listenerCount: Math.max(1, activeSockets.size),
    });

    // Handle user song request
    socket.on('song:request', async (payload: { url: string; userId: string; username?: string; bypassCooldown?: boolean }, callback) => {
      try {
        const { url, userId, username, bypassCooldown } = payload;
        const rateLimitKey = userId || clientIp;

        // 1. Rate Limiting: 1 song per hour
        if (!bypassCooldown && userRateLimits.has(rateLimitKey)) {
          const lastRequestTime = userRateLimits.get(rateLimitKey)!;
          const elapsed = (Date.now() - lastRequestTime) / 1000;
          if (elapsed < RATE_LIMIT_SECONDS) {
            const remaining = Math.ceil(RATE_LIMIT_SECONDS - elapsed);
            if (callback) {
              callback({
                success: false,
                error: `Rate limit: You can only request 1 song per hour. Please wait ${Math.floor(remaining / 60)}m ${remaining % 60}s.`,
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

        // 5. Append to Global Queue
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

        globalQueue.push(newSong);
        userRateLimits.set(rateLimitKey, Date.now());

        // Broadcast updated queue to all connected clients
        io.emit('queue:updated', globalQueue);
        io.emit('notification:new_request', {
          title: newSong.title,
          requestedBy: newSong.requestedBy,
        });

        if (callback) {
          callback({ success: true, song: newSong, remainingCooldown: RATE_LIMIT_SECONDS });
        }
      } catch (err: any) {
        console.error('[Error] song:request failed:', err);
        if (callback) {
          callback({ success: false, error: 'Internal server error while processing request.' });
        }
      }
    });

    // Handle song strike (3 strikes removes it)
    socket.on('song:strike', (payload: { songId: string; userId: string; peerId?: string }, callback) => {
      const { songId, userId, peerId } = payload;
      const strikeUserId = peerId || userId || clientIp;

      const targetIndex = globalQueue.findIndex((s) => s.id === songId);
      if (targetIndex === -1) {
        if (callback) callback({ success: false, error: 'Song not found in queue.' });
        return;
      }

      const song = globalQueue[targetIndex];

      // Check if this user already struck this song
      if (song.struckByUsers.includes(strikeUserId)) {
        if (callback) callback({ success: false, error: 'You have already struck this song.' });
        return;
      }

      song.struckByUsers.push(strikeUserId);
      song.strikes = song.struckByUsers.length;

      // 3 strikes: pull from queue!
      if (song.strikes >= 3) {
        globalQueue.splice(targetIndex, 1);
        io.emit('queue:updated', globalQueue);
        io.emit('notification:song_pulled', {
          songTitle: song.title,
          reason: 'Received 3 listener strikes and was pulled from the air.',
        });
        if (callback) callback({ success: true, pulled: true });
        return;
      }

      io.emit('queue:updated', globalQueue);
      if (callback) callback({ success: true, strikes: song.strikes });
    });

    // Client requests re-sync (e.g. after user interacts with play button)
    socket.on('sync:request', () => {
      const elapsed = Math.floor((Date.now() - currentSongStartedAt) / 1000);
      socket.emit('state:sync', {
        currentSong,
        startedAt: currentSongStartedAt,
        seekSeconds: elapsed,
        serverTime: Date.now(),
        queue: globalQueue,
        listenerCount: Math.max(1, activeSockets.size),
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
