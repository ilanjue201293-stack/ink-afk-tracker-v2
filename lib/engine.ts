import { MAX_TRUSTED_GAP_SECONDS } from "./config";
import { rebuildDerived, rewardCredit, totalsFrom } from "./domain";
import { endReason, placeLabel } from "./roblox";
import { addLog } from "./storage";
import type {
  CompletedSession,
  EngineEffect,
  PresenceSnapshot,
  ProfileConfig,
  ProfileRecord,
  ProfileState,
  TrackerLog,
} from "./types";

function log(
  config: ProfileConfig,
  at: number,
  kind: TrackerLog["kind"],
  title: string,
  detail: string,
  placeId: number | null,
  sessionId?: string,
): TrackerLog {
  return { id: crypto.randomUUID(), profileId: config.id, at, kind, title, detail, placeId, sessionId };
}

function cloneRecord(record: ProfileRecord): ProfileRecord {
  return {
    state: record.state ? { ...record.state, activeSession: record.state.activeSession ? { ...record.state.activeSession } : null } : null,
    base: { ...record.base },
    stats: { ...record.stats },
    sessions: record.sessions.map((session) => ({ ...session })),
    adjustments: record.adjustments.map((adjustment) => ({ ...adjustment })),
    logs: record.logs.map((item) => ({ ...item })),
  };
}

export function processProfilePresence(
  config: ProfileConfig,
  input: ProfileRecord,
  presence: PresenceSnapshot,
  now: number,
) {
  const record = cloneRecord(input);
  const previous = record.state;
  const effects: EngineEffect[] = [];
  let sessionTransition = false;

  const activeSession = previous?.activeSession ? { ...previous.activeSession } : null;
  const deltaSeconds = previous?.lastCheckedAt
    ? Math.max(0, Math.floor((now - previous.lastCheckedAt) / 1000))
    : 0;
  const trustedDelta = deltaSeconds > 0 && deltaSeconds <= MAX_TRUSTED_GAP_SECONDS;

  const state: ProfileState = {
    ...presence,
    checkedAt: now,
    lastCheckedAt: now,
    currentSince:
      previous && previous.presenceType === presence.presenceType && previous.placeId === presence.placeId
        ? previous.currentSince
        : now,
    activeSession,
  };

  record.stats.checks += 1;
  if (previous?.activeSession && deltaSeconds > MAX_TRUSTED_GAP_SECONDS) {
    record.stats.unknownSeconds += deltaSeconds;
    addLog(
      record,
      log(
        config,
        now,
        "tracker_gap",
        "Intervalle de vérification non fiable",
        `${Math.floor(deltaSeconds / 60)} min non créditées automatiquement`,
        presence.placeId,
        previous.activeSession.id,
      ),
    );
  }

  if (!state.activeSession && presence.isAfkWorld) {
    const totals = totalsFrom(record);
    state.activeSession = {
      id: crypto.randomUUID(),
      startedAt: now,
      observedSeconds: 0,
    };
    sessionTransition = true;
    addLog(
      record,
      log(
        config,
        now,
        "session_started",
        "Session AFK démarrée",
        "Entrée détectée dans Ink Game · AFK World",
        presence.placeId,
        state.activeSession.id,
      ),
    );
    effects.push({
      type: "session_started",
      profileId: config.id,
      startedAt: now,
      totalAfkBefore: totals.totalAfkSeconds,
      totalRewardsBefore: totals.totalRewards,
    });
  } else if (state.activeSession && previous) {
    if (trustedDelta && previous.isAfkWorld) state.activeSession.observedSeconds += deltaSeconds;
    if (!presence.isAfkWorld) {
      const before = totalsFrom(record);
      const credit = rewardCredit(state.activeSession.observedSeconds, config.rewardIntervalMinutes);
      const session: CompletedSession = {
        id: state.activeSession.id,
        profileId: config.id,
        startedAt: state.activeSession.startedAt,
        endedAt: now,
        durationSeconds: state.activeSession.observedSeconds,
        rewardIntervalMinutes: config.rewardIntervalMinutes,
        rewardsEarned: credit.rewards,
        creditedAfkSeconds: credit.creditedAfkSeconds,
        totalAfkBefore: before.totalAfkSeconds,
        totalAfkAfter: before.totalAfkSeconds + credit.creditedAfkSeconds,
        totalRewardsBefore: before.totalRewards,
        totalRewardsAfter: before.totalRewards + credit.rewards,
        endReason: endReason(presence),
        endLabel: placeLabel(presence),
        createdAt: now,
        updatedAt: now,
        source: "automatic",
      };
      record.sessions.push(session);
      const rebuilt = rebuildDerived(record.base, record.sessions, record.adjustments, record.stats, now);
      record.sessions = rebuilt.sessions;
      record.stats = rebuilt.stats;
      const storedSession = record.sessions.find((item) => item.id === session.id) || session;
      state.activeSession = null;
      sessionTransition = true;
      addLog(
        record,
        log(
          config,
          now,
          "session_ended",
          "Session AFK terminée",
          `${storedSession.endLabel} · ${Math.floor(storedSession.durationSeconds / 60)} min réelles · ${storedSession.rewardsEarned} récompense(s)`,
          presence.placeId,
          storedSession.id,
        ),
      );
      effects.push({ type: "session_ended", profileId: config.id, session: storedSession });
    }
  }

  const presenceChanged =
    previous && (previous.presenceType !== presence.presenceType || previous.placeId !== presence.placeId);
  if (presenceChanged && !sessionTransition) {
    addLog(
      record,
      log(config, now, "presence_change", "Statut Roblox modifié", placeLabel(presence), presence.placeId),
    );
  }

  record.state = state;
  return { record, effects };
}
