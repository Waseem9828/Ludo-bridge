import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInteractiveClickTarget,
  playSound,
  readSoundEnabled,
  setSoundEnabled,
  SOUND_PROFILES,
  type SoundEffectType,
} from './soundEffects';

test('SOUND_PROFILES define subtle, valid acoustic envelopes for all interaction types', () => {
  const types: SoundEffectType[] = [
    'click',
    'matchCreated',
    'lobbyTransition',
    'lobbyEnter',
  ];

  for (const type of types) {
    const steps = SOUND_PROFILES[type];
    assert.ok(steps.length >= 1, `${type} must have at least one tone step`);
    for (const step of steps) {
      assert.ok(step.frequency > 0, `${type} frequency must be positive`);
      assert.ok(step.durationSec > 0 && step.durationSec <= 0.3, `${type} duration stays crisp`);
      assert.ok(step.gain > 0 && step.gain <= 0.12, `${type} gain stays subtle`);
    }
  }
});

test('sound preference and safe SSR/Node fallbacks behave deterministically', () => {
  assert.equal(readSoundEnabled(), true);
  setSoundEnabled(false);
  assert.equal(readSoundEnabled(), false);
  assert.equal(playSound('matchCreated'), false);

  setSoundEnabled(true);
  assert.equal(readSoundEnabled(), true);
  // Safe no-op in Node without Web Audio API
  assert.equal(playSound('click'), false);
  assert.equal(getInteractiveClickTarget(null), null);
});
