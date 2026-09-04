import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES } from "../lib/config";
import { processProfilePresence } from "../lib/engine";
import { createDefaultRecord } from "../lib/storage";
import type { PresenceSnapshot, ProfileRecord } from "../lib/types";

function presence(profile: "ilan" | "ruben" | "naim", kind: "afk" | "offline" | "ink" | "other", now: number): PresenceSnapshot {
  const config = PROFILES[profile];
  const inGame = kind === "afk" || kind === "ink" || kind === "other";
  return {
    userId: config.userId,
    username: config.username,
    presenceType: inGame ? 2 : 0,
    presence: inGame ? "In Game" : "Offline",
    placeId: kind === "afk" ? 135136333168784 : kind === "ink" ? 99567941238278 : kind === "other" ? 123 : null,
    universeId: null,
    gameId: null,
    lastLocation: kind === "other" ? "Autre jeu" : null,
    lastOnline: null,
    isAfkWorld: kind === "afk",
    isInkGame: kind === "ink",
    checkedAt: now,
  };
}

function runMinutes(profileId: "ilan" | "ruben", minutes: number, exit: "offline" | "other") {
  const config = PROFILES[profileId];
  let record: ProfileRecord = createDefaultRecord(profileId);
  const start = Date.UTC(2026, 8, 4, 12, 0, 0);
  record = processProfilePresence(config, record, presence(profileId, "afk", start), start).record;
  for (let minute = 1; minute < minutes; minute += 1) {
    const now = start + minute * 60_000;
    record = processProfilePresence(config, record, presence(profileId, "afk", now), now).record;
  }
  const end = start + minutes * 60_000;
  return processProfilePresence(config, record, presence(profileId, exit, end), end);
}

test("AFK → offline ferme la session sans la nommer crash", () => {
  const result = runMinutes("ilan", 26, "offline");
  assert.equal(result.record.state?.activeSession, null);
  assert.equal(result.record.sessions.length, 1);
  assert.equal(result.record.sessions[0].durationSeconds, 26 * 60);
  assert.equal(result.record.sessions[0].rewardsEarned, 1);
  assert.equal(result.record.sessions[0].creditedAfkSeconds, 25 * 60);
  assert.equal(result.record.sessions[0].endReason, "offline");
  assert.equal(result.effects.at(-1)?.type, "session_ended");
});

test("AFK → autre jeu ferme aussi la session", () => {
  const result = runMinutes("ilan", 50, "other");
  assert.equal(result.record.sessions[0].endReason, "other_game");
  assert.equal(result.record.sessions[0].rewardsEarned, 2);
  assert.equal(result.record.sessions[0].creditedAfkSeconds, 50 * 60);
});

test("offline → AFK crée une nouvelle session", () => {
  const config = PROFILES.naim;
  let record = createDefaultRecord("naim");
  const first = 1_000_000;
  record = processProfilePresence(config, record, presence("naim", "offline", first), first).record;
  const result = processProfilePresence(config, record, presence("naim", "afk", first + 60_000), first + 60_000);
  assert.ok(result.record.state?.activeSession);
  assert.equal(result.effects[0]?.type, "session_started");
});

test("Ruben crédite 60 minutes pour une session de 60 minutes", () => {
  const result = runMinutes("ruben", 60, "offline");
  assert.equal(result.record.sessions[0].rewardsEarned, 2);
  assert.equal(result.record.sessions[0].creditedAfkSeconds, 60 * 60);
});

test("traiter Ilan ne modifie pas le record Ruben", () => {
  const ruben = createDefaultRecord("ruben");
  const snapshot = JSON.stringify(ruben);
  processProfilePresence(PROFILES.ilan, createDefaultRecord("ilan"), presence("ilan", "afk", 1000), 1000);
  assert.equal(JSON.stringify(ruben), snapshot);
});
