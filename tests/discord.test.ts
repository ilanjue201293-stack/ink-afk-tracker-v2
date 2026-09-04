import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionEndPayload, buildSessionStartPayload, webhookEnabled } from "../lib/discord";
import type { CompletedSession } from "../lib/types";

test("le webhook est activé uniquement pour Ilan", () => {
  assert.equal(webhookEnabled("ilan"), true);
  assert.equal(webhookEnabled("ruben"), false);
  assert.equal(webhookEnabled("naim"), false);
});

test("le message de début contient les totaux avant", () => {
  const payload = buildSessionStartPayload(1000, 71 * 3600, 170);
  assert.equal(payload.embeds[0].title, "▶️ Début de session AFK");
  assert.equal(payload.embeds[0].fields[1].value, "71h 00m");
  assert.equal(payload.embeds[0].fields[2].value, "170");
});

test("le message de fin contient tous les avant/après demandés", () => {
  const session: CompletedSession = {
    id: "s",
    profileId: "ilan",
    startedAt: 1000,
    endedAt: 1000 + 26 * 60_000,
    durationSeconds: 26 * 60,
    rewardIntervalMinutes: 25,
    rewardsEarned: 1,
    creditedAfkSeconds: 25 * 60,
    totalAfkBefore: 71 * 3600,
    totalAfkAfter: 71 * 3600 + 25 * 60,
    totalRewardsBefore: 170,
    totalRewardsAfter: 171,
    endReason: "offline",
    endLabel: "Offline",
    createdAt: 1000,
    updatedAt: 1000,
    source: "automatic",
  };
  const payload = buildSessionEndPayload(session);
  assert.equal(payload.embeds[0].title, "⏹️ Fin de session AFK");
  const values = payload.embeds[0].fields.map((field) => field.value);
  assert.ok(values.includes("71h 00m"));
  assert.ok(values.includes("71h 25m"));
  assert.ok(values.includes("171"));
});
