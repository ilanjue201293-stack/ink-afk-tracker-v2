import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("SMOKE_BASE_URL absent");

const home = await fetch(baseUrl);
assert.equal(home.status, 200, `Page principale HTTP ${home.status}`);

const status = await fetch(`${baseUrl}/api/status`, { cache: "no-store" });
assert.equal(status.status, 200, `API status HTTP ${status.status}`);
const statusJson = await status.json();
assert.deepEqual(Object.keys(statusJson.profiles).sort(), ["ilan", "naim", "ruben"]);

const unauthorizedCheck = await fetch(`${baseUrl}/api/check`, { cache: "no-store" });
assert.equal(unauthorizedCheck.status, 401);

const cronSecret = process.env.CRON_SECRET;
if (cronSecret) {
  const checked = await fetch(`${baseUrl}/api/check`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
    cache: "no-store",
  });
  assert.equal(checked.status, 200, `API check autorisée HTTP ${checked.status}`);
}

const admin = await fetch(`${baseUrl}/api/admin`, { cache: "no-store" });
assert.equal(admin.status, 200);
const adminJson = await admin.json();
assert.equal(adminJson.authenticated, false);

console.log("API V2 : page, status, protection check et protection admin validées.");
