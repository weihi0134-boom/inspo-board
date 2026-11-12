import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    let buf;
    if (req.body && Buffer.isBuffer(req.body)) {
      buf = req.body;
    } else if (req.body && typeof req.body === 'string') {
      buf = Buffer.from(req.body, 'binary');
    } else {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      buf = Buffer.concat(chunks);
    }
    if (!buf || !buf.length) { res.status(400).json({ error: 'empty body' }); return; }
    const ext = (req.query && req.query.ext) || 'webm';
    const contentType = req.headers['content-type'] || 'audio/webm';
    const filename = 'audio/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    const blob = await put(filename, buf, { access: 'public', contentType, addRandomSuffix: false });
    res.status(200).json({ url: blob.url });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
