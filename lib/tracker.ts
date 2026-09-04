import {
  LIVE_EXTRAPOLATION_SECONDS,
  PROFILE_ORDER,
  PROFILES,
  STALE_AFTER_SECONDS,
  isProfileId,
} from "./config";
import { probabilitySummary, parisDateKey, rebuildDerived, totalsFrom } from "./domain";
import { deliverEffect } from "./discord";
import { processProfilePresence } from "./engine";
import { acquireLock, releaseLock } from "./redis";
import { getPresences } from "./roblox";
import { TRACKER_LOCK_KEY, addLog, loadAllRecords, saveAllRecords } from "./storage";
import type {
  CompletedSession,
  ManualAdjustment,
  ProfileId,
  ProfileRecord,
  ProfileStatus,
  SessionEndReason,
} from "./types";

function statusFor(profileId: ProfileId, record: ProfileRecord, now: number): ProfileStatus {
  const config = PROFILES[profileId];
  const totals = totalsFrom(record);
  const lastCheckAgeSeconds = record.state
    ? Math.max(0, Math.floor((now - record.state.lastCheckedAt) / 1000))
    : null;
  const liveExtra =
    record.state?.activeSession && record.state.isAfkWorld && lastCheckAgeSeconds !== null
      ? Math.min(lastCheckAgeSeconds, LIVE_EXTRAPOLATION_SECONDS)
      : 0;
  const today = parisDateKey(now);
  return {
    config,
    state: record.state,
    stats: record.stats,
    logs: record.logs.slice(0, 50),
    totals: {
      ...totals,
      baseAfkSeconds: record.base.afkSeconds,
      baseRewards: record.base.rewards,
      ...probabilitySummary(totals.totalRewards, config.rewardIntervalMinutes),
    },
    live: {
      stale: lastCheckAgeSeconds === null || lastCheckAgeSeconds > STALE_AFTER_SECONDS,
      lastCheckAgeSeconds,
      currentSessionSeconds: record.state?.activeSession
        ? record.state.activeSession.observedSeconds + liveExtra
        : 0,
      sessionStartedAt: record.state?.activeSession?.startedAt || null,
    },
    sessionsToday: record.sessions.filter((session) => parisDateKey(session.startedAt) === today).length,
  };
}

export async function getStatus() {
  const records = await loadAllRecords();
  const now = Date.now();
  return {
    checkedAt: now,
    profiles: Object.fromEntries(PROFILE_ORDER.map((id) => [id, statusFor(id, records[id], now)])),
  };
}

export async function getSessions(profileId: ProfileId) {
  const records = await loadAllRecords();
  return { profileId, sessions: records[profileId].sessions };
}

export async function runCheck() {
  const lock = await acquireLock(TRACKER_LOCK_KEY);
  if (!lock) return { ok: true, skipped: true, reason: "check already running" };
  try {
    const now = Date.now();
    const [records, presences] = await Promise.all([loadAllRecords(), getPresences(now)]);
    const effects = [];
    for (const profileId of PROFILE_ORDER) {
      const result = processProfilePresence(PROFILES[profileId], records[profileId], presences[profileId], now);
      records[profileId] = result.record;
      effects.push(...result.effects);
    }
    await saveAllRecords(records);
    const discord = await Promise.all(effects.map(deliverEffect));
    return {
      ok: true,
      skipped: false,
      checkedAt: now,
      presences: Object.fromEntries(PROFILE_ORDER.map((id) => [id, presences[id]])),
      effects: effects.map((effect) => ({ type: effect.type, profileId: effect.profileId })),
      discord,
    };
  } finally {
    await releaseLock(TRACKER_LOCK_KEY, lock);
  }
}

function numberField(value: unknown, name: string, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`${name} invalide`);
  return parsed;
}

function textField(value: unknown, fallback: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  return parsed || fallback;
}

function adminLog(profileId: ProfileId, title: string, detail: string, at: number, sessionId?: string) {
  return {
    id: crypto.randomUUID(),
    profileId,
    at,
    kind: "admin_change" as const,
    title,
    detail,
    placeId: null,
    sessionId,
  };
}

function updateTotals(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const current = totalsFrom(record);
  const targetAfkMinutes = numberField(input.totalAfkMinutes, "Temps AFK total");
  const targetRewards = Math.floor(numberField(input.totalRewards, "Récompenses totales"));
  const adjustment: ManualAdjustment = {
    id: crypto.randomUUID(),
    at: now,
    afkSecondsDelta: Math.round(targetAfkMinutes * 60) - current.totalAfkSeconds,
    rewardsDelta: targetRewards - current.totalRewards,
    reason: textField(input.reason, "Correction manuelle des totaux"),
  };
  record.adjustments.push(adjustment);
  const rebuilt = rebuildDerived(record.base, record.sessions, record.adjustments, record.stats, now);
  record.sessions = rebuilt.sessions;
  record.stats = rebuilt.stats;
  addLog(record, adminLog(profileId, "Totaux corrigés manuellement", adjustment.reason, now));
}

function updateBase(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  record.base = {
    afkSeconds: Math.round(numberField(input.baseAfkMinutes, "Temps AFK de base") * 60),
    rewards: Math.floor(numberField(input.baseRewards, "Récompenses de base")),
    updatedAt: now,
  };
  const rebuilt = rebuildDerived(record.base, record.sessions, record.adjustments, record.stats, now);
  record.sessions = rebuilt.sessions;
  record.stats = rebuilt.stats;
  addLog(record, adminLog(profileId, "Valeurs de base modifiées", textField(input.reason, "Correction de la base"), now));
}

const END_REASONS: SessionEndReason[] = [
  "offline",
  "ink_game",
  "other_game",
  "online",
  "studio",
  "invisible",
  "unknown",
  "manual",
];

function updateSession(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const sessionId = textField(input.sessionId, "");
  const index = record.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error("Session introuvable");
  const startedAt = Math.floor(numberField(input.startedAt, "Début", 1));
  const endedAt = Math.floor(numberField(input.endedAt, "Fin", startedAt + 1));
  const durationSeconds = Math.floor(numberField(input.durationSeconds, "Durée"));
  if (Math.abs(endedAt - startedAt - durationSeconds * 1000) > 1000) {
    throw new Error("La durée doit correspondre exactement au début et à la fin");
  }
  const interval = Math.floor(numberField(input.rewardIntervalMinutes, "Intervalle", 1));
  const rewards = Math.floor(numberField(input.rewardsEarned, "Récompenses"));
  const creditedSeconds = Math.floor(numberField(input.creditedAfkSeconds, "Temps crédité"));
  if (creditedSeconds !== rewards * interval * 60) {
    throw new Error("Le temps crédité doit correspondre aux récompenses × intervalle");
  }
  const reason = END_REASONS.includes(input.endReason as SessionEndReason)
    ? (input.endReason as SessionEndReason)
    : "manual";
  const previous = record.sessions[index];
  const updated: CompletedSession = {
    ...previous,
    startedAt,
    endedAt,
    durationSeconds,
    rewardIntervalMinutes: interval,
    rewardsEarned: rewards,
    creditedAfkSeconds: creditedSeconds,
    endReason: reason,
    endLabel: textField(input.endLabel, previous.endLabel),
    updatedAt: now,
    source: "admin",
  };
  record.sessions[index] = updated;
  const rebuilt = rebuildDerived(record.base, record.sessions, record.adjustments, record.stats, now);
  record.sessions = rebuilt.sessions;
  record.stats = rebuilt.stats;
  addLog(
    record,
    adminLog(profileId, "Session corrigée manuellement", textField(input.reason, `Session ${sessionId}`), now, sessionId),
  );
}

export async function adminAction(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Action admin invalide");
  const body = input as Record<string, unknown>;
  if (!isProfileId(body.profileId)) throw new Error("Profil invalide");
  const action = textField(body.action, "");
  const lock = await acquireLock(TRACKER_LOCK_KEY);
  if (!lock) throw new Error("Une vérification est en cours, réessayez dans quelques secondes");
  try {
    const records = await loadAllRecords();
    const record = records[body.profileId];
    const now = Date.now();
    if (action === "update_totals") updateTotals(record, body.profileId, body, now);
    else if (action === "update_base") updateBase(record, body.profileId, body, now);
    else if (action === "update_session") updateSession(record, body.profileId, body, now);
    else throw new Error("Action admin inconnue");
    records[body.profileId] = record;
    await saveAllRecords(records);
    return { ok: true, profile: statusFor(body.profileId, record, now) };
  } finally {
    await releaseLock(TRACKER_LOCK_KEY, lock);
  }
}
