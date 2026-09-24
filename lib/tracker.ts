import {
  LIVE_EXTRAPOLATION_SECONDS,
  PROFILE_ORDER,
  PROFILES,
  STALE_AFTER_SECONDS,
  isProfileId,
} from "./config";
import {
  probabilitySummary,
  parisDateKey,
  rebuildDerived,
  rewardCredit,
  synchronizedSessionValues,
  totalsFrom,
} from "./domain";
import { deliverEffect } from "./discord";
import { processProfilePresence } from "./engine";
import { acquireLock, releaseLock } from "./redis";
import { getPresences } from "./roblox";
import { TRACKER_LOCK_KEY, addLog, loadAllRecords, saveAllRecords } from "./storage";
import type {
  AchievementId,
  CompletedSession,
  ManualAdjustment,
  ProfileId,
  ProfileRecord,
  ProfileStatus,
  SessionEndReason,
  SessionView,
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
    achievements: record.achievements,
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
      disconnectPending: Boolean(record.state?.activeSession?.pendingDisconnectAt),
    },
    sessionsToday: record.sessions.filter((session) => parisDateKey(session.startedAt) === today).length + (record.state?.activeSession && parisDateKey(record.state.activeSession.startedAt) === today ? 1 : 0),
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
  const record = records[profileId];
  const now = Date.now();
  const active = record.state?.activeSession;
  const activeView: SessionView | null = active
    ? (() => {
        const liveExtra = record.state?.isAfkWorld && record.state.lastCheckedAt
          ? Math.min(LIVE_EXTRAPOLATION_SECONDS, Math.max(0, Math.floor((now - record.state.lastCheckedAt) / 1000)))
          : 0;
        const observedSeconds = active.observedSeconds + liveExtra;
        const credit = rewardCredit(observedSeconds, PROFILES[profileId].rewardIntervalMinutes);
        const totals = totalsFrom(record);
        return {
          id: active.id, profileId, startedAt: active.startedAt, endedAt: now,
          durationSeconds: observedSeconds,
          rewardIntervalMinutes: PROFILES[profileId].rewardIntervalMinutes,
          rewardsEarned: credit.rewards, creditedAfkSeconds: credit.creditedAfkSeconds,
          totalAfkBefore: totals.totalAfkSeconds, totalAfkAfter: totals.totalAfkSeconds + credit.creditedAfkSeconds,
          totalRewardsBefore: totals.totalRewards, totalRewardsAfter: totals.totalRewards + credit.rewards,
          endReason: "manual", endLabel: active.pendingDisconnectAt ? "En cours · déconnexion en attente" : "En cours · AFK World",
          createdAt: active.startedAt, updatedAt: now, source: "automatic", synchronized: true,
          active: true, liveObservedSeconds: observedSeconds,
        };
      })()
    : null;
  return { profileId, sessions: activeView ? [activeView, ...record.sessions] : record.sessions };
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

function booleanField(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
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

function sessionFromInput(
  profileId: ProfileId,
  input: Record<string, unknown>,
  now: number,
  previous?: CompletedSession,
) {
  const startedAt = Math.floor(numberField(input.startedAt, "Début", 1));
  const endedAt = Math.floor(numberField(input.endedAt, "Fin", startedAt + 1));
  const interval = Math.floor(numberField(input.rewardIntervalMinutes, "Intervalle", 1));
  const synchronized = booleanField(input.synchronized, true);
  const synced = synchronizedSessionValues(startedAt, endedAt, interval);
  const durationSeconds = synchronized
    ? synced.durationSeconds
    : Math.floor(numberField(input.durationSeconds, "Durée"));
  const rewards = synchronized
    ? synced.rewards
    : Math.floor(numberField(input.rewardsEarned, "Récompenses"));
  const creditedSeconds = synchronized
    ? synced.creditedAfkSeconds
    : Math.floor(numberField(input.creditedAfkSeconds, "Temps crédité"));
  const reason = END_REASONS.includes(input.endReason as SessionEndReason)
    ? (input.endReason as SessionEndReason)
    : "manual";

  return {
    id: previous?.id || crypto.randomUUID(),
    profileId,
    startedAt,
    endedAt,
    durationSeconds,
    rewardIntervalMinutes: interval,
    rewardsEarned: rewards,
    creditedAfkSeconds: creditedSeconds,
    totalAfkBefore: synchronized
      ? previous?.totalAfkBefore || 0
      : Math.floor(numberField(input.totalAfkBefore, "Total AFK avant")),
    totalAfkAfter: synchronized
      ? previous?.totalAfkAfter || 0
      : Math.floor(numberField(input.totalAfkAfter, "Total AFK après")),
    totalRewardsBefore: synchronized
      ? previous?.totalRewardsBefore || 0
      : Math.floor(numberField(input.totalRewardsBefore, "Récompenses avant")),
    totalRewardsAfter: synchronized
      ? previous?.totalRewardsAfter || 0
      : Math.floor(numberField(input.totalRewardsAfter, "Récompenses après")),
    endReason: reason,
    endLabel: textField(input.endLabel, previous?.endLabel || "Session ajoutée manuellement"),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    source: "admin",
    synchronized,
  } satisfies CompletedSession;
}

function rebuildRecord(record: ProfileRecord, now: number) {
  const rebuilt = rebuildDerived(record.base, record.sessions, record.adjustments, record.stats, now);
  record.sessions = rebuilt.sessions;
  record.stats = rebuilt.stats;
}

function updateSession(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const sessionId = textField(input.sessionId, "");
  const index = record.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error("Session introuvable");
  const updated = sessionFromInput(profileId, input, now, record.sessions[index]);
  record.sessions[index] = updated;
  rebuildRecord(record, now);
  addLog(
    record,
    adminLog(profileId, "Session corrigée manuellement", textField(input.reason, `Session ${sessionId}`), now, sessionId),
  );
}

function createSession(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const session = sessionFromInput(profileId, input, now);
  record.sessions.push(session);
  rebuildRecord(record, now);
  addLog(
    record,
    adminLog(
      profileId,
      "Session créée manuellement",
      textField(input.reason, `Session ${session.id}`),
      now,
      session.id,
    ),
  );
}

function deleteSession(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const sessionId = textField(input.sessionId, "");
  const index = record.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error("Session introuvable");
  record.sessions.splice(index, 1);
  rebuildRecord(record, now);
  addLog(
    record,
    adminLog(
      profileId,
      "Session supprimée",
      textField(input.reason, `Suppression de la session ${sessionId}`),
      now,
      sessionId,
    ),
  );
}

function updateActiveSession(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const active = record.state?.activeSession;
  if (!active) throw new Error("Aucune session en cours");
  const sessionId = textField(input.sessionId, active.id);
  if (sessionId !== active.id) throw new Error("Session en cours introuvable");
  active.startedAt = Math.floor(numberField(input.startedAt, "Début", 1));
  active.observedSeconds = Math.floor(numberField(input.observedSeconds ?? input.durationSeconds, "Durée", 0));
  if (input.pendingDisconnectAt !== undefined) {
    active.pendingDisconnectAt = input.pendingDisconnectAt === null ? null : Math.floor(numberField(input.pendingDisconnectAt, "Déconnexion en attente", 0));
  }
  record.state = { ...record.state!, activeSession: active };
  addLog(record, adminLog(profileId, "Session en cours modifiée", textField(input.reason, "Correction de session en cours"), now, active.id));
}

function mergeSessions(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  const requestedIds = Array.isArray(input.sessionIds)
    ? [...new Set(input.sessionIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : [];
  if (requestedIds.length < 2) throw new Error("Sélectionnez au moins deux sessions à fusionner");
  const active = record.state?.activeSession && requestedIds.includes(record.state.activeSession.id) ? record.state.activeSession : null;
  const selected = record.sessions
    .filter((session) => requestedIds.includes(session.id))
    .sort((left, right) => left.startedAt - right.startedAt);
  if (selected.length + (active ? 1 : 0) !== requestedIds.length) throw new Error("Une session sélectionnée est introuvable");

  const startedAt = Math.min(...selected.map((session) => session.startedAt).concat(active ? [active.startedAt] : []));
  const endedAt = active ? now : Math.max(...selected.map((session) => session.endedAt));
  const interval = PROFILES[profileId].rewardIntervalMinutes;
  const synced = synchronizedSessionValues(startedAt, endedAt, interval);
  const lastSession = [...selected].sort((left, right) => right.endedAt - left.endedAt)[0];
  const merged: CompletedSession = {
    id: crypto.randomUUID(),
    profileId,
    startedAt,
    endedAt,
    durationSeconds: synced.durationSeconds,
    rewardIntervalMinutes: interval,
    rewardsEarned: synced.rewards,
    creditedAfkSeconds: synced.creditedAfkSeconds,
    totalAfkBefore: 0,
    totalAfkAfter: 0,
    totalRewardsBefore: 0,
    totalRewardsAfter: 0,
    endReason: active ? "manual" : lastSession.endReason,
    endLabel: active ? `Fusion de ${selected.length + 1} sessions · session en cours conservée` : `Fusion de ${selected.length} sessions · ${lastSession.endLabel}`,
    createdAt: Math.min(...selected.map((session) => session.createdAt)),
    updatedAt: now,
    source: "admin",
    synchronized: true,
  };
  record.sessions = record.sessions.filter((session) => !requestedIds.includes(session.id));
  if (active) {
    record.state = {
      ...record.state!,
      activeSession: {
        ...active,
        startedAt,
        observedSeconds: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
        pendingDisconnectAt: null,
      },
    };
  } else {
    record.sessions.push(merged);
  }
  rebuildRecord(record, now);
  addLog(
    record,
    adminLog(
      profileId,
      `${selected.length + (active ? 1 : 0)} sessions fusionnées`,
      textField(input.reason, "Fausse déconnexion corrigée · interruption incluse dans la durée"),
      now,
      active?.id || merged.id,
    ),
  );
}

const ACHIEVEMENT_LABELS: Record<AchievementId, string> = {
  title: "Titre",
  ultra_instinct: "Ultra Instinct",
  rumor: "Rumor",
};

function confirmAchievement(record: ProfileRecord, profileId: ProfileId, input: Record<string, unknown>, now: number) {
  if (typeof input.achievementId !== "string" || !(input.achievementId in ACHIEVEMENT_LABELS)) {
    throw new Error("Récompense invalide");
  }
  const achievementId = input.achievementId as AchievementId;
  const label = ACHIEVEMENT_LABELS[achievementId];
  if (record.achievements[achievementId]) throw new Error(`${label} est déjà confirmé comme obtenu`);

  const sessionId = typeof input.sessionId === "string" ? input.sessionId : null;
  const session = sessionId ? record.sessions.find((item) => item.id === sessionId) : null;
  const active = record.state?.activeSession && record.state.activeSession.id === sessionId ? record.state.activeSession : null;
  if (sessionId && !session && !active) throw new Error("Session de récompense introuvable");

  const totals = totalsFrom(record);
  let obtainedAt = now;
  let totalRewardsAt = totals.totalRewards;
  let totalAfkSecondsAt = totals.totalAfkSeconds;
  if (session) {
    obtainedAt = session.endedAt;
    totalRewardsAt = session.totalRewardsAfter;
    totalAfkSecondsAt = session.totalAfkAfter;
  } else if (active) {
    const liveExtra = record.state?.isAfkWorld && record.state.lastCheckedAt
      ? Math.min(LIVE_EXTRAPOLATION_SECONDS, Math.max(0, Math.floor((now - record.state.lastCheckedAt) / 1000)))
      : 0;
    const observedSeconds = active.observedSeconds + liveExtra;
    const credit = rewardCredit(observedSeconds, PROFILES[profileId].rewardIntervalMinutes);
    obtainedAt = active.startedAt + credit.creditedAfkSeconds * 1000;
    totalRewardsAt = totals.totalRewards + credit.rewards;
    totalAfkSecondsAt = totals.totalAfkSeconds + credit.creditedAfkSeconds;
  }
  record.achievements[achievementId] = {
    id: achievementId, obtainedAt, sessionId, totalRewardsAt, totalAfkSecondsAt,
  };

  const totalMinutes = Math.floor(totals.totalAfkSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  addLog(
    record,
    adminLog(
      profileId,
      `${label} obtenu`,
      `Confirmé à ${totals.totalRewards} récompenses · ${hours}h ${String(minutes).padStart(2, "0")}m AFK`,
      now,
    ),
  );
}

export function applyAdminActionToRecord(
  record: ProfileRecord,
  profileId: ProfileId,
  body: Record<string, unknown>,
  now = Date.now(),
) {
  const action = textField(body.action, "");
  if (action === "update_totals") updateTotals(record, profileId, body, now);
  else if (action === "update_base") updateBase(record, profileId, body, now);
  else if (action === "update_session") updateSession(record, profileId, body, now);
  else if (action === "update_active_session") updateActiveSession(record, profileId, body, now);
  else if (action === "create_session") createSession(record, profileId, body, now);
  else if (action === "delete_session") deleteSession(record, profileId, body, now);
  else if (action === "merge_sessions") mergeSessions(record, profileId, body, now);
  else if (action === "confirm_achievement") confirmAchievement(record, profileId, body, now);
  else throw new Error("Action admin inconnue");
  return record;
}

export async function adminAction(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Action admin invalide");
  const body = input as Record<string, unknown>;
  if (!isProfileId(body.profileId)) throw new Error("Profil invalide");
  const lock = await acquireLock(TRACKER_LOCK_KEY);
  if (!lock) throw new Error("Une vérification est en cours, réessayez dans quelques secondes");
  try {
    const records = await loadAllRecords();
    const record = records[body.profileId];
    const now = Date.now();
    applyAdminActionToRecord(record, body.profileId, body, now);
    records[body.profileId] = record;
    await saveAllRecords(records);
    return { ok: true, profile: statusFor(body.profileId, record, now) };
  } finally {
    await releaseLock(TRACKER_LOCK_KEY, lock);
  }
}
