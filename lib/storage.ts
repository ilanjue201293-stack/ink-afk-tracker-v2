import { MAX_LOGS, PROFILE_ORDER, PROFILES } from "./config";
import { redisCommand } from "./redis";
import type { ProfileId, ProfileRecord, ProfileState, TrackerLog } from "./types";

export const TRACKER_LOCK_KEY = "ink:v2:check-lock";

type RecordPart = "state" | "base" | "stats" | "sessions" | "adjustments" | "logs";
const PARTS: RecordPart[] = ["state", "base", "stats", "sessions", "adjustments", "logs"];

function key(profileId: ProfileId, part: RecordPart) {
  return `ink:v2:profiles:${profileId}:${part}`;
}

export function createDefaultRecord(profileId: ProfileId): ProfileRecord {
  const config = PROFILES[profileId];
  return {
    state: null,
    base: {
      afkSeconds: config.initialAfkMinutes * 60,
      rewards: config.initialRewards,
      updatedAt: 0,
    },
    stats: {
      checks: 0,
      completedSessions: 0,
      creditedAfkSeconds: 0,
      creditedRewards: 0,
      manualAfkSeconds: 0,
      manualRewards: 0,
      unknownSeconds: 0,
      recalculatedAt: 0,
    },
    sessions: [],
    adjustments: [],
    logs: [],
  };
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadAllRecords(): Promise<Record<ProfileId, ProfileRecord>> {
  const keys = PROFILE_ORDER.flatMap((profileId) => PARTS.map((part) => key(profileId, part)));
  const values = await redisCommand<Array<string | null>>("MGET", ...keys);
  const records = {} as Record<ProfileId, ProfileRecord>;
  let offset = 0;
  for (const profileId of PROFILE_ORDER) {
    const defaults = createDefaultRecord(profileId);
    const storedState = parse<ProfileState | null>(values?.[offset] ?? null, defaults.state);
    const storedSessions = parse<ProfileRecord["sessions"]>(values?.[offset + 3] ?? null, defaults.sessions);
    records[profileId] = {
      state: storedState
        ? {
            ...storedState,
            activeSession: storedState.activeSession
              ? {
                  ...storedState.activeSession,
                  pendingDisconnectAt: storedState.activeSession.pendingDisconnectAt ?? null,
                }
              : null,
          }
        : null,
      base: parse(values?.[offset + 1] ?? null, defaults.base),
      stats: parse(values?.[offset + 2] ?? null, defaults.stats),
      sessions: storedSessions.map((session) => ({
        ...session,
        synchronized: session.synchronized !== false,
      })),
      adjustments: parse(values?.[offset + 4] ?? null, defaults.adjustments),
      logs: parse(values?.[offset + 5] ?? null, defaults.logs),
    };
    offset += PARTS.length;
  }
  return records;
}

export async function saveAllRecords(records: Record<ProfileId, ProfileRecord>) {
  const command: Array<string | number> = ["MSET"];
  for (const profileId of PROFILE_ORDER) {
    const record = records[profileId];
    for (const part of PARTS) command.push(key(profileId, part), JSON.stringify(record[part]));
  }
  await redisCommand(...command);
}

export function addLog(record: ProfileRecord, log: TrackerLog) {
  record.logs = [log, ...record.logs].sort((a, b) => b.at - a.at).slice(0, MAX_LOGS);
}
