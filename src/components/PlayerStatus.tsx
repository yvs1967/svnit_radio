import React from 'react';
import { Play, Pause, Radio, Volume2, VolumeX, Music2, AlertCircle, Tv } from 'lucide-react';
import { Song } from '../types.ts';
import { formatTime } from '../utils/youtube.ts';
import defaultCover from '../assets/images/current_track_art_1790160494237.jpg';

interface PlayerStatusProps {
  isPlaying: boolean;
  isSynced: boolean;
  listenersCount: number;
  currentSong: Song;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  isVideoVisible?: boolean;
  onTogglePlay: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleVideoMonitor?: () => void;
}

export const PlayerStatus: React.FC<PlayerStatusProps> = ({
  isPlaying,
  isSynced,
  listenersCount,
  currentSong,
  currentTime,
  volume,
  isMuted,
  isVideoVisible = false,
  onTogglePlay,
  onVolumeChange,
  onToggleMute,
  onToggleVideoMonitor,
}) => {
  const duration = currentSong.duration || 300;
  const progressPercent = Math.min(100, (currentTime / duration) * 100);
  const maxThresholdSeconds = 420; // 7 minutes
  const thresholdPercent = Math.min(100, (maxThresholdSeconds / duration) * 100);

  return (
    <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
      {/* Background glow accent */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Status Bar: Listeners tuned in & Synced status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="relative flex h-3.5 w-3.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-neutral-500'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${isPlaying ? 'bg-emerald-500' : 'bg-neutral-500'}`}></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
                {listenersCount}
              </span>
              <span className="text-sm font-medium text-neutral-300">
                listeners tuned in right now
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Synced playback across SVNIT campus & online stream
            </p>
          </div>
        </div>

        {/* Big Interactive "Click to Play/Sync Audio" Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className={`group flex items-center gap-2.5 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg ${
              isPlaying
                ? 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700 border border-neutral-700'
                : 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98]'
            }`}
            aria-label={isPlaying ? 'Pause station audio' : 'Click to Play/Sync Audio'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause Audio</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono ml-1">
                  Synced
                </span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Click to Play / Sync Audio</span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950/40 text-amber-900 border border-amber-900/30 font-mono ml-1">
                  Required
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Player Display: Album Art, Info, Equalizer Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-center">
        {/* Cover Artwork & Turntable Spin */}
        <div className="lg:col-span-4 flex items-center gap-4">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-neutral-700 shadow-md bg-neutral-950 relative">
              <img
                src={currentSong.thumbnail || defaultCover}
                alt={currentSong.title}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = defaultCover;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            {/* Vinyl record disc peeking out when playing */}
            <div
              className={`absolute -right-3 top-2 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-neutral-950 border-2 border-neutral-800 -z-10 shadow-lg flex items-center justify-center transition-transform duration-500 ${
                isPlaying ? 'translate-x-3 animate-vinyl' : 'translate-x-0'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-neutral-950" />
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                <Music2 className="w-3 h-3" />
                Now Playing
              </span>
              <span className="text-neutral-700">·</span>
              <span className="text-[11px] font-mono text-neutral-400 truncate">
                Req. by {currentSong.requestedBy}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white truncate font-display leading-tight" title={currentSong.title}>
              {currentSong.title}
            </h3>
            <p className="text-sm text-neutral-400 truncate mt-0.5">
              {currentSong.artist}
            </p>
            <div className="mt-2 text-xs text-neutral-500 flex items-center gap-2">
              <span className="font-mono text-neutral-400">Stream Source:</span>
              <a
                href={currentSong.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-400 hover:text-amber-400 underline decoration-neutral-700 transition-colors truncate max-w-[200px]"
              >
                YouTube verified
              </a>
            </div>
          </div>
        </div>

        {/* Visual Audio Visualizer Animation */}
        <div className="lg:col-span-4 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 flex flex-col justify-between h-28">
          <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>LIVE AUDIO VISUALIZER</span>
            </div>
            <span className={isPlaying ? 'text-emerald-400' : 'text-neutral-500'}>
              {isPlaying ? 'ACTIVE FREQUENCY' : 'MUTED / STANDBY'}
            </span>
          </div>

          {/* Equalizer Bars Spectrum */}
          <div className="flex items-end justify-between gap-1 sm:gap-1.5 h-14 px-2">
            {[
              'animate-eq-1', 'animate-eq-3', 'animate-eq-2', 'animate-eq-4',
              'animate-eq-5', 'animate-eq-2', 'animate-eq-4', 'animate-eq-1',
              'animate-eq-3', 'animate-eq-5', 'animate-eq-2', 'animate-eq-4',
              'animate-eq-1', 'animate-eq-3', 'animate-eq-4', 'animate-eq-2',
            ].map((animClass, idx) => (
              <div
                key={idx}
                className="w-full bg-neutral-800 rounded-t-sm overflow-hidden flex flex-col justify-end"
                style={{ height: '100%' }}
              >
                <div
                  className={`w-full rounded-t-sm transition-all duration-150 ${
                    isPlaying
                      ? `${animClass} bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.4)]`
                      : 'h-1.5 bg-neutral-700'
                  }`}
                  style={{
                    animationDelay: `${(idx % 6) * 0.12}s`,
                    minHeight: '4px',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Volume & Sync Controls */}
        <div className="lg:col-span-4 flex flex-col justify-between h-28 bg-neutral-950/40 border border-neutral-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
            <span>CLIENT AUDIO CONTROL</span>
            <span className="text-neutral-500">Latency: ~24ms</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onToggleMute}
              className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-neutral-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              aria-label="Volume slider"
            />
            <span className="font-mono text-xs text-neutral-400 w-9 text-right tabular-nums">
              {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>

          <div className="text-[11px] text-neutral-400 flex items-center justify-between">
            {onToggleVideoMonitor && (
              <button
                onClick={onToggleVideoMonitor}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                  isVideoVisible
                    ? 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                    : 'text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
                title="Toggle live YouTube video preview monitor"
              >
                <Tv className="w-3 h-3" />
                <span>{isVideoVisible ? 'Hide Video Monitor' : 'Video Monitor'}</span>
              </button>
            )}
            <button
              onClick={() => {
                if (!isPlaying) onTogglePlay();
              }}
              className="hover:text-amber-400 underline decoration-neutral-700 transition-colors"
            >
              Re-sync buffer
            </button>
          </div>
        </div>
      </div>

      {/* Synced Timeline Scrubber with 7-min Limit Rule Display */}
      <div className="mt-6 pt-4 border-t border-neutral-800/80">
        <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-neutral-200 font-semibold tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-neutral-600">/</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Rule: Auto-skips at 7:00 threshold</span>
          </div>
        </div>

        {/* Progress Track */}
        <div className="relative w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
          {/* 7-min skip threshold marker line */}
          {duration > maxThresholdSeconds && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
              style={{ left: `${thresholdPercent}%` }}
              title="7-minute automatic skip cutoff"
            />
          )}

          {/* Current progress fill */}
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
};
