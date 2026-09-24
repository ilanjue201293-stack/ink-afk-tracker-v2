export type ProfileId = "ilan" | "ruben" | "naim";

export type ProfileConfig = {
  id: ProfileId;
  displayName: string;
  username: string;
  userId: number;
  rewardIntervalMinutes: number;
  initialAfkMinutes: number;
  initialRewards: number;
  webhookEnabled: boolean;
};

export type PresenceName = "Offline" | "Online" | "In Game" | "In Studio" | "Invisible";

export type PresenceSnapshot = {
  userId: number;
  username: string;
  presenceType: number;
  presence: PresenceName;
  placeId: number | null;
  universeId: number | null;
  gameId: string | null;
  lastLocation: string | null;
  lastOnline: string | null;
  isAfkWorld: boolean;
  isInkGame: boolean;
  checkedAt: number;
};

export type ActiveSession = {
  id: string;
  startedAt: number;
  observedSeconds: number;
  pendingDisconnectAt: number | null;
};

export type ProfileState = PresenceSnapshot & {
  lastCheckedAt: number;
  currentSince: number;
  activeSession: ActiveSession | null;
};

export type SessionEndReason =
  | "offline"
  | "ink_game"
  | "other_game"
  | "online"
  | "studio"
  | "invisible"
  | "unknown"
  | "manual";

export type CompletedSession = {
  id: string;
  profileId: ProfileId;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  rewardIntervalMinutes: number;
  rewardsEarned: number;
  creditedAfkSeconds: number;
  totalAfkBefore: number;
  totalAfkAfter: number;
  totalRewardsBefore: number;
  totalRewardsAfter: number;
  endReason: SessionEndReason;
  endLabel: string;
  createdAt: number;
  updatedAt: number;
  source: "automatic" | "admin";
  synchronized: boolean;
};

export type SessionView = CompletedSession & {
  active?: boolean;
  liveObservedSeconds?: number;
};

export type ManualAdjustment = {
  id: string;
  at: number;
  afkSecondsDelta: number;
  rewardsDelta: number;
  reason: string;
};

export type ProfileBase = {
  afkSeconds: number;
  rewards: number;
  updatedAt: number;
};

export type ProfileStats = {
  checks: number;
  completedSessions: number;
  creditedAfkSeconds: number;
  creditedRewards: number;
  manualAfkSeconds: number;
  manualRewards: number;
  unknownSeconds: number;
  recalculatedAt: number;
};

export type LogKind =
  | "session_started"
  | "session_ended"
  | "presence_change"
  | "tracker_gap"
  | "admin_change";

export type TrackerLog = {
  id: string;
  profileId: ProfileId;
  at: number;
  kind: LogKind;
  title: string;
  detail: string;
  placeId: number | null;
  sessionId?: string;
};

export type AchievementId = "title" | "ultra_instinct" | "rumor";

export type AchievementRecord = {
  id: AchievementId;
  obtainedAt: number;
  sessionId?: string | null;
  totalRewardsAt: number;
  totalAfkSecondsAt: number;
};

export type ProfileAchievements = Record<AchievementId, AchievementRecord | null>;

export type ProfileRecord = {
  state: ProfileState | null;
  base: ProfileBase;
  stats: ProfileStats;
  sessions: CompletedSession[];
  adjustments: ManualAdjustment[];
  logs: TrackerLog[];
  achievements: ProfileAchievements;
};

export type ProfileTotals = {
  totalAfkSeconds: number;
  totalRewards: number;
};

export type ProfileStatus = {
  config: ProfileConfig;
  state: ProfileState | null;
  stats: ProfileStats;
  logs: TrackerLog[];
  achievements: ProfileAchievements;
  totals: ProfileTotals & {
    baseAfkSeconds: number;
    baseRewards: number;
    titleChance: number;
    ultraChance: number;
    titleRemainingRewards: number;
    ultraRemainingRewards: number;
    titleRemainingSeconds: number;
    ultraRemainingSeconds: number;
  };
  live: {
    stale: boolean;
    lastCheckAgeSeconds: number | null;
    currentSessionSeconds: number;
    sessionStartedAt: number | null;
    disconnectPending: boolean;
  };
  sessionsToday: number;
};

export type EngineEffect =
  | { type: "session_started"; profileId: ProfileId; startedAt: number; totalAfkBefore: number; totalRewardsBefore: number }
  | { type: "session_ended"; profileId: ProfileId; session: CompletedSession };
