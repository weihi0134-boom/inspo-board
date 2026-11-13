const FOLDERS = ['影片靈感', '文案點子', '語音備忘', '想拍的影片', '新歌靈感'];
const STATUS = { todo: '待辦事項', doing: '正在處理', done: '已完成' };
const DOT = { todo: '#d5b185', doing: '#7fa3b2', done: '#7d9a6d' };
let state = { items: [], tasks: [], settings: { calendarSrc: '' }, folder: FOLDERS[0], addType: 'link', calMode: 'month', calOffset: 0, calSrcKind: 'main', calEvents: [], calErr: '', holidaySrc: 'https://calendar.google.com/calendar/ical/zh-tw.taiwan%23holiday%40group.v.calendar.google.com/public/basic.ics' };
let recorder = null, recChunks = [], recBlob = null, recFile = null;
let imgFiles = [];
let draft = { title: '', link: '', content: '', note: '' };
let openMonths = {};   // 全部行程清單：哪幾個月是展開的
let ideasOpen = true;  // 全部靈感是否展開
let catOn = true, catTimer = null;
function toggleIdeas() { ideasOpen = !ideasOpen; renderIdeas(); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function api(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) {} throw new Error(m || ('HTTP ' + r.status)); }
  return r.json();
}
async function loadAll() {
  try {
    const [a, b, c] = await Promise.all([api('/api/items'), api('/api/tasks'), api('/api/settings')]);
    state.items = a.items || [];
    state.tasks = b.tasks || [];
    state.settings = c.settings || { calendarSrc: '' };
  } catch (e) { alert('讀取資料失敗：' + e.message); }
  renderIdeas();
  renderBoard();
  renderCalendar();
  startCat();
}

function switchView(v) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  ['ideas', 'board', 'calendar'].forEach((k) => document.getElementById('view-' + k).classList.toggle('hidden', k !== v));
}

/* ===== IDEAS ===== */
function pickFolder(f) {
  state.folder = f;
  renderIdeas();
}

function renderIdeas() {
  const el = document.getElementById('view-ideas');
  if (!el) return;
  const chips = FOLDERS.map((f) => `<div class="chip ${f === state.folder ? 'active' : ''}" onclick="pickFolder('${f}')">${f}</div>`).join('');
  const all = state.items.slice().sort((a, b) => b.createdAt - a.createdAt);
  const list = all.length ? all.map(itemCard).join('') : '<div class="empty">還沒有靈感，從上面新增吧！</div>';
  const count = all.length;
  el.innerHTML = `
    <div class="chips">${chips}</div>
    <div class="panel"><h4>新增靈感 · 會存到「${state.folder}」</h4>${addForm()}</div>
    <button class="foldhead static" style="margin-top:18px" onclick="toggleIdeas()">
      <span>💡 全部靈感 <span class="muted">(${count})</span></span>
      <span class="chev">${ideasOpen ? '▴' : '▾'}</span>
    </button>
    ${ideasOpen ? list : ''}`;
}

function addForm() {
  const titleField = `<div class="field"><label>標題</label><input id="f-title" placeholder="選填，幫這則靈感取個名字" value="${esc(draft.title || '')}" oninput="draft.title=this.value" /></div>`;

  const linkField = `<div class="field"><label>連結</label><input id="f-link" placeholder="貼上影片、網頁、貼文連結（可空）" value="${esc(draft.link)}" oninput="draft.link=this.value" /></div>`;
  const textField = `<div class="field"><label>文字 / 內容</label><textarea id="f-content" placeholder="寫下你的點子、看到的一段話..." oninput="draft.content=this.value">${esc(draft.content)}</textarea></div>`;

  const psrc = recBlob ? URL.createObjectURL(recBlob) : (recFile ? URL.createObjectURL(recFile) : '');
  const preview = psrc ? `<audio controls src="${psrc}"></audio>` : '<div class="muted">按「開始錄音」直接錄，或選一個已經錄好的檔案上傳。</div>';
  const audioField = `<div class="field"><label>錄音 / 語音</label>
      <div class="row"><button class="btn ghost rec" id="rec-btn" onclick="toggleRec()" style="flex:1;font-size:14px;font-weight:500;padding:12px">${recorder && recorder.state === 'recording' ? '⏹ 停止錄音' : '🎙 開始錄音'}</button></div>
      <div class="row"><label class="btn ghost" style="flex:1;text-align:center;cursor:pointer;margin:0">📁 上傳錄音檔<input type="file" accept="audio/*" style="display:none" onchange="pickFile(this)" /></label></div>
      <div style="margin-top:10px">${preview}</div></div>`;

  const noteField = `<div class="field"><label>內容 / 備註</label><textarea id="f-note" placeholder="補充說明、想法、為什麼存這個..." oninput="draft.note=this.value">${esc(draft.note)}</textarea></div>`;

  const thumbs = imgFiles.map((f, i) => `<img src="${URL.createObjectURL(f)}" onclick="rmImg(${i})" title="點一下移除" />`).join('');
  const imgField = `<div class="field"><label>圖片 / 截圖（可多張）</label>
    <label class="btn ghost" style="display:block;text-align:center;cursor:pointer;margin:0">📷 上傳截圖<input type="file" accept="image/*" multiple style="display:none" onchange="pickImages(this)" /></label>
    ${thumbs ? `<div class="thumbs">${thumbs}</div><div class="muted" style="margin-top:6px">點圖片可移除</div>` : ''}</div>`;

  return titleField + linkField + textField + noteField + audioField + imgField +
    `<div class="row"><button class="btn" onclick="addItem()" style="flex:1">➕ 加到「${state.folder}」</button></div>`;
}

function itemCard(x) {
  let inner = '';
  if (x.type === 'link' && x.content) {
    inner += `<a href="${esc(x.content)}" target="_blank" rel="noopener">${esc(x.content)}</a>`;
  } else if (x.type === 'audio' && x.content) {
    inner += `<audio controls src="${esc(x.content)}"></audio>`;
  } else if (x.type === 'text' && x.content) {
    inner += `<div style="white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(x.content)}</div>`;
  }
  if (x.type === 'link' && x.text) {
    inner += `<div style="white-space:pre-wrap;font-size:14px;line-height:1.55;margin-top:6px">${esc(x.text)}</div>`;
  }
  if (x.audioUrl) inner += `<audio controls src="${esc(x.audioUrl)}"></audio>`;
  const note = x.note ? `<div style="margin-top:8px;font-size:13px;color:#5b6b73;white-space:pre-wrap;line-height:1.55">${esc(x.note)}</div>` : '';
  const imgs = (x.images && x.images.length) ? `<div class="thumbs">${x.images.map((u) => `<img src="${esc(u)}" onclick="zoom('${esc(u)}')" />`).join('')}</div>` : '';
  const title = x.title ? `<h3>${esc(x.title)}</h3>` : '';
  const fold = `<span class="tag fold">${esc(x.folder || '')}</span>`;
  const d = new Date(x.createdAt);
  const ds = `${d.getMonth() + 1}/${d.getDate()}`;
  return `<div class="card">${title}${inner}${note}${imgs}
    <div class="meta"><span class="muted">${ds}</span><span>${fold}</span>
    <button class="del" onclick="delItem('${x.id}')">🗑 刪除</button></div></div>`;
}

function zoom(u) {
  const d = document.createElement('div');
  d.className = 'lightbox';
  d.onclick = () => d.remove();
  d.innerHTML = `<img src="${esc(u)}" />`;
  document.body.appendChild(d);
}

function pickImages(input) {
  const fs = Array.from(input.files || []);
  imgFiles = imgFiles.concat(fs).slice(0, 8);
  renderIdeas();
}
function rmImg(i) { imgFiles.splice(i, 1); renderIdeas(); }
async function toggleRec() {
  const btn = document.getElementById('rec-btn');
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recChunks = [];
    recFile = null;
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      renderIdeas();
    };
    recorder.start();
    btn.textContent = '⏹ 停止錄音';
    btn.style.background = '#ecd9bf';
    btn.style.color = '#4a3a28';
  } catch (e) {
    alert('無法使用麥克風，請允許麥克風權限：' + e.message);
  }
}

function pickFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  recFile = f;
  recBlob = null;
  renderIdeas();
}

async function uploadBlob(blob, ext, ct) {
  const up = await fetch('/api/upload?ext=' + encodeURIComponent(ext), { method: 'POST', headers: { 'Content-Type': ct }, body: blob });
  const j = await up.json();
  if (!up.ok) throw new Error(j.error || '上傳失敗');
  return j.url;
}

async function addItem() {
  const titleEl = document.getElementById('f-title');
  const title = titleEl ? titleEl.value.trim() : '';
  const linkEl = document.getElementById('f-link');
  const link = linkEl ? linkEl.value.trim() : '';
  const cEl = document.getElementById('f-content');
  const text = cEl ? cEl.value.trim() : '';
  const noteEl = document.getElementById('f-note');
  const note = noteEl ? noteEl.value.trim() : '';

  const blob = recBlob || recFile;
  if (!link && !text && !note && !blob && !imgFiles.length) {
    alert('請至少填一樣：連結、文字、錄音、備註或圖片');
    return;
  }

  let audioUrl = '';
  if (blob) {
    let ext = 'webm', ct = 'audio/webm';
    if (recFile) {
      ct = recFile.type || 'audio/mpeg';
      const m = recFile.name.match(/\.([a-z0-9]+)$/i);
      ext = m ? m[1].toLowerCase() : ((ct.split('/')[1]) || 'mp3');
    }
    try { audioUrl = await uploadBlob(blob, ext, ct); }
    catch (e) { alert('語音上傳失敗：' + e.message); return; }
  }

  const urls = [];
  try {
    for (const f of imgFiles) {
      const m = f.name.match(/\.([a-z0-9]+)$/i);
      const ext = m ? m[1].toLowerCase() : 'jpg';
      urls.push(await uploadBlob(f, ext, f.type || 'image/jpeg'));
    }
  } catch (e) { alert('圖片上傳失敗：' + e.message); return; }

  // 一則靈感只會是一張卡片：type 以「主要內容」判定，其餘全部掛在同一則
  let type = 'text', content = '';
  if (link) { type = 'link'; content = link; }
  else if (text) { type = 'text'; content = text; }
  else if (audioUrl) { type = 'audio'; content = audioUrl; }

  try {
    await api('/api/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: state.folder, type, title, content, link, text, audioUrl, note, images: urls }),
    });
    recBlob = null; recFile = null; imgFiles = [];
    draft = { title: '', link: '', content: '', note: '' };
    await loadAll();
  } catch (e) { alert('新增失敗：' + e.message); }
}

async function delItem(id) {
  if (!confirm('確定刪除這則靈感？')) return;
  try { await api('/api/items?id=' + encodeURIComponent(id), { method: 'DELETE' }); await loadAll(); }
  catch (e) { alert('刪除失敗：' + e.message); }
}
/* ===== BOARD ===== */
function ideaTitle(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return '';
  return it.title || (it.type === 'link' ? it.content : it.type === 'audio' ? '🎤 語音備忘' : it.content.slice(0, 20));
}

function calEventUrl(t) {
  const date = t.due || new Date().toISOString().slice(0, 10);
  const ymd = date.replace(/-/g, '');
  const start = ymd + 'T090000';
  const end = ymd + 'T100000';
  const idea = t.ideaId ? ideaTitle(t.ideaId) : '';
  const text = t.title + (idea ? '｜靈感：' + idea : '');
  const details = '來自靈感收集箱的待辦事項' + (idea ? '\n關聯靈感：' + idea : '');
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: text.slice(0, 300), dates: start + '/' + end,
    details: details.slice(0, 500),
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function renderBoard() {
  const el = document.getElementById('view-board');
  if (!el) return;
  const todo = state.tasks.filter((t) => t.status === 'todo');
  const doing = state.tasks.filter((t) => t.status === 'doing');
  const done = state.tasks.filter((t) => t.status === 'done');

  const banner = `<div class="banner">
    <div class="stat"><b>${todo.length}</b><span>待辦事項</span></div>
    <div class="stat"><b style="color:#7fa3b2">${doing.length}</b><span>正在處理</span></div>
    <div class="stat"><b style="color:#7d9a6d">${done.length}</b><span>已完成</span></div>
  </div>`;

  const execIdeas = [...new Set(doing.filter((t) => t.ideaId).map((t) => t.ideaId))].map((id) => `<li>🔥 ${esc(ideaTitle(id))}</li>`).join('');
  const exec = `<div class="exec"><h2>正在執行的創意</h2>${execIdeas ? '<ul style="margin:0;padding-left:18px">' + execIdeas + '</ul>' : '<div class="muted">把待辦事項移到「正在處理」並關聯一個靈感，這裡就會顯示。</div>'}</div>`;

  const ideaOpts = ['<option value="">（選填）關聯一個靈感</option>']
    .concat(state.items.map((x) => `<option value="${x.id}">${esc((ideaTitle(x.id) || x.content || x.folder).slice(0, 40))}</option>`)).join('');

  const addPanel = `<div class="panel">
    <div class="field"><label>要做什麼事</label><input id="t-title" placeholder="例如：剪好新歌 MV 的第一版" /></div>
    <div class="field"><label>關聯靈感</label><select id="t-idea">${ideaOpts}</select></div>
    <div class="field"><label>日期</label><input id="t-due" type="date" /></div>
    <div class="row"><button class="btn" style="flex:1" onclick="addTask()">➕ 新增待辦事項</button></div>
  </div>`;

  const col = (key, arr) => `<div class="col">
    <h2><span class="dot" style="background:${DOT[key]}"></span>${STATUS[key]} <span class="muted">(${arr.length})</span></h2>
    ${arr.length ? arr.map(taskCard).join('') : '<div class="empty">—</div>'}</div>`;

  el.innerHTML = banner + exec + addPanel + `<div class="cols">${col('todo', todo)}${col('doing', doing)}${col('done', done)}</div>`;
}

function taskCard(t) {
  const idea = t.ideaId ? `<span class="tag">💡 ${esc(ideaTitle(t.ideaId))}</span>` : '';
  const due = t.due ? `<span class="tag due">📅 ${esc(t.due)}</span>` : '';
  let mv = '';
  if (t.status === 'todo') mv = `<button onclick="moveTask('${t.id}','doing')">開始 →</button>`;
  else if (t.status === 'doing') mv = `<button onclick="moveTask('${t.id}','todo')">← 回待辦</button><button onclick="moveTask('${t.id}','done')">完成 ✓</button>`;
  else mv = `<button onclick="moveTask('${t.id}','doing')">← 重做</button>`;
  return `<div class="tcard"><p>${esc(t.title)}</p>${idea}${due}
    <div class="mv">${mv}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <button class="del" onclick="addToCal('${t.id}')" style="color:#9a6f3a">📅 加到 Google 行事曆</button>
      <button class="del" onclick="delTask('${t.id}')">🗑</button></div></div>`;
}

function addToCal(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  window.open(calEventUrl(t), '_blank', 'noopener');
}

async function addTask() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { alert('請輸入要做的事'); return; }
  const ideaId = document.getElementById('t-idea').value;
  const due = document.getElementById('t-due').value;
  try {
    await api('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, ideaId, due, status: 'todo' }) });
    await loadAll();
  } catch (e) { alert('新增失敗：' + e.message); }
}
async function moveTask(id, status) {
  try { await api('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); await loadAll(); }
  catch (e) { alert('更新失敗：' + e.message); }
}
async function delTask(id) {
  if (!confirm('確定刪除這件待辦事項？')) return;
  try { await api('/api/tasks?id=' + encodeURIComponent(id), { method: 'DELETE' }); await loadAll(); }
  catch (e) { alert('刪除失敗：' + e.message); }
}

/* ===== CALENDAR ===== */
function calSrc() {
  let s = (state.settings && state.settings.calendarSrc) || '';
  if (!s) return '';
  const m = s.match(/src=["']([^"']+)["']/i);
  if (m) s = m[1];
  return s.trim();
}

function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  if (!el) return;
  const src = calSrc();

  // 有貼網址就顯示「打開」按鈕；內容自己畫，不靠嵌入，才不會白畫面
  const openBtn = src ? `<div class="row" style="margin-bottom:12px">
      <a class="btn" href="${esc(src)}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">🔗 打開我的 Google 行事曆</a>
      <button class="btn ghost" onclick="clearCal()">重新設定</button></div>` : '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = state.tasks.filter((t) => t.due === todayStr);
  const todayIds = new Set(today.map((t) => t.id));
  const upcoming = state.tasks
    .filter((t) => t.status !== 'done' && t.due && t.due > todayStr && !todayIds.has(t.id))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);
  const setup = !src ? `<div class="calbox">
      <div class="sub">貼上你的 Google 行事曆網址，這裡就會列出你的行程。</div>
      <div class="field"><label>行事曆網址</label><input id="cal-input" placeholder="貼上行事曆網址（或整段嵌入程式碼）" value="" /></div>
      <button class="btn" onclick="saveCal()">儲存</button>
      <div class="hint" style="margin-top:14px">
        <b>怎麼拿網址：</b><br>
        1. 手機或電腦開 Google 行事曆 → 左邊「其他行事曆」找到你的行事曆 → 點旁邊「⋮」<br>
        2. 選「設定和共用」 → 往下拉找「整合行事曆」<br>
        3. 複製「日曆網址」那一串（會是 <b>.../ical/.../basic.ics</b> 開頭），或複製整段「嵌入程式碼」貼進來都可以<br>
        4. 上面的「存取權限」要設成<b>公開</b>
      </div>
    </div>` : '';
  const calModeBtns = src ? `<div class="calbtns" style="margin:0 0 10px">
        <button class="${state.calMode === 'week' ? 'on' : ''}" onclick="setCalMode('week')">本週</button>
        <button class="${state.calMode === 'month' ? 'on' : ''}" onclick="setCalMode('month')">本月</button>
        
      </div>
      ${state.calMode === 'agenda' ? '' : `<div class="calnav">
        <button onclick="calShift(-1)">‹ 上一${state.calMode === 'month' ? '個月' : '週'}</button>
        <button onclick="calShift(0);state.calOffset=0;renderCalendar()">今天</button>
        <button onclick="calShift(1)">下一${state.calMode === 'month' ? '個月' : '週'} ›</button>
      </div>`}` : '';

  const todayList = today.length ? today.map((t) => `<li>• ${esc(t.title)}</li>`).join('') : '<div class="muted">今天沒有標日期的待辦事項。</div>';
  const upList = upcoming.length ? upcoming.map((t) => `<li>${esc(t.due.slice(5))} ・ ${esc(t.title)} <span style="color:#8a6134;cursor:pointer" onclick="addToCal('${t.id}')">📅</span></li>`).join('') : '<div class="muted">還沒有排日期的待辦事項。</div>';

  const myTasks = `<div class="exec"><h2>今天的待辦</h2><ul style="margin:0;padding-left:16px">${todayList}</ul></div>
    <div class="exec"><h2>接下來要做的事</h2><ul style="margin:0;padding-left:16px;list-style:none">${upList}</ul></div>`;

  const srcSw = src ? `<div class="calnav">
      <button class="${state.calSrcKind === 'main' ? 'on' : ''}" onclick="setCalSrc('main')">我的行事曆</button>
      <button class="${state.calSrcKind === 'holiday' ? 'on' : ''}" onclick="setCalSrc('holiday')">台灣假日 🇹🇼</button>
    </div>` : '';
  // 順序（照使用者指定）：行事曆 → 今天的待辦 → 接下來要做的事 → 📋 全部行程清單
  const calListBox = src ? `<div id="cal-list-box"></div>` : '';
  el.innerHTML = setup + openBtn + srcSw + calModeBtns + `<div id="cal-native"></div>` + myTasks + calListBox;
  if (src) drawCalendar();
}

function calRange() {
  const now = new Date();
  const off = state.calOffset || 0;
  if (state.calMode === 'agenda') return [now, new Date(now.getTime() + 30 * 864e5)];
  if (state.calMode === 'month') {
    const a = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const b = new Date(now.getFullYear(), now.getMonth() + off + 1, 0);
    return [a, b];
  }
  const a = new Date(now);
  a.setDate(now.getDate() - ((now.getDay() + 6) % 7) + off * 7);
  const b = new Date(a);
  b.setDate(a.getDate() + 6);
  return [a, b];
}

function activeCalSrc() {
  return state.calSrcKind === 'holiday' ? state.holidaySrc : calSrc();
}

async function drawCalendar() {
  const box = document.getElementById('cal-native');
  if (!box) return;
  const url = activeCalSrc();
  if (!/^https?:/i.test(url)) {
    box.innerHTML = `<div class="calbox"><div class="sub">網址格式不對，請貼上以 https:// 開頭的行事曆網址。</div></div>`;
    return;
  }
  box.innerHTML = `<div class="calbox"><div class="muted">正在讀取行事曆…</div></div>`;
  try {
    const r = await fetch('/api/ics?src=' + encodeURIComponent(url) + '&t=' + Date.now());
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '讀取失敗');
    state.calEvents = j.events || [];
    if (j.raw) state.calDebug = j.raw;
    state.calErr = '';
    state.calName = j.name || '';
    box.innerHTML = `<div class="muted" style="margin:0 2px 8px">${state.calName ? '已連上「' + esc(state.calName) + '」，' : ''}讀到 ${state.calEvents.length} 筆行程${state.calSrcKind === 'holiday' ? '（台灣假日）' : ''}</div>` + calBoard(state.calEvents);
    const listBox = document.getElementById('cal-list-box');
    if (listBox) listBox.innerHTML = calAgendaList(state.calEvents);
  } catch (e) {
    state.calEvents = []; state.calErr = e.message;
    box.innerHTML = `<div class="calbox"><div class="sub">讀不到這本行事曆（診斷：${esc(e.message)}）。</div></div>`;
  }
}

function showDay(k) {
  const evs = (state.calEvents || []).filter((e) => {
    const st = (e.start || '').slice(0, 10);
    if (!st) return false;
    if (e.allDay) return st <= k && (e.end || st).slice(0, 10) >= k;
    return st === k;
  });
  const d = document.createElement('div');
  d.className = 'lightbox';
  d.onclick = () => d.remove();
  d.innerHTML = `<div class="daybox"><h4>${esc(k)} 的行程（${evs.length}）</h4>
    ${evs.map((e) => `<div class="calrow"><span>${esc(e.time || '整天')}</span>${esc(e.title)}</div>`).join('') || '<div class="muted">這天沒有行程</div>'}
    <button class="btn teal" style="margin-top:12px;width:100%" onclick="this.closest('.lightbox').remove()">關閉</button></div>`;
  document.body.appendChild(d);
}

function calBoard(events) {
  const [a, b] = calRange();
  const days = [];
  if (state.calMode === 'month') {
    const first = new Date(a);
    const startPad = new Date(first);
    startPad.setDate(1 - ((first.getDay() + 6) % 7)); // 從星期一開始
    for (let i = 0; i < 42; i++) { const d = new Date(startPad); d.setDate(startPad.getDate() + i); days.push(d); }
  } else {
    for (let i = 0; i < 7; i++) { const d = new Date(a); d.setDate(a.getDate() + i); days.push(d); }
  }
  const wk = ['一', '二', '三', '四', '五', '六', '日'];
  const todayK = dayKey(new Date());

  // 先把行程按日期分好（一次算完，避免每格重複比對出錯）
  const byDay = {};
  (events || []).forEach((e) => {
    const st = String(e.start || '').slice(0, 10);
    if (!st) return;
    if (!String(e.title || '').trim()) return;
    let en = String(e.end || st).slice(0, 10);
    if (en < st) en = st;
    // 保險：最長只佔 60 天，避免規則錯誤導致整月被塞滿
    let d = st, guard = 0;
    while (d <= en && guard < 60) {
      (byDay[d] = byDay[d] || []).push(e);
      d = addDaysJs(d, 1);
      guard += 1;
    }
  });
  Object.keys(byDay).forEach((k) => byDay[k].sort((x, y) => String(x.time).localeCompare(String(y.time))));

  const head = ['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="calhead">${w}</div>`).join('');
  const cells = days.map((d) => {
    const k = dayKey(d);
    const evs = byDay[k] || [];
    const dim = state.calMode === 'month' && d.getMonth() !== a.getMonth();
    const isT = k === todayK;
    const firstOfMonth = d.getDate() === 1 || d.getTime() === days[0].getTime();
    return `<div class="calcell ${dim ? 'dim' : ''} ${isT ? 'today' : ''}" onclick="showDay('${k}')">
      <div class="caldate">${d.getDate()}${firstOfMonth ? ' <span class="calmon">' + (d.getMonth() + 1) + '月</span>' : ''}</div>
      ${evs.slice(0, 4).map((e) => `<div class="calev" title="${esc(e.title)}">${e.time && e.time !== '整天' ? esc(e.time) + ' ' : ''}${esc(e.title)}</div>`).join('')}
      ${evs.length > 4 ? `<div class="calmore">還有 ${evs.length - 4} 筆…</div>` : ''}
    </div>`;
  }).join('');

  const label = state.calMode === 'month'
    ? `${a.getFullYear()} 年 ${a.getMonth() + 1} 月`
    : `${a.getMonth() + 1}/${a.getDate()} ～ ${b.getMonth() + 1}/${b.getDate()}`;
  return `<div class="calbox"><div class="sub">${label}${state.calOffset ? '' : '（本月）'}</div>
    <div class="calgrid">${head}${cells}</div></div>`;
}

function addDaysJs(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function calAgendaList(events) {
  const months = {};
  const today = dayKey(new Date());
  (events || [])
    .filter((e) => e.start && String(e.title || '').trim() && String(e.start).slice(0, 10) >= addDaysJs(today, -7))
    .sort((x, y) => (x.start + (x.time || '')).localeCompare(y.start + (y.time || '')))
    .forEach((e) => {
      const k = String(e.start).slice(0, 7);
      (months[k] = months[k] || []).push(e);
    });
  const keys = Object.keys(months).sort();
  const total = keys.reduce((n, k) => n + months[k].length, 0);
  if (!keys.length) return '<div class="calbox"><div class="muted">目前沒有行程。</div></div>';
  const body = keys.map((k) => {
    const [y, m] = k.split('-');
    const open = !!openMonths[k];
    const items = months[k].map((e) => {
      const d = String(e.start).slice(8, 10);
      const span = e.end && e.end !== e.start ? ` ～ ${String(e.end).slice(5, 10).replace('-', '/')}` : '';
      return `<div class="calrow"><b>${d}</b><span>${esc(e.time || '整天')}${esc(span)}</span>${esc(e.title)}</div>`;
    }).join('');
    return `<div class="fold ${open ? 'open' : ''}">
      <button class="foldhead" onclick="toggleMonth('${k}')">
        <span>${y} 年 ${Number(m)} 月 <span class="muted">(${months[k].length})</span></span>
        <span class="chev">▾</span>
      </button>
      <div class="foldbody">${items}</div></div>`;
  }).join('');
  return `<div class="calbox">
    <div class="foldhead static" onclick="toggleAllMonths(${keys.length})">
      <span>📋 全部行程清單 <span class="muted">(${total} 筆 / ${keys.length} 個月)</span></span>
      <span class="chev">${keys.every((k) => openMonths[k]) ? '▴' : '▾'}</span>
    </div>${body}</div>`;
}

function toggleMonth(k) { openMonths[k] = !openMonths[k]; renderCalendar(); }
function toggleAllMonths(n) {
  const anyOpen = Object.values(openMonths).some(Boolean);
  openMonths = {};
  if (!anyOpen) (state.calEvents || []).forEach((e) => { if (e.start) openMonths[String(e.start).slice(0, 7)] = true; });
  renderCalendar();
}

function setCalSrc(k) { state.calSrcKind = k; renderCalendar(); }
function setCalMode(m) { state.calMode = m; state.calOffset = 0; renderCalendar(); }
function calShift(n) { state.calOffset += n; renderCalendar(); }
async function saveCal() {
  const v = document.getElementById('cal-input').value.trim();
  if (!v) { alert('請先貼上行事曆網址'); return; }
  try {
    const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSrc: v }) });
    state.settings = r.settings;
    renderCalendar();
  } catch (e) { alert('儲存失敗：' + e.message); }
}
function onCalInput(v) {
  state.settings = { calendarSrc: v };
}
async function clearCal() {
  if (!confirm('要清除行事曆設定嗎？')) return;
  try {
    const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSrc: '' }) });
    state.settings = r.settings;
    renderCalendar();
  } catch (e) { alert('失敗：' + e.message); }
}

loadAll();

/* ===== 小黑貓 ===== */
const CAT_W = 84;
const CAT_ACTIONS = ['stretch', 'groom', 'yawn', 'look', 'tailchase', 'sit', 'sleep', 'walk', 'walk'];

function catEl() { return document.getElementById('cat-run'); }
function catX() {
  const svg = catEl();
  if (!svg) return 0;
  const m = svg.style.transform.match(/translateX\(([-\d.]+)px\)/);
  return m ? parseFloat(m[1]) : 0;
}
function catFace(dirLeft) {
  const svg = catEl();
  if (!svg) return;
  const body = svg.querySelector('#cat-body');
  faceLeft = !!dirLeft;
  body.setAttribute('transform', dirLeft ? 'translate(92,0) scale(-1,1)' : '');
}
let faceLeft = false;
function catSetState(st) {
  const svg = catEl();
  if (!svg) return;
  svg.classList.remove('walk', 'sleep', 'stretch', 'groom', 'yawn', 'pet', 'sit', 'appear');
  document.getElementById('cat-zzz').classList.remove('on');
  if (st) svg.classList.add(st);
  if (st === 'sleep') document.getElementById('cat-zzz').classList.add('on');
}
function catWalk() {
  if (!catOn) return;
  const svg = catEl();
  if (!svg) return;
  const maxX = Math.max(20, window.innerWidth - CAT_W - 6);
  const target = Math.max(4, Math.random() * maxX);
  const cur = catX();
  const dirLeft = target < cur;
  const dist = Math.abs(target - cur);

  if (dirLeft !== faceLeft && dist > 120) {
    /* 不倒退：先「咻 —」跳到另一邊，落地再繼續走 */
    clearTimeout(catTimer);
    catSetState('');
    svg.style.transition = 'opacity .28s';
    svg.style.opacity = '0';
    catTimer = setTimeout(() => {
      svg.style.transition = 'none';
      svg.style.transform = `translateX(${target}px)`;
      catFace(dirLeft);
      catMoveFx(target);
      svg.style.transition = 'opacity .3s';
      svg.style.opacity = '';
      catSetState('appear');
      catTimer = setTimeout(() => { catSetState(''); catIdle(); }, 700);
    }, 300);
    return;
  }

  catFace(dirLeft);
  const dur = Math.min(12, Math.max(3.2, dist / 88));
  svg.style.transition = `transform ${dur}s linear`;
  catSetState('walk');
  svg.style.transform = `translateX(${target}px)`;
  catPawTrack(cur, target, dur);
  catMoveFx(target);
  clearTimeout(catTimer);
  catTimer = setTimeout(catIdle, dur * 1000 + 250);
}

/* 腳印：沿著路線印下小肉球，踩過約 2.6 秒後慢慢淡掉 */
let pawTimer = null;
function pawCanvas() { return document.getElementById('cat-paws'); }
function sizePawCanvas() {
  const c = pawCanvas();
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = window.innerWidth * dpr;
  c.height = 74 * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const pawPrints = [];
function drawPaw(g, x, y, ang, alpha) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.globalAlpha = alpha;
  g.fillStyle = '#6f7b81';
  g.beginPath();
  g.ellipse(0, 2.4, 2.5, 2.1, 0, 0, Math.PI * 2);
  g.fill();
  const toes = [[-3.3, -1.4, 1.25], [-1.1, -3.4, 1.2], [1.1, -3.4, 1.2], [3.3, -1.4, 1.15]];
  toes.forEach(([tx, ty, r]) => {
    g.beginPath();
    g.ellipse(tx, ty, r, r * 1.08, 0, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();
}
function paintPaws() {
  const c = pawCanvas();
  if (!c) return;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const now = performance.now();
  for (let i = pawPrints.length - 1; i >= 0; i--) {
    const p = pawPrints[i];
    const age = now - p.t;
    if (age > 2600) { pawPrints.splice(i, 1); continue; }
    const a = age < 1500 ? 0.42 : 0.42 * (1 - (age - 1500) / 1100);
    drawPaw(g, p.x, p.y, p.a, Math.max(0, a));
  }
  if (pawPrints.length) requestAnimationFrame(paintPaws);
}
function catPawTrack(fromX, toX, dur) {
  const c = pawCanvas();
  if (!c) return;
  clearTimeout(pawTimer);
  sizePawCanvas();
  const dir = toX > fromX ? 1 : -1;
  const pxPerSec = Math.abs(toX - fromX) / dur;
  if (pxPerSec > 420) return; // 太快就不印了（例如跳轉）
  let n = 0;
  const stepMs = 150;
  const total = dur * 1000;
  const startT = performance.now();
  function tick() {
    const elapsed = performance.now() - startT;
    if (elapsed > total + 300 || !catOn) return;
    const ratio = Math.min(1, elapsed / total);
    const x = fromX + (toX - fromX) * ratio;
    const side = n % 2 === 0 ? 13 : 21;  // 左右腳交錯
    const y = 58 + (n % 2 === 0 ? 0 : -1.2);
    pawPrints.push({ x: x + side, y, a: dir > 0 ? 0 : Math.PI, t: performance.now() });
    n++;
    if (pawPrints.length === 1) requestAnimationFrame(paintPaws);
    pawTimer = setTimeout(tick, stepMs);
  }
  tick();
}
function catMoveFx(target) {
  const zzz = document.getElementById('cat-zzz');
  const hint = document.getElementById('cat-hint');
  const tx = faceLeft ? target + 30 : target + 34;
  if (zzz) zzz.style.left = tx + 'px';
  if (hint) hint.style.left = (target + 8) + 'px';
}
function catIdle() {
  if (!catOn) return;
  const st = CAT_ACTIONS[Math.floor(Math.random() * CAT_ACTIONS.length)];
  if (st === 'walk') { catWalk(); return; }
  catSetState(st);
  let wait = 2400 + Math.random() * 1800;
  if (st === 'sleep') wait = 8000 + Math.random() * 4000;
  if (st === 'stretch' || st === 'groom' || st === 'yawn') wait = 2200;
  if (st === 'tailchase') wait = 2600;
  clearTimeout(catTimer);
  catTimer = setTimeout(() => { catSetState(''); catWalk(); }, wait);
}
/* 嚕貓：點一下貓咪 */
function catPet(e) {
  if (e) e.stopPropagation();
  const svg = catEl();
  if (!svg) return;
  clearTimeout(catTimer);
  catSetState('pet');
  const x = catX();
  const stage = document.getElementById('cat-stage');
  const heart = document.createElement('div');
  heart.className = 'cat-heart';
  heart.textContent = ['♡', '♥', '～♡'][Math.floor(Math.random() * 3)];
  heart.style.left = (x + 30 + Math.random() * 16) + 'px';
  heart.style.bottom = '52px';
  stage.appendChild(heart);
  requestAnimationFrame(() => heart.classList.add('on'));
  setTimeout(() => heart.remove(), 1000);
  const hint = document.getElementById('cat-hint');
  hint.textContent = ['呼嚕呼嚕…', '好舒服～', '再摸一下', '喵～'][Math.floor(Math.random() * 4)];
  hint.style.left = (x + 6) + 'px';
  hint.classList.add('on');
  setTimeout(() => hint.classList.remove('on'), 1400);
  catTimer = setTimeout(() => { catSetState(''); catIdle(); }, 1700);
}
function toggleCat() {
  catOn = !catOn;
  const stage = document.getElementById('cat-stage');
  const badge = document.querySelector('.cat-badge');
  if (stage) stage.style.display = catOn ? '' : 'none';
  if (badge) badge.textContent = catOn ? '🐈 小貓' : '🐈 叫小貓出來';
  clearTimeout(catTimer);
  if (catOn) { catSetState('sit'); catTimer = setTimeout(catWalk, 1200); }
}
function startCat() {
  const svg = catEl();
  if (!svg) return;
  svg.addEventListener('click', catPet);
  window.addEventListener('resize', sizePawCanvas);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  svg.style.transition = 'none';
  svg.style.transform = `translateX(${Math.min(50, window.innerWidth - CAT_W - 8)}px)`;
  const hint = document.getElementById('cat-hint');
  hint.style.left = '58px';
  hint.classList.add('on');
  setTimeout(() => hint.classList.remove('on'), 2600);
  clearTimeout(catTimer);
  catTimer = setTimeout(catWalk, 2400);
}
