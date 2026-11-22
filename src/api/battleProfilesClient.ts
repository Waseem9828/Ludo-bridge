import {
  captureProfilesFromBattle,
  captureProfilesFromBattlesBatch,
  ensureBattleProfilesStore,
  updateBattleProfilePhone,
  type BattleProfileCaptureInput,
  type BattleUserProfile,
} from '../shared/battleProfiles';

const BATTLE_PROFILES_LOCAL_KEY = 'ludobridge.battleProfiles.v1';

const syncedSignatures = new Set<string>();

function readLocalBattleProfiles(): BattleUserProfile[] {
  if (typeof window === 'undefined') return ensureBattleProfilesStore(null);
  try {
    const raw = window.localStorage.getItem(BATTLE_PROFILES_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BattleUserProfile[];
      if (Array.isArray(parsed)) {
        return ensureBattleProfilesStore(parsed);
      }
    }
  } catch {
    // ignore storage errors
  }
  const seeded = ensureBattleProfilesStore(null);
  writeLocalBattleProfiles(seeded);
  return seeded;
}

function writeLocalBattleProfiles(profiles: BattleUserProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      BATTLE_PROFILES_LOCAL_KEY,
      JSON.stringify(profiles)
    );
  } catch {
    // ignore storage errors
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit | undefined,
  fallback: () => T
): Promise<T> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return fallback();
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (payload as { error?: string }).error || 'Battle profiles request failed.'
      );
    }
    return payload as T;
  } catch (err) {
    if (err instanceof TypeError) {
      return fallback();
    }
    throw err;
  }
}

export async function fetchBattleProfiles(): Promise<{
  profiles: BattleUserProfile[];
}> {
  const result = await requestJson<{ profiles: BattleUserProfile[] }>(
    '/api/admin/battle-profiles',
    undefined,
    () => ({ profiles: readLocalBattleProfiles() })
  );
  if (Array.isArray(result.profiles)) {
    writeLocalBattleProfiles(result.profiles);
  }
  return result;
}

export async function captureBattleProfilesOnServer(
  battles: BattleProfileCaptureInput[]
): Promise<{ profiles: BattleUserProfile[]; addedCount: number; updatedCount: number }> {
  if (!Array.isArray(battles) || battles.length === 0) {
    return { profiles: readLocalBattleProfiles(), addedCount: 0, updatedCount: 0 };
  }

  // Always update local cache immediately so no profile is ever missed
  const localCurrent = readLocalBattleProfiles();
  const localMerged = captureProfilesFromBattlesBatch(localCurrent, battles);
  writeLocalBattleProfiles(localMerged.profiles);

  // Deduplicate repeated identical polls before hitting backend
  const freshToSync: BattleProfileCaptureInput[] = [];
  for (const battle of battles) {
    const sig = `${battle.battleCode}|${battle.participants
      .map((p) => `${p.userId ?? ''}:${p.name}:${p.phone ?? ''}:${p.role}`)
      .join(',')}`;
    if (!syncedSignatures.has(sig)) {
      syncedSignatures.add(sig);
      freshToSync.push(battle);
    }
  }
  if (syncedSignatures.size > 1200) {
    syncedSignatures.clear();
  }

  if (freshToSync.length === 0) {
    return localMerged;
  }

  const result = await requestJson<{
    profiles: BattleUserProfile[];
    addedCount: number;
    updatedCount: number;
  }>(
    '/api/admin/battle-profiles/capture',
    {
      method: 'POST',
      body: JSON.stringify({ battles: freshToSync.slice(0, 100) }),
    },
    () => localMerged
  );

  if (Array.isArray(result.profiles)) {
    writeLocalBattleProfiles(result.profiles);
  }
  return result;
}

export async function saveManualBattleProfile(input: {
  name: string;
  phone: string;
  battleCode?: string;
  amount?: number;
  role?: 'host' | 'opponent';
  referralCode?: string;
}): Promise<{ profiles: BattleUserProfile[] }> {
  const payload: BattleProfileCaptureInput = {
    battleCode:
      input.battleCode?.trim().toUpperCase() ||
      `MAN-${Date.now().toString(36).toUpperCase().slice(-5)}`,
    amount: Math.max(0, Math.round(Number(input.amount) || 100)),
    mode: 'Classic',
    createdAt: new Date().toISOString(),
    source: 'manual_update',
    participants: [
      {
        name: input.name.trim(),
        phone: input.phone.trim(),
        referralCode: input.referralCode?.trim() || undefined,
        role: input.role ?? 'host',
      },
    ],
  };

  const result = await requestJson<{ profiles: BattleUserProfile[] }>(
    '/api/admin/battle-profiles/capture',
    {
      method: 'POST',
      body: JSON.stringify({ battles: [payload], requirePhone: true }),
    },
    () => {
      const local = readLocalBattleProfiles();
      const merged = captureProfilesFromBattle(local, payload);
      writeLocalBattleProfiles(merged.profiles);
      return { profiles: merged.profiles };
    }
  );

  if (Array.isArray(result.profiles)) {
    writeLocalBattleProfiles(result.profiles);
  }
  return result;
}

export async function saveBattleProfilePhone(
  profileId: string,
  phone: string
): Promise<{ profiles: BattleUserProfile[] }> {
  const result = await requestJson<{ profiles: BattleUserProfile[] }>(
    `/api/admin/battle-profiles/${encodeURIComponent(profileId)}/phone`,
    {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    },
    () => {
      const local = readLocalBattleProfiles();
      const updated = updateBattleProfilePhone(local, profileId, phone);
      if (updated.error) {
        throw new Error(updated.error);
      }
      writeLocalBattleProfiles(updated.profiles);
      return { profiles: updated.profiles };
    }
  );

  if (Array.isArray(result.profiles)) {
    writeLocalBattleProfiles(result.profiles);
  }
  return result;
}

export async function deleteBattleProfile(
  profileId: string
): Promise<{ profiles: BattleUserProfile[] }> {
  const result = await requestJson<{ profiles: BattleUserProfile[] }>(
    `/api/admin/battle-profiles/${encodeURIComponent(profileId)}`,
    { method: 'DELETE' },
    () => {
      const next = readLocalBattleProfiles().filter((p) => p.id !== profileId);
      writeLocalBattleProfiles(next);
      return { profiles: next };
    }
  );

  if (Array.isArray(result.profiles)) {
    writeLocalBattleProfiles(result.profiles);
  }
  return result;
}
