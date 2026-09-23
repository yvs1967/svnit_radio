import React, { useState, useEffect } from 'react';
import { Youtube, Plus, AlertCircle, Clock, CheckCircle2, Loader2, HelpCircle, ShieldBan } from 'lucide-react';
import { extractYouTubeId, isValidYouTubeUrl, fetchYouTubeOEmbed, OEmbedResult, checkTitleAllowed, FORBIDDEN_TITLE_WORDS } from '../utils/youtube.ts';
import { Song } from '../types.ts';

interface RequestSectionProps {
  onAddSong?: (song: Omit<Song, 'id' | 'requestedAt' | 'strikes' | 'struckByMe' | 'status'>) => void;
  onSubmitRequest?: (url: string) => Promise<{ success: boolean; error?: string; remainingSeconds?: number; song?: any }>;
  cooldownSeconds: number;
}

export const RequestSection: React.FC<RequestSectionProps> = ({
  onAddSong,
  onSubmitRequest,
  cooldownSeconds,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<OEmbedResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [titleRejectedWord, setTitleRejectedWord] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Sample songs for immediate testing (including one with forbidden title to test filter)
  const sampleLinks = [
    { title: 'Chilled Cow Lo-Fi Session', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    { title: 'Acoustic Guitar Melodies', url: 'https://www.youtube.com/watch?v=5qap5aO4i9A' },
    { title: 'Synthwave Night Drive', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
  ];

  // Validate on URL change with debounce
  useEffect(() => {
    if (!urlInput.trim()) {
      setPreviewData(null);
      setErrorMsg(null);
      setTitleRejectedWord(null);
      return;
    }

    if (!isValidYouTubeUrl(urlInput)) {
      setErrorMsg('Please enter a valid YouTube video or music URL');
      setPreviewData(null);
      setTitleRejectedWord(null);
      return;
    }

    setErrorMsg(null);
    setTitleRejectedWord(null);
    setIsLoading(true);

    const timer = setTimeout(async () => {
      const data = await fetchYouTubeOEmbed(urlInput);
      setIsLoading(false);
      if (data) {
        // Run title filtering: reject if contains 'vlog', 'trailer', 'gameplay', or 'episode'
        const filterResult = checkTitleAllowed(data.title);
        if (!filterResult.allowed) {
          setTitleRejectedWord(filterResult.matchedWord || 'restricted term');
          setErrorMsg(`Submission rejected: Title contains prohibited keyword "${filterResult.matchedWord}". Radio allows music tracks only (no vlogs, trailers, gameplay, or episodes).`);
          setPreviewData(null);
          return;
        }

        setPreviewData(data);
      } else {
        setErrorMsg('Could not retrieve YouTube track info. Check the link.');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [urlInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidYouTubeUrl(urlInput)) {
      setErrorMsg('Invalid YouTube URL');
      return;
    }

    if (cooldownSeconds > 0) {
      setErrorMsg(`Cooldown active. Each listener can request 1 song per hour. Please wait ${Math.ceil(cooldownSeconds / 60)} minutes.`);
      return;
    }

    const videoId = extractYouTubeId(urlInput)!;
    const title = previewData?.title || `YouTube Audio #${videoId.slice(0, 6)}`;

    // Title filtering check
    const filterResult = checkTitleAllowed(title);
    if (!filterResult.allowed) {
      setTitleRejectedWord(filterResult.matchedWord || 'restricted term');
      setErrorMsg(`Submission rejected: Title contains prohibited keyword "${filterResult.matchedWord}". Only music tracks are allowed.`);
      return;
    }

    // If multiplayer backend submission callback is provided
    if (onSubmitRequest) {
      setIsLoading(true);
      const res = await onSubmitRequest(urlInput);
      setIsLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to submit request');
        return;
      }

      setUrlInput('');
      setPreviewData(null);
      setTitleRejectedWord(null);
      setSuccessNotice(`"${res.song?.title || title}" added to the global multiplayer queue!`);
      setTimeout(() => setSuccessNotice(null), 4000);
      return;
    }

    // Fallback to local onAddSong
    const artist = previewData?.author_name || 'YouTube Creator';
    const thumbnail = previewData?.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    if (onAddSong) {
      onAddSong({
        title,
        artist,
        youtubeUrl: urlInput,
        youtubeId: videoId,
        thumbnail,
        duration: 270,
        requestedBy: requesterName.trim() ? `@${requesterName.trim().replace(/^@/, '')}` : '@anonymous_listener',
      });
    }

    setUrlInput('');
    setPreviewData(null);
    setTitleRejectedWord(null);
    setSuccessNotice(`"${title}" submitted to the queue!`);
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
    } catch {
      // Clipboard permission denied
    }
  };

  const formatCooldown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-sm relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display flex items-center gap-2">
            <Youtube className="w-6 h-6 text-red-500" />
            <span>Request a Song</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Add your favorite track to the synced broadcast for everyone
          </p>
        </div>

        {/* Hourly Cooldown status badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          {cooldownSeconds > 0 ? (
            <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded">
              Hourly Limit: {formatCooldown(cooldownSeconds)} left
            </span>
          ) : (
            <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded">
              Request Ready (1 / hour)
            </span>
          )}
        </div>
      </div>

      {/* Mandatory Helper Text from Prompt */}
      <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 mb-5 text-sm text-neutral-300 flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-white font-semibold">Station Rule: </strong>
          Everyone gets one request every hour. Paste a YouTube link to a song. Requests can be up to 15 minutes long, and anything still going after 7 minutes gets skipped.
        </p>
      </div>

      {/* Request Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 relative">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste YouTube song link (e.g. https://www.youtube.com/watch?v=...)"
              className="w-full bg-neutral-950 border border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white placeholder-neutral-500 px-4 py-3 rounded-xl text-sm transition-all pr-20"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-2 top-2 bottom-2 px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors flex items-center"
            >
              Paste
            </button>
          </div>

          <div className="sm:col-span-4">
            <input
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Your name / SVNIT handle (optional)"
              className="w-full bg-neutral-950 border border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white placeholder-neutral-500 px-4 py-3 rounded-xl text-sm transition-all"
            />
          </div>
        </div>

        {/* Loading / Error / Success States */}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Validating link with YouTube oEmbed & verifying title filters...</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 rounded-xl">
            <ShieldBan className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold text-rose-200">Validation Filter: </span>
              <span>{errorMsg}</span>
              {titleRejectedWord && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-rose-400">
                  <span className="px-1.5 py-0.2 rounded bg-rose-950/60 border border-rose-800">
                    Prohibited keyword matched: &ldquo;{titleRejectedWord}&rdquo;
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Title Filter Policy Notice */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500 font-mono">
          <span className="text-neutral-400">Automated Title Filters:</span>
          {FORBIDDEN_TITLE_WORDS.map((word) => (
            <span key={word} className="px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-400">
              no &ldquo;{word}&rdquo;
            </span>
          ))}
        </div>

        {successNotice && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Live YouTube oEmbed Preview Card */}
        {previewData && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={previewData.thumbnail_url}
                alt={previewData.title}
                referrerPolicy="no-referrer"
                className="w-16 h-12 object-cover rounded-lg border border-neutral-700 shrink-0"
              />
              <div className="min-w-0">
                <span className="text-[11px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  YouTube oEmbed Verified
                </span>
                <p className="text-sm font-semibold text-white truncate font-display">
                  {previewData.title}
                </p>
                <p className="text-xs text-neutral-400 truncate">
                  {previewData.author_name} · Est. Duration: ~4:30 (Under 15m limit)
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={cooldownSeconds > 0}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                cooldownSeconds > 0
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/20'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Queue Song</span>
            </button>
          </div>
        )}

        {/* Actions bar: Submit button, Cooldown bypass toggle for testing, and Quick Samples */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Quick preset buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500 text-[11px] font-mono">Quick test links:</span>
            {sampleLinks.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setUrlInput(sample.url)}
                className="text-neutral-400 hover:text-amber-400 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 px-2.5 py-1 rounded text-xs transition-colors"
              >
                {sample.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUrlInput('https://www.youtube.com/watch?v=kNNZ8s0QG84&t=test_trailer')}
              className="text-rose-400/80 hover:text-rose-300 bg-neutral-950 border border-rose-900/40 hover:border-rose-700 px-2.5 py-1 rounded text-xs transition-colors"
              title="Test filter rejection with a trailer keyword"
            >
              Test Filter: &ldquo;Official Movie Trailer&rdquo;
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!previewData && (
              <button
                type="submit"
                disabled={!urlInput.trim() || cooldownSeconds > 0}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                  !urlInput.trim() || cooldownSeconds > 0
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/20'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Submit Request</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
};
