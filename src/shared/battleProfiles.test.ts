import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureProfilesFromBattle,
  captureProfilesFromBattlesBatch,
  computeBattleProfileStats,
  createInitialSeededBattleProfiles,
  exportBattleProfilesToCsv,
  exportUniquePhoneNumbersList,
  extractCaptureInputFromExternalChallenge,
  extractNormalizedPhone,
  extractPhoneFromObject,
  filterBattleProfiles,
  updateBattleProfilePhone,
  validateRequiredBattlePhone,
} from './battleProfiles';

test('extractNormalizedPhone handles Indian mobile formats and rejects invalid numbers', () => {
  const plain = extractNormalizedPhone('9876543210');
  assert.equal(plain.valid, true);
  assert.equal(plain.phone, '9876543210');
  assert.equal(plain.formattedPhone, '+91 98765 43210');

  const withPrefix = extractNormalizedPhone('+91 98112-23344');
  assert.equal(withPrefix.valid, true);
  assert.equal(withPrefix.phone, '9811223344');

  const withZero = extractNormalizedPhone('09123456789');
  assert.equal(withZero.valid, true);
  assert.equal(withZero.phone, '9123456789');

  const invalid = extractNormalizedPhone('12345');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.phone, '');

  const requiredErr = validateRequiredBattlePhone('');
  assert.equal(requiredErr.valid, false);
  assert.ok(requiredErr.error);
});

test('extractPhoneFromObject finds phone numbers across common and nested payload keys', () => {
  assert.equal(extractPhoneFromObject({ mobile: '+91 98100 11223' }), '9810011223');
  assert.equal(extractPhoneFromObject({ whatsapp: '9988776655' }), '9988776655');
  assert.equal(
    extractPhoneFromObject({ profile: { contactNumber: '917766554433' } }),
    '7766554433'
  );
  assert.equal(extractPhoneFromObject({ username: 'Aarav' }), '');
});

test('captureProfilesFromBattle records host and opponent, deduplicates repeated battle syncs, and never wipes saved phone', () => {
  const t1 = '2026-11-21T10:00:00.000Z';
  const first = captureProfilesFromBattle(
    [],
    {
      battleCode: 'BTL001',
      amount: 100,
      mode: 'Classic',
      createdAt: t1,
      source: 'battle_create',
      participants: [
        {
          userId: 'u-1',
          name: 'Rohan',
          phone: '9876543210',
          role: 'host',
        },
        {
          userId: 'u-2',
          name: 'Priya',
          phone: '',
          role: 'opponent',
        },
      ],
    },
    t1
  );

  assert.equal(first.addedCount, 2);
  assert.equal(first.profiles.length, 2);
  const rohan = first.profiles.find((p) => p.userId === 'u-1');
  assert.equal(rohan?.phone, '9876543210');
  assert.equal(rohan?.battlesCount, 1);
  assert.equal(rohan?.totalStakeAmount, 100);

  // Repeat socket poll for the exact same battle without phone must NOT double-count or wipe phone
  const repeat = captureProfilesFromBattle(
    first.profiles,
    {
      battleCode: 'BTL001',
      amount: 100,
      mode: 'Classic',
      createdAt: '2026-11-21T10:01:00.000Z',
      source: 'live_socket',
      participants: [
        {
          userId: 'u-1',
          name: 'Rohan',
          phone: '',
          role: 'host',
        },
      ],
    },
    '2026-11-21T10:01:00.000Z'
  );

  const rohanAfterRepeat = repeat.profiles.find((p) => p.userId === 'u-1');
  assert.equal(rohanAfterRepeat?.phone, '9876543210');
  assert.equal(rohanAfterRepeat?.battlesCount, 1);
  assert.equal(rohanAfterRepeat?.totalStakeAmount, 100);

  // Second distinct battle increments count and upgrades missing opponent phone
  const second = captureProfilesFromBattle(
    repeat.profiles,
    {
      battleCode: 'BTL002',
      amount: 250,
      mode: 'Quick',
      createdAt: '2026-11-21T10:05:00.000Z',
      source: 'battle_join',
      participants: [
        {
          userId: 'u-1',
          name: 'Rohan',
          phone: '9876543210',
          role: 'opponent',
        },
        {
          userId: 'u-2',
          name: 'Priya',
          phone: '9811998877',
          role: 'host',
        },
      ],
    },
    '2026-11-21T10:05:00.000Z'
  );

  const rohanAfterSecond = second.profiles.find((p) => p.userId === 'u-1');
  const priyaAfterSecond = second.profiles.find((p) => p.userId === 'u-2');
  assert.equal(rohanAfterSecond?.battlesCount, 2);
  assert.equal(rohanAfterSecond?.totalStakeAmount, 350);
  assert.deepEqual(rohanAfterSecond?.roleHistory, ['host', 'opponent']);
  assert.equal(priyaAfterSecond?.phone, '9811998877');
  assert.equal(priyaAfterSecond?.formattedPhone, '+91 98119 98877');
});

test('extractCaptureInputFromExternalChallenge attaches current user phone and payload phones', () => {
  const captured = extractCaptureInputFromExternalChallenge(
    {
      _id: 'ch_991',
      amount: 500,
      mode: 'CLASSIC',
      createdAt: '2026-11-21T12:00:00.000Z',
      creator: {
        _id: 'uid_me',
        username: 'AmanPro',
      },
      player: {
        _id: 'uid_opp',
        username: 'Kiran',
        phone: '+91 98700 11223',
      },
    },
    {
      id: 'uid_me',
      name: 'AmanPro',
      mobile: '9988112233',
      referralCode: 'AMAN77',
    }
  );

  assert.ok(captured);
  assert.equal(captured.battleCode, 'ch_991');
  assert.equal(captured.participants.length, 2);
  assert.equal(captured.participants[0].phone, '9988112233');
  assert.equal(captured.participants[0].referralCode, 'AMAN77');
  assert.equal(captured.participants[1].phone, '9870011223');
});

test('updateBattleProfilePhone validates phone and updates target profile', () => {
  const { profiles } = captureProfilesFromBattle([], {
    battleCode: 'BTL999',
    amount: 200,
    mode: 'Classic',
    source: 'live_socket',
    participants: [{ userId: 'u-x', name: 'Deepak', role: 'host' }],
  });

  const invalid = updateBattleProfilePhone(profiles, profiles[0].id, '123');
  assert.ok(invalid.error);

  const ok = updateBattleProfilePhone(profiles, profiles[0].id, '9898989898');
  assert.equal(ok.error, undefined);
  assert.equal(ok.updatedProfile?.phone, '9898989898');
  assert.equal(ok.updatedProfile?.formattedPhone, '+91 98989 89898');
});

test('filterBattleProfiles, stats, and safe CSV/phone exports work accurately', () => {
  const { profiles } = captureProfilesFromBattlesBatch([], [
    {
      battleCode: 'B1',
      amount: 100,
      mode: 'Classic',
      source: 'battle_create',
      participants: [
        { userId: 'u1', name: '=EvilName', phone: '9811111111', role: 'host' },
        { userId: 'u2', name: 'NoPhoneUser', phone: '', role: 'opponent' },
      ],
    },
  ]);

  const stats = computeBattleProfileStats(profiles);
  assert.equal(stats.totalProfiles, 2);
  assert.equal(stats.withPhoneCount, 1);
  assert.equal(stats.missingPhoneCount, 1);
  assert.equal(stats.phoneCoveragePct, 50);

  assert.equal(filterBattleProfiles(profiles, { phoneFilter: 'with_phone' }).length, 1);
  assert.equal(filterBattleProfiles(profiles, { phoneFilter: 'missing_phone' }).length, 1);
  assert.equal(filterBattleProfiles(profiles, { query: '98111' }).length, 1);

  const csv = exportBattleProfilesToCsv(profiles);
  assert.ok(csv.includes("'=EvilName"));
  assert.ok(csv.includes('9811111111'));
  assert.ok(csv.includes('MISSING'));

  const phonesOnly = exportUniquePhoneNumbersList(profiles);
  assert.equal(phonesOnly, '9811111111');

  const seeded = createInitialSeededBattleProfiles();
  assert.ok(seeded.length >= 5);
  assert.ok(seeded.every((p) => p.phone.length === 10));
});
