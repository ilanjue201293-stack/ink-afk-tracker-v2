import assert from "node:assert/strict";
import { redisCommand } from "../lib/redis";

const key = `ink:v2:test:${crypto.randomUUID()}`;
const value = `redis-ok-${Date.now()}`;

await redisCommand("SET", key, value, "EX", 60);
const stored = await redisCommand<string | null>("GET", key);
assert.equal(stored, value);
await redisCommand("DEL", key);
const removed = await redisCommand<string | null>("GET", key);
assert.equal(removed, null);
console.log("Redis V2 : écriture, lecture et suppression du namespace de test réussies.");
