import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES } from "../lib/config";
import { cumulativeChance, parisDateKey, rebuildDerived, rewardCredit, totalsFrom } from "../lib/domain";
import { createDefaultRecord } from "../lib/storage";
import type { CompletedSession } from "../lib/types";

const ilanCases = [
  [24, 0, 0],
  [25, 1, 25],
  [26, 1, 25],
  [49, 1, 25],
  [50, 2, 50],
  [60, 2, 50],
];

for (const [minutes, rewards, creditedMinutes] of ilanCases) {
  test(`Ilan : ${minutes} min => ${rewards} récompense(s), ${creditedMinutes} min`, () => {
    assert.deepEqual(rewardCredit(minutes * 60, 25), {
      rewards,
      creditedAfkSeconds: creditedMinutes * 60,
    });
  });
}

const rubenCases = [
  [29, 0, 0],
  [30, 1, 30],
  [59, 1, 30],
  [60, 2, 60],
];

for (const [minutes, rewards, creditedMinutes] of rubenCases) {
  test(`Ruben : ${minutes} min => ${rewards} récompense(s), ${creditedMinutes} min`, () => {
    assert.deepEqual(rewardCredit(minutes * 60, 30), {
      rewards,
      creditedAfkSeconds: creditedMinutes * 60,
    });
  });
}

test("deux sessions Ilan 26 + 19 ne partagent aucun reliquat", () => {
  const first = rewardCredit(26 * 60, 25);
  const second = rewardCredit(19 * 60, 25);
  assert.equal(first.rewards + second.rewards, 1);
  assert.equal(first.creditedAfkSeconds + second.creditedAfkSeconds, 25 * 60);
});

test("Ilan démarre exactement à 71 h et 170 récompenses", () => {
  const record = createDefaultRecord("ilan");
  assert.equal(record.base.afkSeconds, 71 * 3600);
  assert.equal(record.base.rewards, 170);
  assert.deepEqual(totalsFrom(record), { totalAfkSeconds: 71 * 3600, totalRewards: 170 });
});

test("probabilité cumulée conserve exactement la formule V1", () => {
  assert.equal(cumulativeChance(0.0014, 170), 1 - Math.pow(1 - 0.0014, 170));
  assert.equal(cumulativeChance(0.0004, 170), 1 - Math.pow(1 - 0.0004, 170));
});

test("Europe/Paris est utilisé pour le changement de jour", () => {
  assert.equal(parisDateKey(Date.UTC(2026, 2, 28, 23, 30)), "2026-03-29");
});

test("une édition de session recalcule les totaux avant et après", () => {
  const record = createDefaultRecord("ruben");
  const session: CompletedSession = {
    id: "s1",
    profileId: "ruben",
    startedAt: 1000,
    endedAt: 1000 + 60 * 60 * 1000,
    durationSeconds: 3600,
    rewardIntervalMinutes: 30,
    rewardsEarned: 2,
    creditedAfkSeconds: 3600,
    totalAfkBefore: 99,
    totalAfkAfter: 99,
    totalRewardsBefore: 99,
    totalRewardsAfter: 99,
    endReason: "offline",
    endLabel: "Offline",
    createdAt: 1000,
    updatedAt: 1000,
    source: "admin",
    synchronized: true,
  };
  const rebuilt = rebuildDerived(record.base, [session], [], record.stats, 2000);
  assert.equal(rebuilt.sessions[0].totalAfkBefore, 0);
  assert.equal(rebuilt.sessions[0].totalAfkAfter, 3600);
  assert.equal(rebuilt.sessions[0].totalRewardsBefore, 0);
  assert.equal(rebuilt.sessions[0].totalRewardsAfter, 2);
  assert.equal(rebuilt.stats.creditedRewards, 2);
});

test("une session désynchronisée conserve ses totaux manuels", () => {
  const record = createDefaultRecord("ilan");
  const session: CompletedSession = {
    id: "manual",
    profileId: "ilan",
    startedAt: 1000,
    endedAt: 2000,
    durationSeconds: 999,
    rewardIntervalMinutes: 25,
    rewardsEarned: 7,
    creditedAfkSeconds: 1234,
    totalAfkBefore: 111,
    totalAfkAfter: 222,
    totalRewardsBefore: 3,
    totalRewardsAfter: 9,
    endReason: "manual",
    endLabel: "Exception manuelle",
    createdAt: 1000,
    updatedAt: 1000,
    source: "admin",
    synchronized: false,
  };
  const rebuilt = rebuildDerived(record.base, [session], [], record.stats, 2000);
  assert.equal(rebuilt.sessions[0].totalAfkBefore, 111);
  assert.equal(rebuilt.sessions[0].totalAfkAfter, 222);
  assert.equal(rebuilt.sessions[0].totalRewardsBefore, 3);
  assert.equal(rebuilt.sessions[0].totalRewardsAfter, 9);
  assert.equal(rebuilt.stats.creditedAfkSeconds, 1234);
  assert.equal(rebuilt.stats.creditedRewards, 7);
});

test("la configuration des profils reste indépendante", () => {
  assert.equal(PROFILES.ilan.rewardIntervalMinutes, 25);
  assert.equal(PROFILES.ruben.rewardIntervalMinutes, 30);
  assert.equal(PROFILES.naim.rewardIntervalMinutes, 25);
  assert.equal(PROFILES.ilan.webhookEnabled, true);
  assert.equal(PROFILES.ruben.webhookEnabled, false);
  assert.equal(PROFILES.naim.webhookEnabled, false);
});
