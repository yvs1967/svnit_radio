/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { PlayerStatus } from './components/PlayerStatus.tsx';
import { RequestSection } from './components/RequestSection.tsx';
import { QueueSection } from './components/QueueSection.tsx';
import { Footer } from './components/Footer.tsx';
import { Song } from './types.ts';
import { ytAudioService } from './utils/youtubePlayerService.ts';
import { radioSocket, SyncPayload, TrackChangedPayload } from './utils/socketClient.ts';
import { Users, Radio, Sparkles, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

import studioDeskImage from './assets/images/radio_broadcast_desk_1790160475499.jpg';
import currentArtImage from './assets/images/current_track_art_1790160494237.jpg';

// Curated campus track fallback
const INITIAL_CURRENT_SONG: Song = {
  id: 'current-01',
  title: 'Coke Studio | Pasoori | Ali Sethi x Shae Gill',
  artist: 'Coke Studio Pakistan',
  youtubeUrl: 'https://www.youtube.com/watch?v=5Eqb_-j3FDA',
  youtubeId: '5Eqb_-j3FDA',
  thumbnail: 'https://img.youtube.com/vi/5Eqb_-j3FDA/hqdefault.jpg',
  duration: 228,
  requestedBy: '@svnit_radio_desk',
  requestedAt: new Date(),
  strikes: 0,
  struckByMe: false,
  status: 'playing',
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynced, setIsSynced] = useState(true);
  const [listenersCount, setListenersCount] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSong, setCurrentSong] = useState<Song>(INITIAL_CURRENT_SONG);
  const [queue, setQueue] = useState<Song[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [liveNotice, setLiveNotice] = useState<{ title: string; message: string; type: 'info' | 'warn' | 'success' } | null>(null);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;

  // 1. Connect to Backend WebSocket & Register Multiplayer Event Handlers
  useEffect(() => {
    const socket = radioSocket.connect();
    const myUserId = radioSocket.getUserId();

    // Initialize YouTube hidden audio player API
    ytAudioService.init({
      onTrackEnded: () => {
        // Server authority handles the rotation, but if client track ends, ask for sync
        radioSocket.requestSync();
      },
      onError: (code) => {
        console.warn('YouTube playback warning code:', code);
        radioSocket.requestSync();
      },
    });

    // Handle full state sync from server (on connect, reconnect, or request)
    socket.on('state:sync', (payload: SyncPayload) => {
      console.log('🔄 Radio State Synced from Server:', payload);
      if (payload.currentSong) {
        setCurrentSong({
          ...payload.currentSong,
          struckByMe: payload.currentSong.struckByUsers?.includes(myUserId) || false,
        });
      }

      if (payload.queue) {
        setQueue(
          payload.queue.map((s) => ({
            ...s,
            struckByMe: s.struckByUsers?.includes(myUserId) || false,
          }))
        );
      }

      setListenersCount(payload.listenerCount || 1);
      setCurrentTime(payload.seekSeconds || 0);

      // If user has already clicked Play, seek hidden YouTube player to the exact server second
      if (isPlayingRef.current && payload.currentSong) {
        ytAudioService.playVideo(payload.currentSong.youtubeId, payload.seekSeconds || 0);
      }
    });

    // Real-time listener count broadcast
    socket.on('listeners:count', (count: number) => {
      setListenersCount(count);
    });

    // Authoritative Track Change from server (e.g. 7-minute skip or track finish)
    socket.on('track:changed', (payload: TrackChangedPayload) => {
      console.log('📻 Authoritative Track Change:', payload);
      setCurrentSong({
        ...payload.currentSong,
        struckByMe: false,
      });
      setCurrentTime(0);

      if (isPlayingRef.current && payload.currentSong) {
        ytAudioService.playVideo(payload.currentSong.youtubeId, 0);
      }

      if (payload.reason === 'skipped_7min') {
        showNotice('7-Minute Rule Triggered', 'Track played for 7 minutes and was automatically rotated to keep the station fresh.', 'warn');
      } else {
        showNotice('Now Playing', `"${payload.currentSong.title}" is now broadcasting live on SVNIT Radio.`, 'info');
      }
    });

    // Global queue updates (when a song is added, struck, or pulled)
    socket.on('queue:updated', (updatedQueue: any[]) => {
      setQueue(
        updatedQueue.map((s) => ({
          ...s,
          struckByMe: s.struckByUsers?.includes(myUserId) || false,
        }))
      );
    });

    // Notification when another user queues a song
    socket.on('notification:new_request', (data: { title: string; requestedBy: string }) => {
      showNotice('New Song Queued', `${data.requestedBy} added "${data.title}" to Up Next`, 'success');
    });

    // Notification when a song reaches 3 strikes and is removed
    socket.on('notification:song_pulled', (data: { songTitle: string; reason: string }) => {
      showNotice('Song Pulled from Air', `"${data.songTitle}" reached 3 community strikes and was removed from the queue.`, 'warn');
    });

    return () => {
      socket.off('state:sync');
      socket.off('listeners:count');
      socket.off('track:changed');
      socket.off('queue:updated');
      socket.off('notification:new_request');
      socket.off('notification:song_pulled');
    };
  }, []);

  const showNotice = (title: string, message: string, type: 'info' | 'warn' | 'success') => {
    setLiveNotice({ title, message, type });
    setTimeout(() => setLiveNotice(null), 5000);
  };

  // Play / Pause toggle with synchronized YouTube stream audio
  const handleTogglePlay = async () => {
    if (!isPlaying) {
      setIsPlaying(true);
      setIsSynced(true);

      // Request fresh timestamp sync right when user tunes in
      radioSocket.requestSync();

      // Configure volume and unmute YouTube player
      ytAudioService.setVolume(isMuted ? 0 : volume);
      ytAudioService.unMute();

      // Play YouTube audio synced to current authoritative second
      ytAudioService.playVideo(currentSong.youtubeId, currentTime);
    } else {
      setIsPlaying(false);
      ytAudioService.pause();
    }
  };

  // Toggle visible on-air video monitor
  const handleToggleVideoMonitor = () => {
    const nextState = ytAudioService.toggleVideoVisible();
    setIsVideoVisible(nextState);
  };

  // Volume slider handler
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (isMuted && newVol > 0) {
      setIsMuted(false);
      ytAudioService.unMute();
    }
    ytAudioService.setVolume(isMuted ? 0 : newVol);
  };

  // Mute toggle handler
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (nextMute) {
      ytAudioService.mute();
    } else {
      ytAudioService.unMute();
      ytAudioService.setVolume(volume);
    }
  };

  // Authoritative second-by-second ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const nextTime = prev + 1;
        // Visual cap matching the 7-minute threshold (420s)
        const maxLimit = Math.min(420, currentSong.duration || 420);
        return Math.min(nextTime, maxLimit);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSong]);

  // Hourly cooldown timer countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Handle song submission to multiplayer backend
  const handleSubmitRequest = async (url: string) => {
    const res = await radioSocket.submitSongRequest(url, false);
    if (res.success) {
      setCooldownSeconds(3600); // 1-hour cooldown
    } else if (res.remainingSeconds) {
      setCooldownSeconds(res.remainingSeconds);
    }
    return res;
  };

  // Handle song strike
  const handleStrikeSong = async (songId: string) => {
    const res = await radioSocket.strikeSong(songId);
    if (!res.success && res.error) {
      showNotice('Strike Notice', res.error, 'warn');
    } else if (res.pulled) {
      showNotice('Community Moderation', 'Song reached 3 strikes and was automatically removed from the global queue!', 'warn');
    }
  };

  const currentRemainingTime = Math.max(0, Math.min(420, currentSong.duration || 420) - currentTime);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-neutral-950">
      {/* Top Header */}
      <Header
        listenersCount={listenersCount}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
      />

      {/* Live Multiplayer Status Bar */}
      <div className="bg-neutral-900/80 border-b border-neutral-800/80 py-2 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              MULTIPLAYER AUDIO SYNC: ACTIVE
            </span>
            <span className="text-neutral-600 hidden sm:inline">|</span>
            <span className="text-neutral-400 font-mono hidden sm:flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-neutral-400" />
              <span>{listenersCount} {listenersCount === 1 ? 'person' : 'people'} listening in sync</span>
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-400">
            <span className="text-amber-400/90 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>7-Min Max per Track</span>
            </span>
            <span>·</span>
            <span className="text-neutral-300">Your Handle: <strong className="text-white">{radioSocket.getUserHandle()}</strong></span>
          </div>
        </div>
      </div>

      {/* Multiplayer Live Notification Toast */}
      {liveNotice && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4 w-full">
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all shadow-lg animate-fade-in ${
              liveNotice.type === 'warn'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : liveNotice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-neutral-900 border-neutral-700 text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {liveNotice.type === 'warn' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : liveNotice.type === 'success' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Radio className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-bold uppercase tracking-wider font-mono mr-1.5">
                  [{liveNotice.title}]:
                </span>
                <span>{liveNotice.message}</span>
              </div>
            </div>
            <button
              onClick={() => setLiveNotice(null)}
              className="text-neutral-400 hover:text-white text-xs ml-4 font-mono"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Responsive Layout */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 space-y-8">
        {/* Studio Atmosphere Highlight Banner */}
        <div className="relative rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-900/40">
          <div className="absolute inset-0 z-0">
            <img
              src={studioDeskImage}
              alt="SVNIT Radio Broadcast Studio Desk"
              className="w-full h-full object-cover opacity-20 filter contrast-125 saturate-50"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-transparent" />
          </div>

          <div className="relative z-10 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>COMMUNITY BROADCAST DESK · SVNIT SURAT</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                No Algorithms. No Commercials. Pure SVNIT.
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-xl">
                Every track you hear is shared live across all browsers. The server maintains the global queue, syncs audio to the exact second, and advances tracks every 7 minutes.
              </p>
            </div>
          </div>
        </div>

        {/* 1. Player Status Section */}
        <PlayerStatus
          isPlaying={isPlaying}
          isSynced={isSynced}
          listenersCount={listenersCount}
          currentSong={currentSong}
          currentTime={currentTime}
          volume={volume}
          isMuted={isMuted}
          isVideoVisible={isVideoVisible}
          onTogglePlay={handleTogglePlay}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleVideoMonitor={handleToggleVideoMonitor}
        />

        {/* 2. Request Section */}
        <RequestSection
          onSubmitRequest={handleSubmitRequest}
          cooldownSeconds={cooldownSeconds}
        />

        {/* 3. Queue Section ('Up Next') */}
        <QueueSection
          queue={queue}
          currentRemainingTime={currentRemainingTime}
          onStrikeSong={handleStrikeSong}
        />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
