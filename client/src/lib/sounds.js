// Till feedback tones, synthesised with Web Audio so there are no sound
// files to ship or preload. A soft two-note rising chime when an item goes
// in — deliberately unlike the scanner's own high square beep, so the two
// aren't confused — and a low double buzz when a scan or add fails.
let ctx;

function tone(freq, start, duration, type = 'square', volume = 0.08) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    // Browsers start the context suspended until a user gesture; a scan or
    // click is one, so resume on every call.
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    // Short attack so sine notes start without a click.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  } catch {
    // No audio (old browser, blocked) — the toast still says what happened.
  }
}

// "Added": E5 then A5, rounded sine notes (a scanner beep is one flat ~2-4kHz tone).
export const beep = () => {
  tone(659, 0, 0.12, 'sine', 0.18);
  tone(880, 0.08, 0.18, 'sine', 0.18);
};

export const errorTone = () => {
  tone(220, 0, 0.14, 'sawtooth', 0.1);
  tone(180, 0.17, 0.2, 'sawtooth', 0.1);
};
