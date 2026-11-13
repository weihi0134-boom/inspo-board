import { getArray, setArray, readJson, ITEMS_KEY } from './_store.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{margin:0;background:#e0f0f5;color:#1a1614;font-family:-apple-system,"PingFang TC","Microsoft JhengHei",system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.box{background:#fff;border-radius:18px;padding:22px;max-width:420px;width:100%;box-shadow:0 6px 24px rgba(26,22,20,.08)}
h2{margin:0 0 6px;font-size:18px}
p{color:#6f767c;font-size:13px;margin:6px 0 16px}
input,textarea,select{width:100%;padding:11px;border-radius:10px;border:1px solid #cdd9df;font-size:15px;font-family:inherit;margin-bottom:10px;background:#f4f9fb;color:#1a1614}
textarea{min-height:80px}
button{width:100%;padding:13px;border:none;border-radius:12px;background:#d5b185;color:#3a2c1e;font-size:16px;font-weight:700;cursor:pointer}
.ok{color:#7d9a6d;font-weight:700}
img{max-width:100%;border-radius:10px;margin-top:8px}
</style></head><body><div class="box">${bodyHtml}</div></body></html>`;
}

const FOLDERS = ['影片靈感', '文案點子', '語音備忘', '想拍的影片', '新歌靈感'];

export default async function handler(req, res) {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const opts = FOLDERS.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('');

    if (req.method === 'GET') {
      res.status(200).send(page('存到靈感收集箱', `
        <h2>💡 存到靈感收集箱</h2>
        <p>在手機分享選單點這裡，內容會自動帶進來，選個資料夾就存好。</p>
        <form method="POST" action="/api/share">
          <input name="title" placeholder="標題（可空）" />
          <textarea name="content" placeholder="貼文字或連結"></textarea>
          <select name="folder">${opts}</select>
          <button type="submit">儲存靈感</button>
        </form>`));
      return;
    }

    if (req.method === 'POST') {
      let body = {};
      try { body = await readJson(req); } catch (e) { body = {}; }
      let title = String(body.title || '').slice(0, 200);
      const content = String(body.content || body.text || body.url || '').slice(0, 4000);
      const folder = FOLDERS.includes(body.folder) ? body.folder : FOLDERS[0];
      if (!content && !title) { res.status(400).send(page('沒有內容', '<h2>沒有收到內容</h2><p>請回上一頁補上文字或連結。</p>')); return; }
      const isLink = /^https?:\/\//i.test(content);
      const items = await getArray(ITEMS_KEY);
      const item = {
        id: 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        folder, type: isLink ? 'link' : 'text',
        title, content, note: '', images: [],
        createdAt: Date.now(),
      };
      items.unshift(item);
      await setArray(ITEMS_KEY, items);
      res.status(200).send(page('已存好', `<h2 class="ok">✓ 已存到「${esc(folder)}」</h2>
        <p>${esc(title || content.slice(0, 60))}</p>
        <button onclick="location.href='/api/share'">再存一則</button>`));
      return;
    }

    res.status(405).send(page('錯誤', '<h2>不支援的方法</h2>'));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
