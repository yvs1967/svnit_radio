// YouTube URL Parser and oEmbed validator

export interface OEmbedResult {
  title: string;
  author_name: string;
  thumbnail_url: string;
  html?: string;
  provider_name?: string;
}

// Forbidden words in title as required: 'vlog', 'trailer', 'gameplay', or 'episode'
export const FORBIDDEN_TITLE_WORDS = ['vlog', 'trailer', 'gameplay', 'episode'] as const;

export function checkTitleAllowed(title: string): { allowed: boolean; matchedWord?: string } {
  if (!title) return { allowed: true };
  const lower = title.toLowerCase();
  for (const word of FORBIDDEN_TITLE_WORDS) {
    // Word boundary or containment check
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lower) || lower.includes(word)) {
      return { allowed: false, matchedWord: word };
    }
  }
  return { allowed: true };
}

export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();

  // Handle standard watch, youtu.be, shorts, embeds, and music.youtube
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = cleanUrl.match(regExp);
  return match && match[1] ? match[1] : null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function fetchYouTubeOEmbed(url: string): Promise<OEmbedResult | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  const oembedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(oembedEndpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || `YouTube Audio (#${videoId.slice(0, 6)})`,
        author_name: data.author_name || 'YouTube Artist',
        thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  } catch {
    // CORS or network failure fallback
  }

  // Graceful client fallback using extracted ID
  return {
    title: `YouTube Video #${videoId}`,
    author_name: 'Verified Channel',
    thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}
