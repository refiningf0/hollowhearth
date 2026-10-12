// Original procedural soundtrack (Web Audio). Five themes that crossfade by area + short stingers.
// Placeholder music: every note is generated here, no audio files.
(function () {
  let ctx = null, master = null, reverb = null, comp = null;
  let volume = 0.55, muted = false;
  try { const v = localStorage.getItem('hh_vol'); if (v != null) volume = +v; muted = localStorage.getItem('hh_mute') === '1'; } catch (e) { /* storage blocked */ }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp); comp.connect(ctx.destination);
    // generated reverb impulse
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    reverb.buffer = buf;
    const rg = ctx.createGain(); rg.gain.value = 0.32;
    reverb.connect(rg); rg.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  let noiseBuf = null;

  // ---------------------------------------------------------------- instruments
  // every instrument plays into `out` (a track bus) and optionally the reverb
  function env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }
  function voice(out, t, type, freq, dur, vol, o) {
    o = o || {};
    const g = ctx.createGain();
    let last = g;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.cut || 1200; f.Q.value = o.q || 0.7; if (o.sweep) { f.frequency.setValueAtTime(o.cut * o.sweep, t); f.frequency.exponentialRampToValueAtTime(o.cut, t + (o.sweepT || 0.25)); } g.connect(f); last = f; }
    last.connect(out);
    if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; last.connect(w); w.connect(reverb); }
    const dets = o.detune || [0];
    for (const dt of dets) {
      const osc = ctx.createOscillator();
      osc.type = type; osc.frequency.value = freq; osc.detune.value = dt;
      if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t + 0.15); l.stop(t + dur + (o.rel || 0.3) + 0.1); }
      osc.connect(g); osc.start(t); osc.stop(t + dur + (o.rel || 0.3) + 0.1);
    }
    env(g, t, o.att || 0.01, vol / dets.length, dur, o.rel || 0.3);
  }
  const I = {
    pluck: (out, t, f, d, v) => { voice(out, t, 'triangle', f, 0.02, v, { rel: Math.min(0.9, d + 0.3), wet: 0.35 }); voice(out, t, 'sine', f * 2, 0.01, v * 0.25, { rel: 0.25 }); },
    bell: (out, t, f, d, v) => { voice(out, t, 'sine', f, 0.01, v, { rel: 1.3, wet: 0.6 }); voice(out, t, 'sine', f * 2.76, 0.01, v * 0.22, { rel: 0.5, wet: 0.4 }); voice(out, t, 'sine', f * 4.1, 0.005, v * 0.08, { rel: 0.25 }); },
    flute: (out, t, f, d, v) => voice(out, t, 'sine', f, d * 0.9, v, { att: 0.06, rel: 0.25, vib: 3, wet: 0.5 }),
    pad: (out, t, f, d, v) => voice(out, t, 'sawtooth', f, d, v, { att: 0.6, rel: 1.2, detune: [-9, 0, 8], filter: 'lowpass', cut: 900, wet: 0.7 }),
    darkpad: (out, t, f, d, v) => voice(out, t, 'sawtooth', f, d, v, { att: 0.9, rel: 1.4, detune: [-12, 0, 11], filter: 'lowpass', cut: 520, wet: 0.8 }),
    choir: (out, t, f, d, v) => { voice(out, t, 'sawtooth', f, d, v, { att: 0.5, rel: 1.0, detune: [-14, -4, 6, 15], filter: 'bandpass', cut: 900, q: 1.4, wet: 0.9, vib: 2 }); },
    bass: (out, t, f, d, v) => voice(out, t, 'sawtooth', f, d * 0.85, v, { att: 0.01, rel: 0.12, filter: 'lowpass', cut: 380, q: 2 }),
    subbass: (out, t, f, d, v) => voice(out, t, 'sine', f, d * 0.9, v, { att: 0.01, rel: 0.15 }),
    brass: (out, t, f, d, v) => voice(out, t, 'sawtooth', f, d * 0.8, v, { att: 0.03, rel: 0.18, detune: [-6, 6], filter: 'lowpass', cut: 1500, sweep: 0.35, sweepT: 0.12, wet: 0.35 }),
    strings: (out, t, f, d, v) => voice(out, t, 'sawtooth', f, d * 0.5, v, { att: 0.01, rel: 0.09, detune: [-7, 7], filter: 'lowpass', cut: 2200, wet: 0.3 }),
    arp: (out, t, f, d, v) => voice(out, t, 'square', f, d * 0.4, v, { att: 0.005, rel: 0.08, filter: 'lowpass', cut: 2400, wet: 0.25 }),
    drip: (out, t, f, d, v) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); o.connect(g); g.connect(out); const w = ctx.createGain(); w.gain.value = 0.9; g.connect(w); w.connect(reverb); env(g, t, 0.004, v, 0.01, 0.35); o.start(t); o.stop(t + 0.5); },
  };
  function noise(out, t, dur, vol, type, freq, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(out);
    env(g, t, 0.002, vol, 0.005, dur); s.start(t); s.stop(t + dur + 0.05);
  }
  const DR = {
    kick: (out, t, v) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); o.connect(g); g.connect(out); env(g, t, 0.002, v, 0.02, 0.28); o.start(t); o.stop(t + 0.4); },
    snare: (out, t, v) => { noise(out, t, 0.16, v, 'bandpass', 1800, 0.8); voice(out, t, 'triangle', 190, 0.01, v * 0.5, { rel: 0.08 }); },
    hat: (out, t, v) => noise(out, t, 0.04, v, 'highpass', 8000),
    shaker: (out, t, v) => noise(out, t, 0.07, v, 'highpass', 6000),
    tom: (out, t, v, f) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f || 180, t); o.frequency.exponentialRampToValueAtTime((f || 180) * 0.55, t + 0.25); o.connect(g); g.connect(out); env(g, t, 0.003, v, 0.02, 0.35); o.start(t); o.stop(t + 0.5); },
    boom: (out, t, v) => { DR.kick(out, t, v); noise(out, t, 0.9, v * 0.5, 'lowpass', 300); },
  };

  // ---------------------------------------------------------------- music theory helpers
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  function deg(track, d, oct) { // scale degree -> midi
    const sc = SCALES[track.scale], n = sc.length;
    const o = Math.floor(d / n), i = ((d % n) + n) % n;
    return track.root + 12 * (oct + o) + sc[i];
  }
  // a looping 8-bar melody shaped A A' B A, written as scale-degree offsets from each bar's chord root
  function makeMelody(seed, density) {
    const r = rng(seed);
    const RH = [[1, 0, 0, 1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 1], [1, 1, 0, 1, 0, 0, 1, 0], [1, 0, 0, 0, 0, 0, 1, 0]];
    const motif = () => {
      const bars = [];
      let p = [0, 2, 4][Math.floor(r() * 3)];
      for (let b = 0; b < 2; b++) {
        const rh = RH[Math.floor(r() * (density > 0.6 ? 4 : 5))];
        const notes = [];
        rh.forEach((on, i) => {
          if (!on) return;
          p += [-2, -1, -1, 1, 1, 2, 0][Math.floor(r() * 7)];
          p = Math.max(-2, Math.min(7, p));
          let len = 1; while (i + len < 8 && !rh[i + len] && len < 4) len++;
          notes.push([i, p, len]);
        });
        if (b === 1 && notes.length) notes[notes.length - 1][1] = [0, 2, 4][Math.floor(r() * 3)];
        bars.push(notes);
      }
      return bars;
    };
    const A = motif(), B = motif();
    const A2 = [A[0], A[1].map(([i, p, l]) => [i, p + (p < 4 ? 2 : -1), l])];
    return [...A, ...A2, ...B, ...A];
  }

  // ---------------------------------------------------------------- tracks
  // each track schedules one bar at a time: play(bar, t0, beat)
  const TRACKS = {
    village: {
      bpm: 96, root: 65, scale: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4], mel: makeMelody(11, 0.6),
      play(b, t, q, out) {
        const ch = this.prog[b % 8];
        I.pad(out, t, mtof(deg(this, ch, -1)), q * 4, 0.05); I.pad(out, t, mtof(deg(this, ch + 2, -1)), q * 4, 0.04); I.pad(out, t, mtof(deg(this, ch + 4, -1)), q * 4, 0.04);
        for (let i = 0; i < 4; i++) I.subbass(out, t + i * q, mtof(deg(this, ch + (i === 2 ? 4 : 0), -2)), q, 0.16);
        for (let i = 0; i < 8; i++) I.pluck(out, t + i * q / 2, mtof(deg(this, ch + [0, 2, 4, 7, 4, 2, 4, 2][i], 0)), q / 2, 0.06);
        for (const [i, p, l] of this.mel[b % 8]) I.bell(out, t + i * q / 2, mtof(deg(this, ch + p, 1)), l * q / 2, 0.075);
        for (let i = 0; i < 8; i++) DR.shaker(out, t + i * q / 2, i % 2 ? 0.02 : 0.035);
        DR.kick(out, t, 0.25); DR.kick(out, t + q * 2, 0.18);
      },
    },
    night: {
      bpm: 72, root: 65, scale: 'major', prog: [0, 5, 3, 4], mel: makeMelody(23, 0.3),
      play(b, t, q, out) {
        const ch = this.prog[b % 4];
        I.pad(out, t, mtof(deg(this, ch, -1)), q * 4, 0.04); I.pad(out, t, mtof(deg(this, ch + 4, -1)), q * 4, 0.035);
        I.subbass(out, t, mtof(deg(this, ch, -2)), q * 3, 0.12);
        for (let i = 0; i < 4; i++) I.pluck(out, t + i * q, mtof(deg(this, ch + [0, 4, 7, 4][i], 0)), q, 0.04);
        for (const [i, p, l] of this.mel[b % 8]) if (i % 2 === 0) I.flute(out, t + i * q / 2, mtof(deg(this, ch + p, 1)), l * q / 2, 0.05);
      },
    },
    home: {
      bpm: 84, root: 67, scale: 'major', prog: [0, 3, 0, 4, 5, 3, 1, 4], mel: makeMelody(37, 0.5),
      play(b, t, q, out) {
        const ch = this.prog[b % 8];
        I.pad(out, t, mtof(deg(this, ch, -1)), q * 4, 0.035); I.pad(out, t, mtof(deg(this, ch + 2, -1)), q * 4, 0.03);
        I.subbass(out, t, mtof(deg(this, ch, -2)), q * 1.5, 0.15); I.subbass(out, t + q * 2, mtof(deg(this, ch + 4, -2)), q * 1.5, 0.12);
        // fingerpicked guitar-ish pattern
        const pat = [0, 4, 2, 4, 7, 4, 2, 4];
        for (let i = 0; i < 8; i++) I.pluck(out, t + i * q / 2, mtof(deg(this, ch + pat[i], -1 + (pat[i] > 5 ? 1 : 0) + 1)), q / 2, 0.055);
        for (const [i, p, l] of this.mel[b % 8]) I.flute(out, t + i * q / 2, mtof(deg(this, ch + p, 1)), l * q / 2, 0.07);
      },
    },
    mine: {
      bpm: 66, root: 62, scale: 'dorian', prog: [0, 0, 6, 0, 3, 3, 6, 4], mel: makeMelody(51, 0.25),
      play(b, t, q, out) {
        const ch = this.prog[b % 8];
        I.darkpad(out, t, mtof(deg(this, 0, -2)), q * 4, 0.11);
        I.darkpad(out, t, mtof(deg(this, ch + 4, -1)), q * 4, 0.07);
        const r = rng(b * 7 + 3);
        for (let i = 0; i < 4; i++) if (r() < 0.55) I.drip(out, t + i * q + r() * q * 0.5, mtof(deg(this, ch + [0, 2, 4, 7, 9][Math.floor(r() * 5)], 1)), 0, 0.1);
        if (b % 2 === 0) DR.tom(out, t, 0.2, 90);
        for (const [i, p, l] of this.mel[b % 8]) if (r() < 0.6) I.bell(out, t + i * q / 2, mtof(deg(this, ch + p, 0)), l * q / 2, 0.07);
      },
    },
    dungeon: {
      bpm: 112, root: 57, scale: 'minor', prog: [0, 0, 5, 5, 2, 2, 6, 4], mel: makeMelody(71, 0.7),
      play(b, t, q, out) {
        const ch = this.prog[b % 8];
        I.darkpad(out, t, mtof(deg(this, ch, -1)), q * 4, 0.045); I.darkpad(out, t, mtof(deg(this, ch + 2, -1)), q * 4, 0.035);
        // driving eighth-note bass ostinato
        for (let i = 0; i < 8; i++) I.bass(out, t + i * q / 2, mtof(deg(this, ch + (i === 3 || i === 7 ? 4 : 0), -2)), q / 2, 0.12);
        // staccato strings
        for (let i = 0; i < 8; i++) if (i % 2 === 0 || i === 7) I.strings(out, t + i * q / 2, mtof(deg(this, ch + [4, 2, 4, 5, 4, 2, 0, 2][i], 0)), q / 2, 0.045);
        if (b % 8 >= 4) for (const [i, p, l] of this.mel[b % 8]) I.flute(out, t + i * q / 2, mtof(deg(this, ch + p, 1)), l * q / 2, 0.045);
        DR.kick(out, t, 0.32); DR.kick(out, t + q * 1.5, 0.22); DR.kick(out, t + q * 2, 0.3);
        DR.tom(out, t + q, 0.14, 150); DR.tom(out, t + q * 3, 0.16, 120);
        for (let i = 0; i < 8; i++) DR.hat(out, t + i * q / 2, i % 2 ? 0.025 : 0.04);
        if (b % 4 === 3) { DR.tom(out, t + q * 3.5, 0.18, 200); DR.tom(out, t + q * 3.75, 0.18, 160); }
      },
    },
    boss: {
      bpm: 142, root: 62, scale: 'harm', prog: [0, 0, 5, 5, 3, 3, 4, 4], mel: makeMelody(97, 0.8),
      play(b, t, q, out) {
        const ch = this.prog[b % 8];
        // choir + low brass wall
        I.choir(out, t, mtof(deg(this, ch, 0)), q * 4, 0.05); I.choir(out, t, mtof(deg(this, ch + 2, 0)), q * 4, 0.045); I.choir(out, t, mtof(deg(this, ch + 4, 0)), q * 4, 0.04);
        I.darkpad(out, t, mtof(deg(this, ch, -2)), q * 4, 0.05);
        // galloping bass
        for (let i = 0; i < 16; i++) if (i % 4 !== 1) I.bass(out, t + i * q / 4, mtof(deg(this, ch, -2)), q / 4, 0.13);
        // brass stabs on the off-beats of beat 2 and 4, hero melody on top
        I.brass(out, t + q * 1.5, mtof(deg(this, ch + 4, -1)), q / 2, 0.09); I.brass(out, t + q * 3.5, mtof(deg(this, ch + 2, -1)), q / 2, 0.09);
        for (const [i, p, l] of this.mel[b % 8]) I.brass(out, t + i * q / 2, mtof(deg(this, ch + p, 0)), l * q / 2, 0.075);
        // 16th arps
        for (let i = 0; i < 16; i++) I.arp(out, t + i * q / 4, mtof(deg(this, ch + [0, 2, 4, 7][i % 4], 1)), q / 4, 0.022);
        // war drums
        for (let i = 0; i < 4; i++) DR.kick(out, t + i * q, 0.36);
        DR.snare(out, t + q, 0.2); DR.snare(out, t + q * 3, 0.22);
        for (let i = 0; i < 8; i++) DR.hat(out, t + i * q / 2 + q / 4, 0.03);
        if (b % 2 === 1) for (let i = 0; i < 4; i++) DR.tom(out, t + q * 3 + i * q / 4, 0.2, 220 - i * 30);
        if (b % 8 === 0) DR.boom(out, t, 0.3);
      },
    },
  };

  // ---------------------------------------------------------------- scheduler + crossfade
  const buses = {};
  let current = null;
  function bus(name) {
    if (!buses[name]) {
      const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(master);
      buses[name] = { g, bar: 0, next: 0, on: false };
    }
    return buses[name];
  }
  function setTrack(name) {
    if (!ctx || name === current) return;
    const now = ctx.currentTime;
    if (current && buses[current]) { const b = buses[current]; b.g.gain.cancelScheduledValues(now); b.g.gain.setValueAtTime(Math.max(0.0001, b.g.gain.value), now); b.g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2); setTimeout(() => { if (current !== name) return; b.on = false; }, 2300); }
    current = name;
    if (!name) return;
    const b = bus(name);
    if (!b.on) { b.on = true; b.next = now + 0.1; b.bar = 0; }
    b.g.gain.cancelScheduledValues(now); b.g.gain.setValueAtTime(Math.max(0.0001, b.g.gain.value), now); b.g.gain.exponentialRampToValueAtTime(1, now + 1.8);
  }
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    for (const [name, b] of Object.entries(buses)) {
      if (!b.on) continue;
      const tr = TRACKS[name], q = 60 / tr.bpm;
      while (b.next < ctx.currentTime + 0.35) {
        if (b.next < ctx.currentTime - 0.2) b.next = ctx.currentTime + 0.05; // skipped while the tab was asleep
        tr.play(b.bar, b.next, q, b.g);
        b.bar++; b.next += q * 4;
      }
    }
  }, 90);

  // ---------------------------------------------------------------- stingers
  function sting(kind) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.05;
    const out = master;
    const seq = {
      quest: [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36]],
      victory: [[62, 0], [62, 0.15], [62, 0.3], [70, 0.45], [72, 0.75], [70, 0.95], [74, 1.1]],
      recipe: [[79, 0], [83, 0.1], [86, 0.2]],
      death: [[64, 0], [60, 0.25], [57, 0.5], [52, 0.8]],
    }[kind];
    if (!seq) return;
    for (const [m, dt] of seq) (kind === 'victory' ? I.brass : kind === 'death' ? I.flute : I.bell)(out, t + dt, mtof(m), kind === 'victory' ? 0.3 : 0.25, kind === 'victory' ? 0.12 : 0.1);
    if (kind === 'victory') { DR.boom(out, t, 0.35); DR.boom(out, t + 1.1, 0.3); }
  }

  // ---------------------------------------------------------------- public api
  window.Music = {
    start() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setTrack,
    sting,
    get track() { return current; },
    level() { // current output loudness 0..1 (for debugging)
      if (!ctx) return 0;
      if (!this._an) { this._an = ctx.createAnalyser(); comp.connect(this._an); }
      const a = new Float32Array(this._an.fftSize); this._an.getFloatTimeDomainData(a);
      return Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
    },
    get muted() { return muted; },
    get volume() { return volume; },
    setVolume(v) { volume = v; if (master && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); try { localStorage.setItem('hh_vol', v); } catch (e) { /* storage blocked */ } },
    toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); try { localStorage.setItem('hh_mute', muted ? '1' : '0'); } catch (e) { /* storage blocked */ } return muted; },
  };
})();
