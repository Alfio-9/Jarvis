/**
 * Audio Synthesizer Layer (Singleton Web Audio)
 * Provides futuristic Sci-Fi acoustic feedback without saturating Windows WASAPI audio channels.
 */

let cachedAudioCtx = null;

export function getAudioContext() {
  try {
    if (!cachedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        cachedAudioCtx = new AudioCtx();
      }
    }
    if (cachedAudioCtx && cachedAudioCtx.state === 'suspended') {
      cachedAudioCtx.resume().catch(() => {});
    }
    return cachedAudioCtx;
  } catch (e) {
    return null;
  }
}

export function playSciFiChirp(freqStart = 700, freqEnd = 1300, duration = 0.1) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {}
}
