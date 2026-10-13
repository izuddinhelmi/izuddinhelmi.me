// Original town-theme-inspired lo-fi: warm keys, a small chiptune melody,
// rounded bass and swung drums. Render once so background tabs keep playing smoothly.
export const BPM = 74;
export const LOOP_SECONDS = 16 * 4 * 60 / BPM;
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

export async function renderLofiLoop() {
  const rate = 22050, tail = 4;
  const ctx = new OfflineAudioContext(2, Math.ceil((LOOP_SECONDS + tail) * rate), rate);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 3400; tone.Q.value = 0.4;
  const mix = ctx.createGain(); mix.gain.value = 0.65;
  tone.connect(mix).connect(ctx.destination);
  const echo = ctx.createDelay(1), wet = ctx.createGain(), feedback = ctx.createGain();
  echo.delayTime.value = 60 / BPM * 0.75; wet.gain.value = 0.15; feedback.gain.value = 0.22;
  tone.connect(echo); echo.connect(wet).connect(mix); echo.connect(feedback).connect(echo);
  const beat = 60 / BPM;
  const note = (midi, at, length, volume, type = 'sine', pan = 0) => {
    const o = ctx.createOscillator(), gain = ctx.createGain(), stereo = ctx.createStereoPanner();
    o.type = type; o.frequency.value = hz(midi); stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(gain).connect(stereo).connect(tone);
    o.start(at); o.stop(at + length + 0.02);
  };
  // A soft, repeatable noise source for brushed hats and rim-like snares.
  const noise = ctx.createBuffer(1, rate, rate), data = noise.getChannelData(0);
  let seed = 17;
  for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; data[i] = (seed >>> 0) / 2147483648 - 1; }
  const brush = (at, length, volume, frequency) => {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = noise; filter.type = 'highpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(gain).connect(tone); src.start(at); src.stop(at + length);
  };
  const kick = (at) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(105, at); o.frequency.exponentialRampToValueAtTime(43, at + 0.15);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    o.connect(g).connect(tone); o.start(at); o.stop(at + 0.26);
  };
  const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 69]];
  const melodies = [
    [[0.5, 76], [1.5, 79], [2.5, 83], [3.25, 79]],
    [[0.5, 76], [1.75, 72], [3, 74]],
    [[0.5, 76], [1.5, 81], [2.75, 79]],
    [[0.5, 74], [1.5, 71], [2.5, 74]],
    [[0.5, 79], [1.5, 76], [2.75, 74]],
    [[0.75, 72], [2, 76], [3.25, 79]],
    [[0.5, 81], [1.75, 79], [3, 76]],
    [[0.5, 74], [1.5, 71], [2.75, 72]],
  ];
  for (let bar = 0; bar < 16; bar++) {
    const start = bar * 4 * beat, chord = chords[bar % 4];
    chord.forEach((n, i) => {
      note(n, start + i * 0.025, beat * 3.7, 0.055, 'sine', (i - 1.5) * 0.2);
      note(n + 12, start + i * 0.025, beat * 1.3, 0.009, 'triangle', (i - 1.5) * 0.2);
    });
    note(chord[0] - 24, start, beat * 1.65, 0.17);
    note(chord[0] - 12, start + beat * 2.5, beat * 1.15, 0.08);
    for (const [offset, n] of melodies[bar % 8]) {
      if (bar >= 8 && offset > 3) continue; // leave breathing room in the second phrase
      note(n, start + offset * beat, beat * 1.1, 0.042, 'triangle', 0.15);
      note(n + 12, start + offset * beat, beat * 0.4, 0.005, 'sine', -0.15);
    }
    kick(start); kick(start + beat * 2.5);
    for (const b of [1, 3]) { brush(start + b * beat + 0.02, 0.13, 0.052, 1100); note(50, start + b * beat + 0.02, 0.07, 0.035, 'triangle'); }
    for (let h = 0; h < 8; h++) brush(start + (h * 0.5 + (h % 2 ? 0.08 : 0)) * beat, 0.055, h % 2 ? 0.021 : 0.013, 4700);
  }
  const rendered = await ctx.startRendering();
  const frames = Math.round(LOOP_SECONDS * rate);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: rate });
  // Fold the last notes and delay tail into the start for a continuous loop seam.
  for (let channel = 0; channel < 2; channel++) {
    const src = rendered.getChannelData(channel), dest = loop.getChannelData(channel);
    dest.set(src.subarray(0, frames));
    for (let i = frames; i < src.length; i++) dest[i - frames] += src[i];
  }
  return loop;
}

export function createLofiPlayer(ctx) {
  let buffer, source = null;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
  let volume = 0.3;
  return {
    get playing() { return !!source && ctx.state === 'running'; },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      if (source) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
    },
    async play() {
      await ctx.resume();
      buffer ??= renderLofiLoop();
      const clip = await buffer;
      if (source) return;
      source = ctx.createBufferSource(); source.buffer = clip; source.loop = true;
      source.connect(gain); source.start();
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.35);
    },
    stop() {
      if (!source) return;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      source.stop(ctx.currentTime + 0.4); source = null;
    },
  };
}
