// 讀取 Google 行事曆的 .ics，轉成前端看得懂的行程陣列
function unescapeIcs(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

// 把 ICS 的日期字串轉成 { start:'YYYY-MM-DD', time:'HH:MM'|'整天', end:'YYYY-MM-DD' }
function toDateInfo(v, p) {
  if (!v) return null;
  const val = v.trim();
  const dateOnly = /VALUE=DATE(?!-TIME)/i.test(p || '');
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const iso = `${y}-${mo}-${d}`;
  if (dateOnly || !hh) return { start: iso, end: iso, time: '整天', allDay: true };
  let time = `${hh}:${mm}`;
  let dateIso = iso;
  if (m[7]) {
    // UTC → 台北時間
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)) + 8 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    dateIso = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    time = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  }
  return { start: dateIso, end: dateIso, time, allDay: false };
}

export default async function handler(req, res) {
  try {
    const raw = (req.query && req.query.src) || (() => { try { return new URL(req.url, 'http://x').searchParams.get('src'); } catch { return ''; } })();
    let src = String(raw || '').trim();
    if (!src) { res.status(400).json({ error: '沒有給行事曆網址' }); return; }

    // 使用者可能貼整段嵌入程式碼
    const inner = src.match(/src=["']([^"']+)["']/i);
    if (inner) src = inner[1].trim();
    src = src.replace(/&amp;/g, '&');
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http://')) src = src.replace('http://', 'https://');
    // 貼的是 cid= 形式的嵌入網址時，轉成 ical
    const cid = src.match(/[?&]cid=([^&]+)/);
    if (cid && !/\.ics/i.test(src)) {
      src = 'https://calendar.google.com/calendar/ical/' + cid[1] + '/public/basic.ics';
    }
    if (!/^https:\/\//i.test(src)) { res.status(400).json({ error: '網址格式不對，請貼 https:// 開頭的行事曆網址' }); return; }

    const r = await fetch(src, { headers: { 'User-Agent': 'inspo-board/1.0' } });
    if (!r.ok) {
      res.status(502).json({ error: 'Google 回覆 ' + r.status + '，通常是這個行事曆沒有設成「公開」' });
      return;
    }
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      res.status(502).json({ error: '抓到的不是行事曆資料，請確認網址是 basic.ics 那一條' });
      return;
    }

    // 展開折行
    const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);
    const events = [];
    let cur = null;
    for (const line of lines) {
      if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
      if (/^END:VEVENT/i.test(line)) {
        if (cur && cur.SUMMARY) {
          const s = toDateInfo(cur.DTSTART, cur.DTSTART_PARAM);
          const e = toDateInfo(cur.DTEND, cur.DTEND_PARAM);
          if (s) events.push({ title: unescapeIcs(cur.SUMMARY).slice(0, 120), start: s.start, end: (e && e.end) || s.end, time: s.time, allDay: !!s.allDay });
        }
        cur = null;
        continue;
      }
      if (!cur) continue;
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const left = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const name = left.split(';')[0].toUpperCase();
      if (name === 'DTSTART') { cur.DTSTART = value; cur.DTSTART_PARAM = left; }
      else if (name === 'DTEND') { cur.DTEND = value; cur.DTEND_PARAM = left; }
      else if (name === 'SUMMARY') { cur.SUMMARY = value; }
    }

    events.sort((a, b) => (a.start + a.time).localeCompare(b.start + b.time));
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).json({ events: events.slice(0, 500) });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
