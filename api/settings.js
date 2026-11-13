import { redis, readJson } from './_store.js';

const KEY = 'inspo:settings';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const v = await redis.get(KEY);
      let s = v;
      if (typeof s === 'string') {
        try { s = JSON.parse(s); } catch { s = null; }
      }
      res.status(200).json({ settings: s || { calendarSrc: '' } });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const settings = { calendarSrc: String(body.calendarSrc || '').trim().slice(0, 500) };
      await redis.set(KEY, settings);
      res.status(200).json({ settings });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
