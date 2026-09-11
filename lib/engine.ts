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
    state: record.state
      ? {
          ...record.state,
          activeSession: record.state.activeSession
            ? {
                ...record.state.activeSession,
                pendingDisconnectAt: record.state.activeSession.pendingDisconnectAt ?? null,
              }
            : null,
        }
      : null,
    base: { ...record.base },
    stats: { ...record.stats },
    sessions: record.sessions.map((session) => ({ ...session })),
    adjustments: record.adjustments.map((adjustment) => ({ ...adjustment })),
    logs: record.logs.map((item) => ({ ...item })),
    achievements: {
      title: record.achievements.title ? { ...record.achievements.title } : null,
      ultra_instinct: record.achievements.ultra_instinct ? { ...record.achievements.ultra_instinct } : null,
      rumor: record.achievements.rumor ? { ...record.achievements.rumor } : null,
    },
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
  let presenceChangeHandled = false;

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
      pendingDisconnectAt: null,
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
    const pendingDisconnectAt = state.activeSession.pendingDisconnectAt;

    if (pendingDisconnectAt && presence.isAfkWorld) {
      if (trustedDelta) state.activeSession.observedSeconds += deltaSeconds;
      state.activeSession.pendingDisconnectAt = null;
      presenceChangeHandled = true;
      addLog(
        record,
        log(
          config,
          now,
          "presence_change",
          "Déconnexion temporaire ignorée",
          "Retour dans l’AFK World au scan suivant · session continuée",
          presence.placeId,
          state.activeSession.id,
        ),
      );
    } else {
      if (trustedDelta && previous.isAfkWorld) state.activeSession.observedSeconds += deltaSeconds;

      if (presence.presence === "Offline" && !pendingDisconnectAt) {
        state.activeSession.pendingDisconnectAt = now;
        presenceChangeHandled = true;
        addLog(
          record,
          log(
            config,
            now,
            "presence_change",
            "Déconnexion à confirmer",
            "La session reste ouverte jusqu’au prochain scan",
            presence.placeId,
            state.activeSession.id,
          ),
        );
      } else if (!presence.isAfkWorld) {
        const confirmedDisconnect = Boolean(pendingDisconnectAt);
        const endedAt = pendingDisconnectAt || now;
        const before = totalsFrom(record);
        const credit = rewardCredit(state.activeSession.observedSeconds, config.rewardIntervalMinutes);
        const session: CompletedSession = {
          id: state.activeSession.id,
          profileId: config.id,
          startedAt: state.activeSession.startedAt,
          endedAt,
          durationSeconds: state.activeSession.observedSeconds,
          rewardIntervalMinutes: config.rewardIntervalMinutes,
          rewardsEarned: credit.rewards,
          creditedAfkSeconds: credit.creditedAfkSeconds,
          totalAfkBefore: before.totalAfkSeconds,
          totalAfkAfter: before.totalAfkSeconds + credit.creditedAfkSeconds,
          totalRewardsBefore: before.totalRewards,
          totalRewardsAfter: before.totalRewards + credit.rewards,
          endReason: confirmedDisconnect ? "offline" : endReason(presence),
          endLabel: confirmedDisconnect ? "Offline confirmé au scan suivant" : placeLabel(presence),
          createdAt: now,
          updatedAt: now,
          source: "automatic",
          synchronized: true,
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
  }

  const presenceChanged =
    previous && (previous.presenceType !== presence.presenceType || previous.placeId !== presence.placeId);
  if (presenceChanged && !sessionTransition && !presenceChangeHandled) {
    addLog(
      record,
      log(config, now, "presence_change", "Statut Roblox modifié", placeLabel(presence), presence.placeId),
    );
  }

  record.state = state;
  return { record, effects };
}
