// 讀取 Google 行事曆（.ics），轉成前端看得懂的行程陣列
function unescapeIcs(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function pad(n) { return String(n).padStart(2, '0'); }

// 把 ICS 日期字串轉成 { start:'YYYY-MM-DD', end:'YYYY-MM-DD', time:'HH:MM'|'整天' }
function toDateInfo(v, p) {
  if (!v) return null;
  const val = String(v).trim();
  const dateOnly = /VALUE=DATE(?!-TIME)/i.test(p || '');
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const iso = `${y}-${mo}-${d}`;
  if (dateOnly || !hh) return { start: iso, end: iso, time: '整天', allDay: true };
  if (m[7]) {
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)) + 8 * 3600 * 1000);
    return { start: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, end: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`, allDay: false };
  }
  return { start: iso, end: iso, time: `${hh}:${mm}`, allDay: false };
}

const pad2 = (n) => String(n).padStart(2, '0');
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 把「重複行程」展開成每一次（Google 的 .ics 裡重複只給一條規則）
function expand(rrule, startIso, allDay, limitMonths = 14) {
  const out = [];
  const m = {};
  String(rrule || '').split(';').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) m[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
  const freq = (m.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(m.INTERVAL || '1', 10) || 1);
  const count = m.COUNT ? parseInt(m.COUNT, 10) : 0;
  const until = m.UNTIL ? String(m.UNTIL).slice(0, 8) : '';
  const untilIso = until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : '';
  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth() + limitMonths, 1);
  const horizonIso = fmt(horizon);

  const dates = [];
  const base = new Date(startIso + 'T00:00:00');
  if (freq === 'WEEKLY') {
    const byday = (m.BYDAY || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    const map = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const wkStart = new Date(base);
    wkStart.setDate(base.getDate() - base.getDay());
    let week = 0;
    while (week < 400) {
      const wkBase = new Date(wkStart);
      wkBase.setDate(wkStart.getDate() + week * 7 * interval);
      if (wkBase > horizon) break;
      const offsets = byday.length ? byday.map((d) => map[d.slice(-2)]).filter((n) => n !== undefined) : [base.getDay()];
      offsets.sort((a, b) => a - b);
      for (const off of offsets) {
        const d = new Date(wkBase);
        d.setDate(wkBase.getDate() + off);
        if (d < base) continue;
        const iso = fmt(d);
        if (untilIso && iso > untilIso) return finish(dates, count);
        if (iso > horizonIso) return finish(dates, count);
        dates.push(iso);
        if (count && dates.length >= count) return finish(dates, count);
      }
      week += 1;
    }
  } else {
    const stepDays = freq === 'DAILY' ? interval : (freq === 'MONTHLY' ? 0 : 7 * interval);
    let cur = new Date(base);
    let i = 0;
    while (i < 400) {
      if (cur > horizon) break;
      const iso = fmt(cur);
      if (untilIso && iso > untilIso) break;
      dates.push(iso);
      if (count && dates.length >= count) break;
      if (freq === 'MONTHLY') cur = new Date(cur.getFullYear(), cur.getMonth() + interval, cur.getDate());
      else if (stepDays) { cur = new Date(cur); cur.setDate(cur.getDate() + stepDays); }
      else break;
      i += 1;
    }
  }
  return finish(dates, count);
}

function finish(dates, count) {
  return count ? dates.slice(0, count) : dates;
}

function parseIcs(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r/g, '');
  const lines = unfolded.split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur && cur.SUMMARY) {
        const s = toDateInfo(cur.DTSTART, cur.DTSTART_PARAM);
        const e = toDateInfo(cur.DTEND, cur.DTEND_PARAM);
        // 全天活動的 DTEND 是「不含當天」，要減一天才不會多佔一格
        let end = (e && e.end) || s.end;
        if (s.allDay && e && e.end) {
          const d = new Date(e.end + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          const base = new Date(s.start + 'T00:00:00');
          end = d >= base ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : s.start;
        }
        events.push({ title: unescapeIcs(cur.SUMMARY).slice(0, 120), start: s.start, end, time: s.time, allDay: !!s.allDay });
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
    else if (name === 'RRULE') { cur.RRULE = value; }
  }
  return events;
}

// 允許的 Google 網域
const HOSTS = ['calendar.google.com', 'www.google.com', 'google.com'];

function candidates(input) {
  let s = String(input || '').trim();
  const inner = s.match(/src=["']([^"']+)["']/i);
  if (inner) s = inner[1].trim();
  s = s.replace(/&amp;/g, '&').trim();
  if (s.startsWith('//')) s = 'https:' + s;
  s = s.replace(/^http:\/\//i, 'https://');

  const out = [];
  const cid = s.match(/[?&]cid=([^&]+)/);
  if (cid) {
    const c = decodeURIComponent(cid[1]);
    out.push('https://calendar.google.com/calendar/ical/' + encodeURIComponent(c) + '/public/basic.ics');
  }
  // 嵌入網址裡的 src= / srcid= 參數（網頁版網址、嵌入 iframe 都可能有）
  try {
    const u = new URL(s);
    const sc = u.searchParams.get('src') || u.searchParams.get('srcid') || '';
    if (sc && sc.indexOf('@') > -1) out.push('https://calendar.google.com/calendar/ical/' + encodeURIComponent(sc) + '/public/basic.ics');
  } catch (e) {}
  // 已經是 ical 網址（含網頁版 ical 連結）
  if (/\.ics/i.test(s)) out.push(s.replace(/^http:\/\/(www\.)?google\.com/i, 'https://calendar.google.com'));
  // 使用者直接貼了行事曆 ID（含 @gmail.com 或亂碼 ID）
  if (/^[^\s/@]+(%40|@)[^\s/]+$/.test(s)) {
    out.push('https://calendar.google.com/calendar/ical/' + encodeURIComponent(s) + '/public/basic.ics');
  }
  out.push(s);
  return [...new Set(out)];
}

export default async function handler(req, res) {
  try {
    const raw = (req.query && (req.query.src || req.query.url)) || (() => { try { return new URL(req.url, 'http://x').searchParams.get('src'); } catch { return ''; } })();
    if (!raw) { res.status(400).json({ error: '沒有給行事曆網址' }); return; }

    const list = candidates(raw).filter((u) => {
      try { const h = new URL(u).hostname.toLowerCase(); return HOSTS.some((x) => h === x || h.endsWith('.' + x)); } catch { return false; }
    });
    if (!list.length) { res.status(400).json({ error: '這不是 Google 行事曆的網址，請貼 Google 的 basic.ics 網址' }); return; }

    let lastErr = '讀不到資料';
    for (const u of list) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; inspo-board/1.1)' }, redirect: 'follow' });
        if (!r.ok) { lastErr = 'Google 回覆 ' + r.status + (r.status === 404 ? '，通常是這個行事曆沒有公開' : '，請確認權限已設為公開'); continue; }
        const text = await r.text();
        if (!/BEGIN:VCALENDAR/i.test(text)) { lastErr = '抓到的不是行事曆資料，請確認貼的是 basic.ics 那一條網址'; continue; }
        const nameM = text.match(/X-WR-CALNAME:(.+)/i);
        const calName = nameM ? unescapeIcs(nameM[1]).slice(0, 60) : '';
        const events = parseIcs(text);
        events.sort((a, b) => (a.start + a.time).localeCompare(b.start + b.time));
        res.setHeader('Cache-Control', 's-maxage=60');
        res.status(200).json({ name: calName, events, count: events.length, used: u });
        return;
      } catch (e) {
        lastErr = String((e && e.message) || e);
      }
    }
    res.status(502).json({ error: lastErr });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
