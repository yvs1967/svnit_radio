import React from 'react';
import { Radio, Users, Sparkles, Volume2 } from 'lucide-react';

interface HeaderProps {
  listenersCount: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  listenersCount,
  isPlaying,
  onTogglePlay,
}) => {
  return (
    <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
      {/* Top 3-Zone Navigation Bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Clean Brand Wordmark */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Radio className="w-5 h-5" />
          </div>
          <a href="#" className="text-xl font-bold tracking-tight text-white flex items-center gap-2 font-display">
            <span>SVNIT Radio</span>
            <span className="text-xs font-mono font-normal text-neutral-400 border border-neutral-800 rounded px-1.5 py-0.5">FM</span>
          </a>
        </div>

        {/* Zone 2: Station Status Indicators */}
        <div className="hidden md:flex items-center gap-6 text-sm text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <span className="font-medium text-neutral-200">
              {isPlaying ? 'ON AIR' : 'BROADCAST STANDBY'}
            </span>
          </div>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <Users className="w-3.5 h-3.5 text-neutral-400" />
            <span className="tabular-nums text-neutral-300 font-semibold">{listenersCount}</span>
            <span>tuned in</span>
          </div>
          <span className="text-neutral-700">|</span>
          <span className="text-xs text-neutral-400">Surat, Gujarat</span>
        </div>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              isPlaying
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-md shadow-amber-500/10'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isPlaying ? 'Live Audio Active' : 'Sync Audio'}</span>
          </button>
        </div>
      </div>

      {/* Hero Header Banner with Exact Prompt Titles */}
      <div className="border-t border-neutral-900 bg-gradient-to-b from-neutral-900/60 to-neutral-950 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400 tracking-wider uppercase mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Campus Collaborative Stream · SVNIT Surat</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white font-display text-balance">
              SVNIT Radio!
            </h1>
            <p className="mt-2 text-base sm:text-lg text-neutral-400 max-w-2xl text-balance">
              A radio station run by whoever's listening.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono">
            <span className="px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
              Synced Clock: 0.0s delay
            </span>
            <span className="hidden sm:inline px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
              Max 7m / Track
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
