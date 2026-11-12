import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const ITEMS_KEY = 'inspo:items';
export const TASKS_KEY = 'inspo:tasks';

export async function getArray(key) {
  const v = await redis.get(key);
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
}

export async function setArray(key, arr) {
  await redis.set(key, arr);
}

export async function readJson(req) {
  if (req.body) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(req.body.toString()); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

export function getQueryId(req) {
  if (req.query && req.query.id) return req.query.id;
  try { return new URL(req.url, 'http://x').searchParams.get('id'); } catch { return null; }
}
