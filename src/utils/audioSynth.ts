// Procedural Web Audio Radio Engine
// Provides real background lo-fi sound and live frequency spectrum data
// without relying on fragile external MP3 URLs.

class RadioAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isRunning: boolean = false;
  private timerId: number | null = null;
  private step: number = 0;

  // Pentatonic warm lo-fi chord frequencies (Cmaj9, Am9, Fmaj7, G6)
  private chordProgression = [
    [261.63, 329.63, 392.00, 493.88, 587.33], // Cmaj9
    [220.00, 261.63, 329.63, 392.00, 440.00], // Am9
    [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj7
    [196.00, 246.94, 293.66, 392.00, 440.00], // G6
  ];

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.85;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch {
      // AudioContext not supported or blocked
    }
  }

  public async start() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isRunning = true;
    this.scheduleNotes();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public setVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  public getFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(16);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  private scheduleNotes() {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    const chord = this.chordProgression[this.step % this.chordProgression.length];
    const now = this.ctx.currentTime;

    // Soft electric piano pad sound
    chord.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const noteDuration = 3.6;
      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.exponentialRampToValueAtTime(0.035 / (idx + 1), now + 0.3);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

      osc.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + noteDuration);
    });

    this.step++;
    this.timerId = window.setTimeout(() => this.scheduleNotes(), 3200);
  }
}

export const audioEngine = new RadioAudioEngine();
