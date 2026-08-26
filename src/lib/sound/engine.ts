"use client";

/**
 * Tiny WebAudio synth — no binary asset files. Short procedural tones built from oscillators
 * + a gain envelope, not recordings, so there's nothing to fetch, license, or keep in sync with
 * public/sfx/ (a directory that was reserved for this but never actually needed — see
 * DECISIONS.md). Every cue is muted unless useSoundEnabled() says otherwise (brief §4.6); the
 * AudioContext is created lazily on first real call, not at module load, since constructing one
 * before a user gesture just leaves it "suspended" by the browser's autoplay policy anyway.
 */

interface ToneStep {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  /** Peak gain, 0–1 — kept low across the board; these are cues, not alarms. */
  gain?: number;
}

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function playTone(audioCtx: AudioContext, step: ToneStep, startAt: number): void {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = step.type ?? "sine";
  osc.frequency.value = step.freq;

  const peak = step.gain ?? 0.12;
  const durationS = step.durationMs / 1000;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(peak, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS);

  osc.connect(gainNode).connect(audioCtx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationS + 0.02);
}

function playSequence(steps: ToneStep[]): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  let t = audioCtx.currentTime;
  for (const step of steps) {
    // gain: 0 is a silent gap in the timeline, not an audible tone — skip the node entirely.
    // (An exponential ramp *to* silence is how every other step fades out; ramping *from* 0
    // is undefined by the Web Audio spec and throws, so this can't just be "gain: 0" as a
    // regular step.)
    if (step.gain !== 0) playTone(audioCtx, step, t);
    t += step.durationMs / 1000;
  }
}

export const sfx = {
  /** CountdownOverlay — two beeps a second apart then a brighter "go", ~3s total. The gaps are
   *  silent steps (gain: 0) rather than omitted, since playSequence's timeline is just the sum
   *  of every step's durationMs — a "gap" is a step like any other, just an inaudible one. */
  countdown: () =>
    playSequence([
      { freq: 587.33, durationMs: 220, type: "square", gain: 0.07 },
      { freq: 587.33, durationMs: 780, gain: 0 },
      { freq: 587.33, durationMs: 220, type: "square", gain: 0.07 },
      { freq: 587.33, durationMs: 780, gain: 0 },
      { freq: 880, durationMs: 320, type: "square", gain: 0.09 },
    ]),
  correct: () =>
    playSequence([
      { freq: 523.25, durationMs: 90 },
      { freq: 783.99, durationMs: 170 },
    ]),
  incorrect: () => playSequence([{ freq: 164.81, durationMs: 240, type: "sawtooth", gain: 0.07 }]),
  podium: () =>
    playSequence([
      { freq: 523.25, durationMs: 110 },
      { freq: 659.25, durationMs: 110 },
      { freq: 783.99, durationMs: 110 },
      { freq: 1046.5, durationMs: 280 },
    ]),
  /** Podium — one hit per place as its score reel stops, so the three landings are heard as
   *  three separate events rather than read off the screen. Short and dry on purpose: it fires
   *  up to four times in two seconds. */
  podiumLock: () =>
    playSequence([
      { freq: 392, durationMs: 60, type: "square", gain: 0.06 },
      { freq: 587.33, durationMs: 120, type: "square", gain: 0.07 },
    ]),
  /** Podium — the crown landing on first place, after the last reel has stopped. */
  podiumCrown: () =>
    playSequence([
      { freq: 659.25, durationMs: 90 },
      { freq: 783.99, durationMs: 90 },
      { freq: 987.77, durationMs: 90 },
      { freq: 1318.51, durationMs: 420, gain: 0.08 },
    ]),
  /** SoundToggle — a small confirmation blip played once, right as sound gets turned on. Called
   *  directly (not via useSfx()) since the enabled state that gate checks is, at that instant,
   *  still the pre-toggle value. */
  toggleOn: () =>
    playSequence([
      { freq: 660, durationMs: 90 },
      { freq: 880, durationMs: 110 },
    ]),
};

export type SfxKey = keyof typeof sfx;
