import type { ProfileConfig, ProfileId } from "./types";

export const INK_GAME_PLACE_ID = 99567941238278;
export const AFK_WORLD_PLACE_ID = 135136333168784;
export const PARIS_TIME_ZONE = "Europe/Paris";

export const PROFILE_ORDER: ProfileId[] = ["ilan", "ruben", "naim"];

export const PROFILES: Record<ProfileId, ProfileConfig> = {
  ilan: {
    id: "ilan",
    displayName: "Ilan",
    username: "xx_nalyy",
    userId: 2282558809,
    rewardIntervalMinutes: 25,
    initialAfkMinutes: 4260,
    initialRewards: 170,
    webhookEnabled: true,
  },
  ruben: {
    id: "ruben",
    displayName: "Ruben",
    username: "RUBANSU1",
    userId: 3671739729,
    rewardIntervalMinutes: 30,
    initialAfkMinutes: 0,
    initialRewards: 0,
    webhookEnabled: false,
  },
  naim: {
    id: "naim",
    displayName: "Naïm",
    username: "Toussant935",
    userId: 6226787995,
    rewardIntervalMinutes: 25,
    initialAfkMinutes: 0,
    initialRewards: 0,
    webhookEnabled: false,
  },
};

export const TITLE_RATE = 0.0014;
export const ULTRA_RATE = 0.0004;
export const TITLE_AVERAGE_REWARDS = 714;
export const ULTRA_AVERAGE_REWARDS = 2500;
export const MAX_TRUSTED_GAP_SECONDS = 180;
export const LIVE_EXTRAPOLATION_SECONDS = 90;
export const STALE_AFTER_SECONDS = 120;
export const MAX_LOGS = 200;

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === "string" && PROFILE_ORDER.includes(value as ProfileId);
}
