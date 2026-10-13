// Every sound is synthesised with the Web Audio API, so the game ships no audio files.
// Browsers only allow audio after a user gesture: call sound.unlock() from a click.
const sound = (() => {
  const MUTE_KEY = "whack-a-mole-muted";

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = loadMuted();

  function loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  // A note that fades out, optionally sliding from freq to `to`.
  function tone({ freq, to, dur, type = "sine", vol = 0.3, delay = 0 }) {
    if (muted || !ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // A burst of filtered noise, for thuds and explosions.
  function noise({ dur, vol = 0.3, cutoff = 1200, delay = 0 }) {
    if (muted || !ctx) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, start);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + dur + 0.02);
  }

  function setMuted(value) {
    muted = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      // Storage can be unavailable (private mode); the choice just won't be remembered.
    }
    if (!value) unlock();
  }

  return {
    unlock,
    setMuted,
    isMuted: () => muted,

    pop() {
      tone({ freq: 420, to: 760, dur: 0.08, vol: 0.1 });
    },
    // The bonk climbs in pitch as the streak grows.
    bonk(streak) {
      const lift = 1 + Math.min(streak, 20) * 0.03;
      tone({ freq: 240 * lift, to: 90 * lift, dur: 0.14, type: "triangle", vol: 0.5 });
      noise({ dur: 0.06, vol: 0.25, cutoff: 2400 });
    },
    gold() {
      [988, 1319, 1568, 1976].forEach((freq, i) => tone({ freq, dur: 0.16, type: "triangle", vol: 0.25, delay: i * 0.06 }));
    },
    bomb() {
      noise({ dur: 0.7, vol: 0.7, cutoff: 700 });
      tone({ freq: 130, to: 35, dur: 0.5, vol: 0.6 });
    },
    miss() {
      noise({ dur: 0.09, vol: 0.12, cutoff: 500 });
    },
    comboUp(mult) {
      const base = 520 + mult * 90;
      tone({ freq: base, dur: 0.09, type: "square", vol: 0.12 });
      tone({ freq: base * 1.5, dur: 0.14, type: "square", vol: 0.12, delay: 0.08 });
    },
    comboBreak() {
      tone({ freq: 300, to: 110, dur: 0.25, type: "sawtooth", vol: 0.12 });
    },
    clock() {
      [660, 880, 1320].forEach((freq, i) => tone({ freq, dur: 0.14, type: "sine", vol: 0.3, delay: i * 0.07 }));
    },
    faster() {
      [523, 784].forEach((freq, i) => tone({ freq, dur: 0.14, type: "sawtooth", vol: 0.12, delay: i * 0.09 }));
    },
    frenzy() {
      [392, 523, 659, 784, 1047].forEach((freq, i) => tone({ freq, dur: 0.12, type: "sawtooth", vol: 0.12, delay: i * 0.06 }));
    },
    tick() {
      tone({ freq: 1040, dur: 0.05, type: "square", vol: 0.1 });
    },
    count() {
      tone({ freq: 440, dur: 0.16, type: "square", vol: 0.14 });
    },
    go() {
      tone({ freq: 880, dur: 0.32, type: "square", vol: 0.14 });
    },
    end(isRecord) {
      const notes = isRecord ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
      notes.forEach((freq, i) => tone({ freq, dur: 0.28, type: "triangle", vol: 0.25, delay: i * 0.11 }));
    },
  };
})();
