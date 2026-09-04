import { AFK_WORLD_PLACE_ID, INK_GAME_PLACE_ID, PROFILE_ORDER, PROFILES } from "./config";
import type { PresenceName, PresenceSnapshot, ProfileId } from "./types";

const PRESENCE_NAMES: Record<number, PresenceName> = {
  0: "Offline",
  1: "Online",
  2: "In Game",
  3: "In Studio",
  4: "Invisible",
};

type RobloxPresence = {
  userId?: number;
  userPresenceType?: number;
  placeId?: number | null;
  universeId?: number | null;
  gameId?: string | null;
  lastLocation?: string | null;
  lastOnline?: string | null;
};

export async function getPresences(now = Date.now()): Promise<Record<ProfileId, PresenceSnapshot>> {
  const response = await fetch("https://presence.roblox.com/v1/presence/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userIds: PROFILE_ORDER.map((id) => PROFILES[id].userId) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Roblox Presence: ${response.status}`);
  const json = (await response.json()) as { userPresences?: RobloxPresence[] };
  const byUserId = new Map((json.userPresences || []).map((presence) => [Number(presence.userId), presence]));

  const entries = PROFILE_ORDER.map((profileId) => {
    const config = PROFILES[profileId];
    const p = byUserId.get(config.userId);
    if (!p) throw new Error(`Réponse Roblox absente pour ${config.displayName}`);
    const presenceType = Number(p.userPresenceType ?? 0);
    const placeId = p.placeId == null ? null : Number(p.placeId);
    const snapshot: PresenceSnapshot = {
      userId: config.userId,
      username: config.username,
      presenceType,
      presence: PRESENCE_NAMES[presenceType] || "Offline",
      placeId,
      universeId: p.universeId == null ? null : Number(p.universeId),
      gameId: p.gameId ? String(p.gameId) : null,
      lastLocation: p.lastLocation ? String(p.lastLocation) : null,
      lastOnline: p.lastOnline ? String(p.lastOnline) : null,
      isAfkWorld: presenceType === 2 && placeId === AFK_WORLD_PLACE_ID,
      isInkGame: presenceType === 2 && placeId === INK_GAME_PLACE_ID,
      checkedAt: now,
    };
    return [profileId, snapshot] as const;
  });
  return Object.fromEntries(entries) as Record<ProfileId, PresenceSnapshot>;
}

export function placeLabel(snapshot: Pick<PresenceSnapshot, "presence" | "isAfkWorld" | "isInkGame" | "lastLocation">) {
  if (snapshot.isAfkWorld) return "Ink Game · AFK World";
  if (snapshot.isInkGame) return "Ink Game";
  if (snapshot.presence === "Offline") return "Offline";
  if (snapshot.presence === "Online") return "En ligne";
  if (snapshot.presence === "In Studio") return "Roblox Studio";
  if (snapshot.presence === "In Game") return snapshot.lastLocation || "Dans un autre jeu";
  return snapshot.presence;
}

export function endReason(snapshot: PresenceSnapshot) {
  if (snapshot.presence === "Offline") return "offline" as const;
  if (snapshot.isInkGame) return "ink_game" as const;
  if (snapshot.presence === "In Game") return "other_game" as const;
  if (snapshot.presence === "Online") return "online" as const;
  if (snapshot.presence === "In Studio") return "studio" as const;
  if (snapshot.presence === "Invisible") return "invisible" as const;
  return "unknown" as const;
}
