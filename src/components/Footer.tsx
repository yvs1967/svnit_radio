import React from 'react';
import { Radio, Github, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-neutral-800/80 bg-neutral-950 py-12 px-4 sm:px-6 lg:px-8 mt-16 text-neutral-400">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Brand & Mission */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Radio className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-base tracking-tight font-display">
                SVNIT Radio!
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-sm">
              A collaborative, democratic web radio station run by whoever's listening.
            </p>
            <p className="text-[11px] text-neutral-500">
              © {new Date().getFullYear()} SVNIT Radio Community · All music belongs to respective YouTube creators.
            </p>
          </div>

          {/* Campus Broadcast Info */}
          <div className="md:col-span-4 space-y-2">
            <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
              Synchronized Campus Audio
            </h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Real-time synchronized broadcast engineered to listen where ever you are. Every listener hears the exact same audio stream at the exact same second with crowd-sourced queue moderation.
            </p>
          </div>

          {/* YouTube oEmbed Credit & Link Validation */}
          <div className="md:col-span-3 space-y-2">
            <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
              Metadata & Link Validation
            </h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Song validation and rich metadata previews are powered directly by the official <span className="text-amber-400 font-medium">YouTube oEmbed API</span>, ensuring verified song titles and thumbnails without requiring private developer API keys.
            </p>
          </div>
        </div>

        {/* Hairline Divider & Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>Broadcasting live, Right here</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Built by Venkata Subbaiah (Using AI Studio)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
