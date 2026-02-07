// Procedural sound effects using Web Audio API
// No external audio files needed

export class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private getCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  play(sound: string) {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    // Resume if suspended (browser requires user interaction)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    switch (sound) {
      case 'dash':
        this.playTone(ctx, 200, 400, 0.1, 'sawtooth', 0.15);
        break;
      case 'pickup':
        this.playTone(ctx, 400, 800, 0.15, 'square', 0.12);
        setTimeout(() => this.playTone(ctx, 600, 1000, 0.1, 'square', 0.1), 100);
        break;
      case 'score':
        this.playTone(ctx, 400, 600, 0.1, 'square', 0.15);
        setTimeout(() => this.playTone(ctx, 600, 800, 0.1, 'square', 0.15), 100);
        setTimeout(() => this.playTone(ctx, 800, 1200, 0.15, 'square', 0.15), 200);
        break;
      case 'tag':
        this.playNoise(ctx, 0.08, 0.2);
        this.playTone(ctx, 300, 100, 0.15, 'sawtooth', 0.12);
        break;
      case 'powerup':
        this.playTone(ctx, 500, 1000, 0.2, 'sine', 0.1);
        break;
      case 'respawn':
        this.playTone(ctx, 200, 500, 0.3, 'sine', 0.08);
        break;
      case 'win':
        [0, 100, 200, 300, 400].forEach((delay, i) => {
          setTimeout(() => this.playTone(ctx, 400 + i * 100, 600 + i * 100, 0.15, 'square', 0.12), delay);
        });
        break;
      case 'shieldBreak':
        this.playNoise(ctx, 0.15, 0.15);
        this.playTone(ctx, 800, 200, 0.2, 'sawtooth', 0.1);
        break;
      case 'countdown':
        this.playTone(ctx, 440, 440, 0.1, 'square', 0.1);
        break;
      case 'go':
        this.playTone(ctx, 880, 880, 0.2, 'square', 0.15);
        break;
    }
  }

  private playTone(ctx: AudioContext, startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private playNoise(ctx: AudioContext, duration: number, volume: number) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }
}
