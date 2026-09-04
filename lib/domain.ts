import {
  PARIS_TIME_ZONE,
  TITLE_AVERAGE_REWARDS,
  TITLE_RATE,
  ULTRA_AVERAGE_REWARDS,
  ULTRA_RATE,
} from "./config";
import type {
  CompletedSession,
  ManualAdjustment,
  ProfileBase,
  ProfileRecord,
  ProfileStats,
  ProfileTotals,
} from "./types";

export function rewardCredit(durationSeconds: number, intervalMinutes: number) {
  const intervalSeconds = intervalMinutes * 60;
  const rewards = Math.floor(Math.max(0, durationSeconds) / intervalSeconds);
  return { rewards, creditedAfkSeconds: rewards * intervalSeconds };
}

export function cumulativeChance(rate: number, rewards: number) {
  return 1 - Math.pow(1 - rate, Math.max(0, Math.floor(rewards)));
}

export function parisDateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function totalsFrom(record: Pick<ProfileRecord, "base" | "sessions" | "adjustments">): ProfileTotals {
  const timeline = [
    ...record.sessions.map((session) => ({
      kind: "session" as const,
      at: session.endedAt,
      afk: session.creditedAfkSeconds,
      rewards: session.rewardsEarned,
    })),
    ...record.adjustments.map((adjustment) => ({
      kind: "adjustment" as const,
      at: adjustment.at,
      afk: adjustment.afkSecondsDelta,
      rewards: adjustment.rewardsDelta,
    })),
  ].sort((a, b) => a.at - b.at || (a.kind === "adjustment" ? -1 : 1));
  let totalAfkSeconds = record.base.afkSeconds;
  let totalRewards = record.base.rewards;
  for (const entry of timeline) {
    totalAfkSeconds = Math.max(0, totalAfkSeconds + entry.afk);
    totalRewards = Math.max(0, totalRewards + entry.rewards);
  }
  return {
    totalAfkSeconds,
    totalRewards,
  };
}

type TimelineEntry =
  | { kind: "session"; at: number; session: CompletedSession }
  | { kind: "adjustment"; at: number; adjustment: ManualAdjustment };

export function rebuildDerived(
  base: ProfileBase,
  sessions: CompletedSession[],
  adjustments: ManualAdjustment[],
  previousStats: ProfileStats,
  now = Date.now(),
) {
  const sessionCopies = sessions.map((session) => ({ ...session }));
  const timeline: TimelineEntry[] = [
    ...sessionCopies.map((session) => ({ kind: "session" as const, at: session.endedAt, session })),
    ...adjustments.map((adjustment) => ({ kind: "adjustment" as const, at: adjustment.at, adjustment })),
  ].sort((a, b) => a.at - b.at || (a.kind === "adjustment" ? -1 : 1));

  let runningAfk = base.afkSeconds;
  let runningRewards = base.rewards;
  for (const entry of timeline) {
    if (entry.kind === "adjustment") {
      runningAfk = Math.max(0, runningAfk + entry.adjustment.afkSecondsDelta);
      runningRewards = Math.max(0, runningRewards + entry.adjustment.rewardsDelta);
      continue;
    }
    const session = entry.session;
    session.totalAfkBefore = runningAfk;
    session.totalRewardsBefore = runningRewards;
    runningAfk = Math.max(0, runningAfk + session.creditedAfkSeconds);
    runningRewards = Math.max(0, runningRewards + session.rewardsEarned);
    session.totalAfkAfter = runningAfk;
    session.totalRewardsAfter = runningRewards;
  }

  const sortedSessions = sessionCopies.sort((a, b) => b.startedAt - a.startedAt);
  const stats: ProfileStats = {
    ...previousStats,
    completedSessions: sortedSessions.length,
    creditedAfkSeconds: sortedSessions.reduce((sum, session) => sum + session.creditedAfkSeconds, 0),
    creditedRewards: sortedSessions.reduce((sum, session) => sum + session.rewardsEarned, 0),
    manualAfkSeconds: adjustments.reduce((sum, adjustment) => sum + adjustment.afkSecondsDelta, 0),
    manualRewards: adjustments.reduce((sum, adjustment) => sum + adjustment.rewardsDelta, 0),
    recalculatedAt: now,
  };
  return { sessions: sortedSessions, stats };
}

export function probabilitySummary(totalRewards: number, rewardIntervalMinutes: number) {
  const titleRemainingRewards = Math.max(0, TITLE_AVERAGE_REWARDS - totalRewards);
  const ultraRemainingRewards = Math.max(0, ULTRA_AVERAGE_REWARDS - totalRewards);
  return {
    titleChance: cumulativeChance(TITLE_RATE, totalRewards),
    ultraChance: cumulativeChance(ULTRA_RATE, totalRewards),
    titleRemainingRewards,
    ultraRemainingRewards,
    titleRemainingSeconds: titleRemainingRewards * rewardIntervalMinutes * 60,
    ultraRemainingSeconds: ultraRemainingRewards * rewardIntervalMinutes * 60,
  };
}
