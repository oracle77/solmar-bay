// Solmar Bay — synthesized sound, WebAudio only, no audio files.
// Everything is an oscillator or a short noise burst made at run time: an
// engine hum that follows speed, a two-tone siren while the heat is on, and
// one-shot blips for shots, punches, pickups, missions and getting busted.
// The context is created on the first user gesture, so a headless capture
// that never gestures simply stays silent.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // Shared noise buffer for gunshots and thuds.
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Engine: a low sawtooth through a lowpass, gain and pitch follow speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 62;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();

      // Siren: a triangle wave wobbling between two tones on a slow LFO.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 760;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  // speed01: 0..1 of top speed. driving: true while the player is in a car.
  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const gain = driving ? 0.028 + speed01 * 0.05 : 0.012;
    this.engineGain.gain.setTargetAtTime(gain, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(58 + speed01 * 165, t, 0.08);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.15);
  }

  tone(freq, dur, type, vol, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  gunshot() {
    this.noise(0.14, 0.5, 1800);
    this.tone(160, 0.1, 'square', 0.22);
  }

  punch() {
    this.noise(0.1, 0.35, 320);
    this.tone(95, 0.12, 'sine', 0.4);
  }

  pickup() {
    this.tone(880, 0.09, 'sine', 0.25);
    this.tone(1318, 0.14, 'sine', 0.25, 0.07);
  }

  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.28, i * 0.1));
  }

  busted() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, i * 0.17));
  }

  wasted() {
    const notes = [330, 262, 196, 131];
    notes.forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.2, i * 0.2));
  }

  reloadClick() {
    this.tone(1150, 0.05, 'square', 0.12);
  }
}
