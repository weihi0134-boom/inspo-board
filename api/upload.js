import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

const TYPES = {
  webm: 'audio/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  ogg: 'audio/ogg', aac: 'audio/aac',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
};

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
    let ext = String((req.query && req.query.ext) || 'webm').replace(/[^a-z0-9]/g, '').toLowerCase() || 'webm';
    if (ext === 'jpeg') ext = 'jpg';
    const isImage = ['png', 'jpg', 'gif', 'webp', 'heic'].includes(ext);
    const contentType = TYPES[ext] || (isImage ? 'image/jpeg' : 'audio/webm');
    const filename = (isImage ? 'image/' : 'audio/') + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    const blob = await put(filename, buf, { access: 'public', contentType, addRandomSuffix: false });
    res.status(200).json({ url: blob.url });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
