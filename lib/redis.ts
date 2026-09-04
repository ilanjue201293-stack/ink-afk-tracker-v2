function credentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Variables Upstash V2 manquantes");
  return { url, token };
}

export async function redisCommand<T = unknown>(...command: Array<string | number>): Promise<T> {
  const { url, token } = credentials();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `Redis HTTP ${response.status}`);
  return data.result as T;
}

export async function acquireLock(key: string, ttlSeconds = 50) {
  const value = crypto.randomUUID();
  const result = await redisCommand<string | null>("SET", key, value, "NX", "EX", ttlSeconds);
  return result === "OK" ? value : null;
}

export async function releaseLock(key: string, value: string) {
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  await redisCommand("EVAL", script, 1, key, value).catch(() => null);
}
