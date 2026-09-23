import React, { useState } from 'react';
import { ListMusic, ShieldAlert, Clock, Flame, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Song } from '../types.ts';
import { formatTime } from '../utils/youtube.ts';

interface QueueSectionProps {
  queue: Song[];
  currentRemainingTime: number;
  onStrikeSong: (songId: string) => void;
}

export const QueueSection: React.FC<QueueSectionProps> = ({
  queue,
  currentRemainingTime,
  onStrikeSong,
}) => {
  const [removedAlert, setRemovedAlert] = useState<string | null>(null);

  // Calculate cumulative wait times for each queued song
  let cumulativeTime = currentRemainingTime;

  return (
    <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display flex items-center gap-2">
              <ListMusic className="w-6 h-6 text-amber-400" />
              <span>Up Next</span>
            </h2>
            <span className="text-xs font-mono font-medium bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full">
              {queue.length} {queue.length === 1 ? 'song' : 'songs'} in queue
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Democratic playlist curated by listeners tuned into SVNIT Radio
          </p>
        </div>

        <div className="text-xs font-mono text-neutral-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Queue runtime: ~{formatTime(queue.reduce((acc, s) => acc + s.duration, currentRemainingTime))}</span>
        </div>
      </div>

      {/* Mandatory Station Moderation Rule Text */}
      <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 mb-5 text-sm text-neutral-300 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-white font-semibold">Moderation Policy: </strong>
          Think a request doesn't belong? Strike it. Three different people striking a song pulls it from the queue.
        </p>
      </div>

      {/* Real-time alert notice */}
      {removedAlert && (
        <div className="mb-4 flex items-center justify-between text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 rounded-xl animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{removedAlert}</span>
          </div>
          <button
            onClick={() => setRemovedAlert(null)}
            className="text-neutral-400 hover:text-white font-mono text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Queue List */}
      {queue.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40">
          <ListMusic className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-neutral-300 font-display">The queue is empty!</h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            Be the first listener this hour to submit a YouTube track above to keep the SVNIT broadcast going.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((song, index) => {
            const startsIn = cumulativeTime;
            cumulativeTime += song.duration;
            const isStruckOut = song.strikes >= 3;
            const isCritical = song.strikes === 2;

            return (
              <div
                key={song.id}
                className={`group relative rounded-xl border transition-all duration-300 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isStruckOut
                    ? 'bg-rose-950/20 border-rose-900/50 opacity-60 line-through'
                    : isCritical
                    ? 'bg-rose-950/10 border-rose-900/30 hover:border-rose-800/60'
                    : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-950'
                }`}
              >
                {/* Left: Position, Thumbnail & Track Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-neutral-500 w-6 text-center shrink-0">
                    #{String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-neutral-800 shrink-0 bg-neutral-900">
                    <img
                      src={song.thumbnail}
                      alt={song.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${song.youtubeId}/hqdefault.jpg`;
                      }}
                    />
                    <div className="absolute bottom-0 right-0 left-0 bg-neutral-950/80 text-[10px] font-mono text-neutral-400 text-center py-0.5">
                      {formatTime(song.duration)}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white truncate font-display group-hover:text-amber-400 transition-colors">
                        {song.title}
                      </h4>
                      <a
                        href={song.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-500 hover:text-neutral-300 transition-colors shrink-0"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {song.artist}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-neutral-500 font-mono">
                      <span>req. by <span className="text-neutral-400">{song.requestedBy}</span></span>
                      <span>·</span>
                      <span className="text-amber-400/80">Starts in ~{formatTime(startsIn)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Strikes Counter Meter & Community Strike Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800/60">
                  {/* Strikes Counter Meter */}
                  <div
                    className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 px-2.5 py-1.5 rounded-lg"
                    title={`${song.strikes} of 3 community strikes required to remove track`}
                  >
                    <div className="flex items-center gap-1">
                      {[1, 2, 3].map((pip) => (
                        <span
                          key={pip}
                          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                            song.strikes >= pip
                              ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                              : 'bg-neutral-800 border border-neutral-700'
                          }`}
                        />
                      ))}
                    </div>
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        song.strikes === 2
                          ? 'text-rose-400 animate-pulse'
                          : song.strikes === 1
                          ? 'text-amber-400'
                          : 'text-neutral-400'
                      }`}
                    >
                      {song.strikes}/3 strikes
                    </span>
                  </div>

                  {/* Interactive Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Primary Strike Button */}
                    <button
                      onClick={() => {
                        if (!song.struckByMe) {
                          onStrikeSong(song.id);
                          if (song.strikes + 1 >= 3) {
                            setRemovedAlert(`"${song.title}" received 3 strikes and is being removed by the server.`);
                          }
                        }
                      }}
                      disabled={song.struckByMe}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                        song.struckByMe
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-default'
                          : 'bg-neutral-800 text-neutral-200 hover:text-white hover:bg-rose-950/60 hover:border-rose-600/60 border border-neutral-700 active:scale-95 shadow-sm'
                      }`}
                      title={
                        song.struckByMe
                          ? 'You have already recorded your 1 vote for this track'
                          : 'Strike this song (3 strikes remove it from the global station queue)'
                      }
                    >
                      {song.struckByMe ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Struck (1/1)</span>
                        </>
                      ) : (
                        <>
                          <Flame className="w-3.5 h-3.5 text-rose-400" />
                          <span>Strike Track</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
