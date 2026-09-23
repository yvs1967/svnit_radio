export interface Song {
  id: string;
  title: string;
  artist: string;
  youtubeUrl: string;
  youtubeId: string;
  thumbnail: string;
  duration: number; // in seconds
  requestedBy: string;
  requestedAt: Date | number | string;
  strikes: number;
  struckByMe: boolean;
  struckByUsers?: string[];
  status: 'playing' | 'queued' | 'struck_out';
}

export interface RadioState {
  isPlaying: boolean;
  isSynced: boolean;
  listenersCount: number;
  currentSong: Song;
  currentTime: number; // in seconds
  volume: number;
  isMuted: boolean;
}
