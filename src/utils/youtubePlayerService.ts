// YouTube IFrame Player API manager for reliable audio/video stream playback

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YTPlayerCallbacks {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onTrackEnded?: () => void;
  onError?: (errorCode: number) => void;
  onPlaying?: () => void;
}

class YouTubeAudioService {
  private player: any = null;
  private isApiReady: boolean = false;
  private isLoaded: boolean = false;
  private currentVideoId: string | null = null;
  private pendingStartSeconds: number = 0;
  private shouldBePlaying: boolean = false;
  private currentVolume: number = 80;
  private callbacks: YTPlayerCallbacks = {};
  private containerId: string = 'youtube-radio-player-container';
  private iframeHostId: string = 'youtube-iframe-host';
  private isVideoVisible: boolean = false;

  public init(callbacks: YTPlayerCallbacks = {}) {
    this.callbacks = callbacks;

    if (window.YT && window.YT.Player) {
      this.isApiReady = true;
      this.createPlayer();
      return;
    }

    // Load YouTube IFrame API script dynamically if not present
    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousOnReady) previousOnReady();
      this.isApiReady = true;
      this.createPlayer();
    };
  }

  private createPlayer() {
    if (!window.YT || !window.YT.Player) return;

    let container = document.getElementById(this.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this.containerId;
      // Position inside viewport so Chrome/Safari does not throttle or mute audio
      this.applyContainerStyle(container);
      document.body.appendChild(container);
    }

    let hostDiv = document.getElementById(this.iframeHostId);
    if (!hostDiv) {
      hostDiv = document.createElement('div');
      hostDiv.id = this.iframeHostId;
      container.appendChild(hostDiv);
    }

    try {
      this.player = new window.YT.Player(this.iframeHostId, {
        height: '140',
        width: '240',
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          fs: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: any) => {
            this.isLoaded = true;
            this.player = event.target;
            this.player.setVolume(this.currentVolume);
            this.player.unMute();

            if (this.shouldBePlaying && this.currentVideoId) {
              this.loadAndPlay(this.currentVideoId, this.pendingStartSeconds);
            } else if (this.currentVideoId) {
              try {
                this.player.cueVideoById({
                  videoId: this.currentVideoId,
                  startSeconds: this.pendingStartSeconds || 0,
                });
              } catch (e) {
                console.warn('Cue error on ready:', e);
              }
            }

            this.callbacks.onReady?.();
          },
          onStateChange: (event: any) => {
            // YT.PlayerState.ENDED = 0
            if (event.data === 0) {
              this.callbacks.onTrackEnded?.();
            } else if (event.data === 1) {
              // Playing
              this.callbacks.onPlaying?.();
            }
            this.callbacks.onStateChange?.(event.data);
          },
          onError: (event: any) => {
            console.warn('YouTube Player API Error Code:', event.data);
            this.callbacks.onError?.(event.data);
          },
        },
      });
    } catch (e) {
      console.error('Failed to instantiate YT.Player:', e);
    }
  }

  private applyContainerStyle(container: HTMLElement) {
    container.style.position = 'fixed';
    container.style.bottom = '16px';
    container.style.right = '16px';
    container.style.width = '240px';
    container.style.height = '140px';
    container.style.borderRadius = '12px';
    container.style.overflow = 'hidden';
    container.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)';
    container.style.border = '1px solid rgba(245, 158, 11, 0.3)';
    container.style.backgroundColor = '#0a0a0a';
    container.style.zIndex = '45';
    container.style.transition = 'all 0.3s ease';

    // If minimized / audio only, keep in DOM with tiny opacity in corner
    if (!this.isVideoVisible) {
      container.style.transform = 'scale(0.01)';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';
      container.style.transformOrigin = 'bottom right';
    } else {
      container.style.transform = 'scale(1)';
      container.style.opacity = '1';
      container.style.pointerEvents = 'auto';
    }
  }

  public setVideoVisible(visible: boolean) {
    this.isVideoVisible = visible;
    const container = document.getElementById(this.containerId);
    if (container) {
      this.applyContainerStyle(container);
    }
  }

  public toggleVideoVisible(): boolean {
    this.setVideoVisible(!this.isVideoVisible);
    return this.isVideoVisible;
  }

  public getIsVideoVisible(): boolean {
    return this.isVideoVisible;
  }

  private loadAndPlay(videoId: string, startSeconds: number = 0) {
    if (!this.player) return;
    try {
      if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId,
          startSeconds: Math.max(0, Math.floor(startSeconds)),
        });
      }
      if (typeof this.player.unMute === 'function') {
        this.player.unMute();
      }
      if (typeof this.player.setVolume === 'function') {
        this.player.setVolume(this.currentVolume);
      }
      if (typeof this.player.playVideo === 'function') {
        this.player.playVideo();
      }
    } catch (err) {
      console.warn('Error in loadAndPlay:', err);
    }
  }

  public playVideo(videoId: string, startSeconds: number = 0) {
    this.currentVideoId = videoId;
    this.pendingStartSeconds = startSeconds;
    this.shouldBePlaying = true;

    if (this.player && this.isLoaded) {
      this.loadAndPlay(videoId, startSeconds);
    }
  }

  public play() {
    this.shouldBePlaying = true;
    if (this.player && typeof this.player.playVideo === 'function') {
      try {
        this.player.unMute();
        this.player.setVolume(this.currentVolume);
        this.player.playVideo();
      } catch (e) {
        console.warn('Play error:', e);
      }
    } else if (this.currentVideoId) {
      this.playVideo(this.currentVideoId, this.pendingStartSeconds);
    }
  }

  public pause() {
    this.shouldBePlaying = false;
    if (this.player && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
      } catch (e) {
        console.warn('Pause error:', e);
      }
    }
  }

  public setVolume(val: number) {
    // 0 to 1
    this.currentVolume = Math.round(Math.max(0, Math.min(1, val)) * 100);
    if (this.player && typeof this.player.setVolume === 'function') {
      try {
        this.player.setVolume(this.currentVolume);
      } catch (e) {
        console.warn('Volume error:', e);
      }
    }
  }

  public mute() {
    if (this.player && typeof this.player.mute === 'function') {
      try {
        this.player.mute();
      } catch (e) {
        console.warn('Mute error:', e);
      }
    }
  }

  public unMute() {
    if (this.player && typeof this.player.unMute === 'function') {
      try {
        this.player.unMute();
        this.player.setVolume(this.currentVolume);
      } catch (e) {
        console.warn('UnMute error:', e);
      }
    }
  }

  public getCurrentTime(): number {
    if (this.player && typeof this.player.getCurrentTime === 'function') {
      try {
        return this.player.getCurrentTime() || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  public getDuration(): number {
    if (this.player && typeof this.player.getDuration === 'function') {
      try {
        return this.player.getDuration() || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }
}

export const ytAudioService = new YouTubeAudioService();
