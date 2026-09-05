import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultRecord } from "../lib/storage";
import { applyAdminActionToRecord } from "../lib/tracker";
import { totalsFrom } from "../lib/domain";

function sessionInput(startedAt: number, endedAt: number) {
  return {
    action: "create_session",
    startedAt,
    endedAt,
    rewardIntervalMinutes: 25,
    endReason: "manual",
    endLabel: "Test admin",
    reason: "Test",
    synchronized: true,
  };
}

test("créer une session synchronisée recalcule crédits et totaux", () => {
  const record = createDefaultRecord("ilan");
  const start = 1_000_000;
  applyAdminActionToRecord(record, "ilan", sessionInput(start, start + 60 * 60_000), start + 60 * 60_000);
  assert.equal(record.sessions.length, 1);
  assert.equal(record.sessions[0].durationSeconds, 60 * 60);
  assert.equal(record.sessions[0].rewardsEarned, 2);
  assert.equal(record.sessions[0].creditedAfkSeconds, 50 * 60);
  assert.deepEqual(totalsFrom(record), { totalAfkSeconds: 71 * 3600 + 50 * 60, totalRewards: 172 });
});

test("supprimer une session la retire des totaux", () => {
  const record = createDefaultRecord("ilan");
  const start = 1_000_000;
  applyAdminActionToRecord(record, "ilan", sessionInput(start, start + 25 * 60_000), start + 25 * 60_000);
  const sessionId = record.sessions[0].id;
  applyAdminActionToRecord(record, "ilan", { action: "delete_session", sessionId }, start + 30 * 60_000);
  assert.equal(record.sessions.length, 0);
  assert.deepEqual(totalsFrom(record), { totalAfkSeconds: 71 * 3600, totalRewards: 170 });
});

test("fusionner deux sessions inclut la fausse coupure", () => {
  const record = createDefaultRecord("ilan");
  const start = 1_000_000;
  applyAdminActionToRecord(record, "ilan", sessionInput(start, start + 24 * 60_000), start + 24 * 60_000);
  applyAdminActionToRecord(record, "ilan", sessionInput(start + 26 * 60_000, start + 50 * 60_000), start + 50 * 60_000);
  const sessionIds = record.sessions.map((session) => session.id);
  applyAdminActionToRecord(record, "ilan", { action: "merge_sessions", sessionIds }, start + 60 * 60_000);
  assert.equal(record.sessions.length, 1);
  assert.equal(record.sessions[0].durationSeconds, 50 * 60);
  assert.equal(record.sessions[0].rewardsEarned, 2);
  assert.equal(record.sessions[0].creditedAfkSeconds, 50 * 60);
  assert.match(record.sessions[0].endLabel, /Fusion de 2 sessions/);
});

test("le mode désynchronisé accepte les valeurs manuelles indépendantes", () => {
  const record = createDefaultRecord("ilan");
  const start = 1_000_000;
  applyAdminActionToRecord(record, "ilan", sessionInput(start, start + 25 * 60_000), start + 25 * 60_000);
  const sessionId = record.sessions[0].id;
  applyAdminActionToRecord(record, "ilan", {
    action: "update_session",
    sessionId,
    startedAt: start,
    endedAt: start + 25 * 60_000,
    durationSeconds: 999,
    rewardIntervalMinutes: 25,
    rewardsEarned: 9,
    creditedAfkSeconds: 1234,
    totalAfkBefore: 111,
    totalAfkAfter: 222,
    totalRewardsBefore: 3,
    totalRewardsAfter: 12,
    endReason: "manual",
    endLabel: "Exception",
    synchronized: false,
  }, start + 30 * 60_000);
  assert.equal(record.sessions[0].synchronized, false);
  assert.equal(record.sessions[0].durationSeconds, 999);
  assert.equal(record.sessions[0].rewardsEarned, 9);
  assert.equal(record.sessions[0].creditedAfkSeconds, 1234);
  assert.equal(record.sessions[0].totalAfkBefore, 111);
  assert.equal(record.sessions[0].totalAfkAfter, 222);
});
