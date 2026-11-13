import { getArray, setArray, readJson, getQueryId, ITEMS_KEY } from './_store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const items = await getArray(ITEMS_KEY);
      res.status(200).json({ items });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const items = await getArray(ITEMS_KEY);
      const item = {
        id: 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        folder: String(body.folder || ''),
        type: ['link', 'text', 'audio'].includes(body.type) ? body.type : 'text',
        title: String(body.title || '').slice(0, 200),
        content: String(body.content || '').slice(0, 5000),
        note: String(body.note || '').slice(0, 5000),
        images: Array.isArray(body.images) ? body.images.slice(0, 8).map((u) => String(u)) : [],
        createdAt: Date.now(),
      };
      items.unshift(item);
      await setArray(ITEMS_KEY, items);
      res.status(200).json({ item });
      return;
    }
    if (req.method === 'DELETE') {
      const id = getQueryId(req);
      let items = await getArray(ITEMS_KEY);
      items = items.filter((x) => x.id !== id);
      await setArray(ITEMS_KEY, items);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
