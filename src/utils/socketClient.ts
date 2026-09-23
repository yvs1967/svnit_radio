import { io, Socket } from 'socket.io-client';
import { Song } from '../types.ts';

// Get or generate persistent client UUID in localStorage
export function getOrCreateUserId(): string {
  const KEY = 'svnit_radio_user_uuid';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getOrCreateUserHandle(): string {
  const KEY = 'svnit_radio_handle';
  let handle = localStorage.getItem(KEY);
  if (!handle) {
    const branches = ['cs', 'ece', 'mech', 'civil', 'chem', 'ai', 'math'];
    const branch = branches[Math.floor(Math.random() * branches.length)];
    const num = Math.floor(100 + Math.random() * 900);
    handle = `@d25_${branch}${num}`;
    localStorage.setItem(KEY, handle);
  }
  return handle;
}

export interface SyncPayload {
  currentSong: any;
  startedAt: number;
  seekSeconds: number;
  serverTime: number;
  queue: any[];
  listenerCount: number;
}

export interface TrackChangedPayload {
  currentSong: any;
  startedAt: number;
  seekSeconds: number;
  serverTime: number;
  reason?: 'finished' | 'skipped_7min' | 'manual';
}

class RadioSocketManager {
  private socket: Socket | null = null;
  private userId: string = '';
  private userHandle: string = '';

  constructor() {
    this.userId = getOrCreateUserId();
    this.userHandle = getOrCreateUserHandle();
  }

  public connect(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Connect to same origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('📻 Connected to SVNIT Radio backend server:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('Radio socket disconnected:', reason);
    });

    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getUserHandle(): string {
    return this.userHandle;
  }

  public requestSync() {
    this.socket?.emit('sync:request');
  }

  public submitSongRequest(
    url: string,
    bypassCooldown: boolean = false
  ): Promise<{ success: boolean; error?: string; remainingSeconds?: number; song?: any }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected to radio server' });
        return;
      }

      this.socket.emit(
        'song:request',
        {
          url,
          userId: this.userId,
          username: this.userHandle,
          bypassCooldown,
        },
        (response: any) => {
          resolve(response);
        }
      );
    });
  }

  public strikeSong(
    songId: string,
    peerId?: string
  ): Promise<{ success: boolean; error?: string; strikes?: number; pulled?: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected to radio server' });
        return;
      }

      this.socket.emit(
        'song:strike',
        {
          songId,
          userId: this.userId,
          peerId,
        },
        (response: any) => {
          resolve(response);
        }
      );
    });
  }
}

export const radioSocket = new RadioSocketManager();
