export type SoundEffectType =
  | 'click'
  | 'matchCreated'
  | 'lobbyTransition'
  | 'lobbyEnter';

export interface SoundToneStep {
  frequency: number;
  endFrequency?: number;
  delaySec: number;
  durationSec: number;
  gain: number;
  waveform: OscillatorType;
}

export const SOUND_STORAGE_KEY = 'ludobridge.soundEnabled';

export const SOUND_PROFILES: Record<SoundEffectType, readonly SoundToneStep[]> = {
  // Crisp, low-volume tactile tap for UI buttons and tabs
  click: [
    {
      frequency: 540,
      endFrequency: 360,
      delaySec: 0,
      durationSec: 0.035,
      gain: 0.04,
      waveform: 'triangle',
    },
  ],
  // Warm ascending two-note bell chime when a new battle is posted
  matchCreated: [
    {
      frequency: 523.25,
      delaySec: 0,
      durationSec: 0.11,
      gain: 0.075,
      waveform: 'sine',
    },
    {
      frequency: 659.25,
      delaySec: 0.07,
      durationSec: 0.16,
      gain: 0.08,
      waveform: 'triangle',
    },
  ],
  // Soft two-step glide for route & lobby view transitions
  lobbyTransition: [
    {
      frequency: 392,
      endFrequency: 493.88,
      delaySec: 0,
      durationSec: 0.11,
      gain: 0.045,
      waveform: 'sine',
    },
  ],
  // Distinct 3-note chime when entering or syncing into a 1v1 match room
  lobbyEnter: [
    {
      frequency: 440,
      delaySec: 0,
      durationSec: 0.09,
      gain: 0.06,
      waveform: 'sine',
    },
    {
      frequency: 554.37,
      delaySec: 0.06,
      durationSec: 0.1,
      gain: 0.065,
      waveform: 'sine',
    },
    {
      frequency: 659.25,
      delaySec: 0.12,
      durationSec: 0.18,
      gain: 0.075,
      waveform: 'triangle',
    },
  ],
};

let sharedAudioContext: AudioContext | null = null;
let cachedEnabled: boolean | null = null;
let lastTransitionSoundMs = 0;

export function readSoundEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    cachedEnabled = raw === null ? true : raw !== 'false';
    return cachedEnabled;
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  cachedEnabled = enabled;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function getInteractiveClickTarget(
  target: EventTarget | null
): HTMLElement | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return null;
  }
  const el = target.closest(
    'button, [role="button"], [role="tab"], [role="radio"], a[href]'
  );
  if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) {
    return null;
  }
  if (el.dataset.sound === 'none') return null;
  if (
    (el instanceof HTMLButtonElement && el.disabled) ||
    el.getAttribute('aria-disabled') === 'true'
  ) {
    return null;
  }
  return el;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export function playSound(type: SoundEffectType): boolean {
  const nowMs = Date.now();
  if (type === 'click' && nowMs - lastTransitionSoundMs < 120) {
    return false;
  }
  if (type !== 'click') {
    lastTransitionSoundMs = nowMs;
  }

  if (!readSoundEnabled()) return false;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.lastSound = type;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  const steps = SOUND_PROFILES[type];
  const baseTime = ctx.currentTime;

  try {
    for (const step of steps) {
      const start = baseTime + step.delaySec;
      const stop = start + step.durationSec;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = step.waveform;
      osc.frequency.setValueAtTime(step.frequency, start);
      if (step.endFrequency && step.endFrequency > 0) {
        osc.frequency.exponentialRampToValueAtTime(step.endFrequency, stop);
      }

      // Smooth attack & exponential decay to eliminate clicks/pops
      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(step.gain, start + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stop);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(start);
      osc.stop(stop + 0.01);
    }
    return true;
  } catch {
    return false;
  }
}
