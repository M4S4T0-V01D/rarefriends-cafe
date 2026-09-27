/**
 * Procedural café audio (WebAudio, no files): smooth-jazz tracks and small "alive" sound effects.
 * Everything is synthesized in the sandbox; nothing plays until the player's first gesture.
 */
import type { ShopId } from "./data.ts";

export type TrackId = "latte" | "rain" | "stroll" | "bossa" | "neon" | "moon";
type Chord = readonly number[];
export type Track = Readonly<{ id: TrackId; name: string; mood: string; bpm: number; swing: boolean; bossa?: boolean; chords: readonly Chord[]; unlock?: string }>;

const Q: Record<string, readonly number[]> = {
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], dom7: [0, 4, 7, 10], dom13: [0, 4, 10, 14, 21],
  dom7b9: [0, 4, 10, 13], m7b5: [0, 3, 6, 10], six9: [0, 4, 9, 14],
};
const NOTE: Record<string, number> = { C: 36, Db: 37, D: 38, Eb: 39, E: 40, F: 41, Gb: 42, G: 43, Ab: 44, A: 45, Bb: 46, B: 47 };
/** "Fmaj7" → bass root (MIDI) followed by the chord intervals. */
const chord = (name: string): Chord => {
  const match = /^([A-G]b?)(.*)$/.exec(name)!;
  return [NOTE[match[1]], ...Q[match[2]]];
};
export const TRACKS: readonly Track[] = [
  { id: "latte", name: "Café au Lait", mood: "Warm mid-tempo swing", bpm: 92, swing: true, chords: ["Fmaj7", "Dm7", "Gm7", "Cdom7"].map(chord) },
  { id: "rain", name: "Rainy Window", mood: "Slow, minor and cosy", bpm: 70, swing: true, chords: ["Dm9", "Bbmaj7", "Gm9", "Adom7b9"].map(chord) },
  { id: "stroll", name: "Sunday Stroll", mood: "Bright walking swing", bpm: 108, swing: true, chords: ["Cmaj7", "Adom7", "Dm7", "Gdom7", "Em7", "Adom7", "Dm7", "Gdom13"].map(chord) },
  { id: "bossa", name: "Street Bossa", mood: "Straight-eighths bossa nova", bpm: 128, swing: false, bossa: true, chords: ["Am9", "Ddom13", "Gmaj7", "Cmaj7", "Gbm7b5", "Bdom7b9", "Em9", "Em9"].map(chord) },
  { id: "neon", name: "Neon Nights", mood: "Late-night lounge (Chrome Jukebox)", bpm: 96, swing: true, chords: ["Ebmaj7", "Cm7", "Fm7", "Bbdom7"].map(chord), unlock: "jukebox" },
  { id: "moon", name: "Midnight Moon", mood: "Dreamy ballad (Moon Telescope)", bpm: 62, swing: true, chords: ["Abmaj9", "Dbdom13", "Gbmaj7", "Fm9", "Bbm7", "Ebdom13", "Absix9", "Absix9"].map(chord), unlock: "telescope" },
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const random = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

export class CafeAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode; private noise!: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0; private step = 0; private lastSfx = new Map<string, number>();
  track: TrackId = "latte"; musicOn = true; sfxOn = true; muted = false; volume = 0.6;

  /** Create or resume the audio context from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const ctx = this.ctx = new Context();
      // Master → gentle compressor → make-up gain, so the soft jazz stays audible on laptop and phone speakers.
      const glue = ctx.createDynamicsCompressor(), output = ctx.createGain();
      glue.threshold.value = -18; glue.knee.value = 10; glue.ratio.value = 4; glue.attack.value = 0.004; glue.release.value = 0.25;
      output.gain.value = 1.3; glue.connect(output).connect(ctx.destination);
      this.master = ctx.createGain(); this.master.connect(glue);
      const warmth = ctx.createBiquadFilter(); warmth.type = "lowpass"; warmth.frequency.value = 5200; warmth.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.connect(warmth);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
      this.applyLevels();
    }
    // iOS: play through the ringer switch like media, and prime output with a silent buffer inside the gesture.
    try { const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (session) session.type = "playback"; } catch { /* unsupported */ }
    if (this.ctx.state !== "running") {
      const primer = this.ctx.createBufferSource(); primer.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate); primer.connect(this.ctx.destination); primer.start();
      void this.ctx.resume().catch(() => { /* retried on the next gesture */ });
    }
    this.syncMusic();
  }
  setMuted(muted: boolean) { this.muted = muted; this.applyLevels(); this.syncMusic(); }
  setMusic(on: boolean) { this.musicOn = on; this.applyLevels(); this.syncMusic(); }
  setSfx(on: boolean) { this.sfxOn = on; this.applyLevels(); }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); this.applyLevels(); }
  setTrack(track: TrackId) { if (track !== this.track) { this.track = track; this.step = 0; } this.syncMusic(); }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; void this.ctx?.close(); this.ctx = null; }

  private applyLevels() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 1.2 : 0, now, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 1.1 : 0, now, 0.02);
  }
  private syncMusic() {
    const playing = Boolean(this.ctx && this.musicOn && !this.muted);
    if (playing && !this.timer) { this.nextTime = this.ctx!.currentTime + 0.1; this.timer = setInterval(() => this.schedule(), 50); }
    if (!playing && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ---------- Instruments ----------
  private envelope(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  /** Rhodes-like electric piano: a sine carrier with a gentle FM bark and a bell partial. */
  private epiano(midi: number, t: number, length: number, velocity: number, bus: AudioNode) {
    const ctx = this.ctx!, f = hz(midi), carrier = ctx.createOscillator(), modulator = ctx.createOscillator(), depth = ctx.createGain(), gain = ctx.createGain();
    carrier.frequency.value = f; modulator.frequency.value = f * 2; depth.gain.setValueAtTime(f * 1.2, t); depth.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
    modulator.connect(depth).connect(carrier.frequency); carrier.connect(gain).connect(bus);
    this.envelope(gain, t, 0.09 * velocity, 0.008, length);
    carrier.start(t); modulator.start(t); carrier.stop(t + length + 0.1); modulator.stop(t + length + 0.1);
  }
  private bass(midi: number, t: number, length: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = hz(midi); filter.type = "lowpass"; filter.frequency.value = 520;
    osc.connect(filter).connect(gain).connect(this.musicBus);
    this.envelope(gain, t, 0.32, 0.012, length);
    osc.start(t); osc.stop(t + length + 0.05);
  }
  private vibes(midi: number, t: number, length: number) {
    const ctx = this.ctx!, gain = ctx.createGain(), tremolo = ctx.createOscillator(), depth = ctx.createGain(), mix = ctx.createGain();
    tremolo.frequency.value = 5.5; depth.gain.value = 0.35; tremolo.connect(depth).connect(mix.gain);
    for (const [ratio, level] of [[1, 1], [4, 0.18], [10, 0.05]]) {
      const osc = ctx.createOscillator(), partial = ctx.createGain(); osc.frequency.value = hz(midi) * ratio; partial.gain.value = level;
      osc.connect(partial).connect(mix); osc.start(t); osc.stop(t + length + 0.1);
    }
    mix.connect(gain).connect(this.musicBus);
    this.envelope(gain, t, 0.07, 0.004, length);
    tremolo.start(t); tremolo.stop(t + length + 0.1);
  }
  private hiss(t: number, length: number, frequency: number, level: number, bus: AudioNode, type: BiquadFilterType = "highpass", q = 0.7) {
    const ctx = this.ctx!, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise; source.loopStart = Math.random() * 0.5; filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    source.connect(filter).connect(gain).connect(bus);
    this.envelope(gain, t, level, 0.004, length);
    source.start(t, Math.random() * 0.5); source.stop(t + length + 0.05);
  }
  private kick(t: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    osc.connect(gain).connect(this.musicBus); this.envelope(gain, t, 0.28, 0.005, 0.22); osc.start(t); osc.stop(t + 0.3);
  }

  // ---------- Jazz sequencer ----------
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const track = TRACKS.find(item => item.id === this.track) ?? TRACKS[0], eighth = 60 / track.bpm / 2;
    // After a throttled or backgrounded tab, pick up from now instead of flooding the missed notes.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.3) {
      const odd = this.step % 2 === 1, length = track.swing ? eighth * (odd ? 2 / 3 : 4 / 3) : eighth;
      this.play(track, this.step, this.nextTime, eighth);
      this.nextTime += length; this.step++;
    }
  }
  private play(track: Track, step: number, t: number, eighth: number) {
    const bar = Math.floor(step / 8), inBar = step % 8, beat = Math.floor(inBar / 2), onBeat = inBar % 2 === 0;
    const current = track.chords[bar % track.chords.length], next = track.chords[(bar + 1) % track.chords.length];
    const root = current[0], tones = current.slice(1);
    if (track.bossa) {
      // Bossa: root and fifth on a dotted rhythm, syncopated comping, rim clave and a soft shaker.
      if (inBar === 0) this.bass(root, t, eighth * 2.6);
      if (inBar === 3) this.bass(root + 7, t, eighth * 0.9);
      if (inBar === 4) this.bass(root + 7, t, eighth * 1.8);
      if (inBar === 7) this.bass(next[0], t, eighth * 0.9);
      if ([0, 3, 5].includes(inBar)) tones.forEach(interval => this.epiano(root + 24 + interval, t, eighth * 1.2, 0.7, this.musicBus));
      if ([0, 3, 6, 10, 12].includes(step % 16)) this.hiss(t, 0.03, 2500, 0.1, this.musicBus, "bandpass", 4);
      this.hiss(t, 0.05, 7000, 0.03, this.musicBus);
      if (inBar === 0 && bar % 2 === 0) this.kick(t);
    } else {
      // Swing: walking bass, ride cymbal "ding, ding-da", brushes on 2 and 4, soft comping.
      if (onBeat) {
        const walk = [root, root + random([tones[1], tones[2]]), root + 7, next[0] + random([-1, 1, 2])][beat];
        this.bass(walk + (walk < 40 ? 12 : 0), t, eighth * 1.7);
        this.hiss(t, 0.18, 6500, 0.05, this.musicBus);
        if (beat % 2 === 1) this.hiss(t, 0.14, 1800, 0.06, this.musicBus, "bandpass", 0.5);
        if (beat === 0 && Math.random() < 0.6) this.kick(t);
      } else if (beat % 2 === 1) this.hiss(t, 0.07, 6500, 0.035, this.musicBus);
      const comp = inBar === 0 ? 0.9 : (inBar === 3 || inBar === 5) ? 0.45 : 0;
      if (Math.random() < comp) tones.forEach(interval => this.epiano(root + 24 + interval, t, eighth * (inBar === 0 ? 3 : 1.4), 0.8, this.musicBus));
    }
    // An occasional vibraphone phrase over the changes.
    if (bar % 2 === 1 && Math.random() < 0.32) {
      const scale = [0, 2, 4, 7, 9].map(interval => root + 48 + interval).concat(tones.map(interval => root + 48 + interval));
      this.vibes(random(scale), t, eighth * (onBeat ? 2.5 : 1.2));
    }
  }

  // ---------- Sound effects ----------
  private can(name: string, gap = 0.08) {
    if (!this.ctx || !this.sfxOn || this.muted) return null;
    const now = this.ctx.currentTime;
    if (now - (this.lastSfx.get(name) ?? -1) < gap) return null;
    this.lastSfx.set(name, now);
    return now;
  }
  private tone(midi: number, t: number, length: number, level: number, type: OscillatorType = "sine", glideTo?: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(hz(midi), t);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(hz(glideTo), t + length);
    osc.connect(gain).connect(this.sfxBus); this.envelope(gain, t, level, 0.005, length); osc.start(t); osc.stop(t + length + 0.05);
  }
  private melody(notes: readonly number[], gap: number, level = 0.2) {
    const t = this.ctx!.currentTime;
    notes.forEach((midi, index) => { this.tone(midi, t + index * gap, gap * 1.8, level, "triangle"); this.tone(midi + 12, t + index * gap, gap, level * 0.25); });
  }
  /** A dish is ready: a shop-specific kitchen sound plus a little bell. */
  ready(shop: ShopId) {
    const t = this.can("ready", 0.25); if (t === null) return;
    if (shop === "cafe") this.hiss(t, 0.5, 3500, 0.18, this.sfxBus, "highpass");
    else if (shop === "seafood") for (let i = 0; i < 4; i++) this.tone(70 + i * 3, t + i * 0.05, 0.05, 0.12, "sine", 82 + i * 3);
    else if (shop === "pastry") this.tone(88, t, 0.9, 0.18, "sine");
    else if (shop === "burger") this.hiss(t, 0.45, 5500, 0.14, this.sfxBus, "highpass");
    else { this.hiss(t, 0.35, 2600, 0.12, this.sfxBus, "bandpass", 1); this.tone(69, t + 0.05, 1.2, 0.1, "sine"); }
    this.tone(84, t + 0.32, 0.5, 0.2, "sine"); this.tone(96, t + 0.32, 0.3, 0.06, "sine");
  }
  doorbell() { const t = this.can("door", 0.6); if (t === null) return; this.tone(88, t, 0.5, 0.14); this.tone(84, t + 0.18, 0.7, 0.12); }
  /** Happy Friend chirp, pitched per Friend. */
  happy(voice: number) {
    const t = this.can("happy", 0.12); if (t === null) return;
    const base = 76 + (voice % 7);
    this.tone(base, t, 0.07, 0.1, "square", base + 5); this.tone(base + 5, t + 0.08, 0.1, 0.09, "square", base + 12);
    this.coins(t + 0.12);
  }
  private coins(t: number) { for (const [index, midi] of [88, 93, 100].entries()) this.tone(midi, t + index * 0.04, 0.12, 0.06, "triangle"); }
  order(voice: number) {
    const t = this.can("order", 0.15); if (t === null) return;
    this.hiss(t, 0.06, 4000, 0.08, this.sfxBus, "bandpass", 2); this.hiss(t + 0.09, 0.05, 4400, 0.07, this.sfxBus, "bandpass", 2);
    const base = 72 + (voice % 5); this.tone(base, t + 0.02, 0.08, 0.06, "square", base + 3);
  }
  tired(voice: number) { const t = this.can("tired", 0.5); if (t === null) return; const base = 64 + (voice % 5); this.tone(base + 7, t, 0.7, 0.12, "triangle", base - 5); this.hiss(t + 0.1, 0.5, 900, 0.05, this.sfxBus, "lowpass"); }
  rested(voice: number) { const t = this.can("rested", 0.3); if (t === null) return; const base = 74 + (voice % 5); [0, 4, 7, 12].forEach((step, index) => this.tone(base + step, t + index * 0.06, 0.1, 0.08, "square")); }
  grumble() { const t = this.can("grumble", 0.4); if (t === null) return; this.tone(50, t, 0.25, 0.12, "sawtooth", 45); this.tone(47, t + 0.15, 0.3, 0.1, "sawtooth", 42); }
  levelUp() { if (this.can("level", 0.5) === null) return; this.melody([72, 76, 79, 84, 88], 0.09, 0.18); }
  workerLevel() { if (this.can("wlevel", 0.4) === null) return; this.melody([79, 83, 86], 0.08, 0.14); }
  closing() { if (this.can("closing", 1) === null) return; this.melody([84, 79, 76, 72, 74, 72], 0.16, 0.14); }
  place() { const t = this.can("place", 0.05); if (t === null) return; this.tone(50, t, 0.12, 0.2, "sine", 40); this.hiss(t, 0.05, 1200, 0.06, this.sfxBus, "lowpass"); }
  sell() { const t = this.can("sell", 0.05); if (t === null) return; this.tone(62, t, 0.15, 0.1, "triangle", 74); this.coins(t + 0.1); }
  crank() { const t = this.can("crank", 0.3); if (t === null) return; for (let i = 0; i < 6; i++) this.hiss(t + i * 0.07, 0.03, 3000, 0.12, this.sfxBus, "bandpass", 5); this.tone(60, t + 0.45, 0.2, 0.15, "sine", 48); }
  pop() { const t = this.can("pop", 0.1); if (t === null) return; this.tone(70, t, 0.08, 0.2, "sine", 90); this.hiss(t, 0.04, 2000, 0.1, this.sfxBus, "bandpass", 3); }
  select() { const t = this.can("select", 0.05); if (t === null) return; this.tone(79, t, 0.06, 0.08, "triangle"); }
}
