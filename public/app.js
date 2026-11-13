const FOLDERS = ['影片靈感', '文案點子', '語音備忘', '想拍的影片', '新歌靈感'];
const STATUS = { todo: '待辦事項', doing: '正在處理', done: '已完成' };
const DOT = { todo: '#d5b185', doing: '#7fa3b2', done: '#7d9a6d' };
let state = { items: [], tasks: [], settings: { calendarSrc: '' }, folder: FOLDERS[0], addType: 'link', calMode: 'week' };
let recorder = null, recChunks = [], recBlob = null, recFile = null;
let imgFiles = [];

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
}

function switchView(v) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  ['ideas', 'board', 'calendar'].forEach((k) => document.getElementById('view-' + k).classList.toggle('hidden', k !== v));
}

/* ===== IDEAS ===== */
function pickFolder(f) {
  state.folder = f;
  state.addType = f === '語音備忘' ? 'audio' : 'link';
  recBlob = null; recFile = null; imgFiles = [];
  renderIdeas();
}
function pickType(t) { state.addType = t; recBlob = null; recFile = null; imgFiles = []; renderIdeas(); }

function renderIdeas() {
  const el = document.getElementById('view-ideas');
  if (!el) return;
  const chips = FOLDERS.map((f) => `<div class="chip ${f === state.folder ? 'active' : ''}" onclick="pickFolder('${f}')">${f}</div>`).join('');
  const list = state.items.filter((x) => x.folder === state.folder);
  const cards = list.length ? list.map(itemCard).join('') : '<div class="empty">這個資料夾還沒有靈感，從上面新增吧！</div>';
  el.innerHTML = `
    <div class="chips">${chips}</div>
    <div class="panel"><h4>新增靈感到「${state.folder}」</h4>${addForm()}</div>
    ${cards}`;
}

function addForm() {
  const seg = `<div class="seg">
    <button class="${state.addType === 'link' ? 'on' : ''}" onclick="pickType('link')">🔗 連結</button>
    <button class="${state.addType === 'text' ? 'on' : ''}" onclick="pickType('text')">📝 文字</button>
    <button class="${state.addType === 'audio' ? 'on' : ''}" onclick="pickType('audio')">🎤 錄音</button>
  </div>`;

  const titleField = `<div class="field"><label>標題</label><input id="f-title" placeholder="選填，幫這則靈感取個名字" /></div>`;
  let mainField = '';
  if (state.addType === 'link') {
    mainField = `<div class="field"><label>連結</label><input id="f-content" placeholder="貼上影片或網頁連結" /></div>`;
  } else if (state.addType === 'text') {
    mainField = `<div class="field"><label>內容</label><textarea id="f-content" placeholder="寫下你的點子..."></textarea></div>`;
  } else {
    const psrc = recBlob ? URL.createObjectURL(recBlob) : (recFile ? URL.createObjectURL(recFile) : '');
    const preview = psrc ? `<audio controls src="${psrc}"></audio>` : '<div class="muted">按「開始錄音」直接錄，或選一個已經錄好的檔案上傳。</div>';
    mainField = `<div class="field"><label>語音</label>
      <div class="row"><button class="btn rec" id="rec-btn" onclick="toggleRec()" style="flex:1">● 開始錄音</button></div>
      <div class="row"><label class="btn ghost" style="flex:1;text-align:center;cursor:pointer;margin:0">📁 上傳錄音檔<input type="file" accept="audio/*" style="display:none" onchange="pickFile(this)" /></label></div>
      <div style="margin-top:10px">${preview}</div></div>`;
  }

  const thumbs = imgFiles.map((f, i) => `<img src="${URL.createObjectURL(f)}" onclick="rmImg(${i})" title="點一下移除" />`).join('');
  const imgField = `<div class="field"><label>圖片 / 截圖（可多張）</label>
    <label class="btn ghost" style="display:block;text-align:center;cursor:pointer;margin:0">📷 上傳截圖<input type="file" accept="image/*" multiple style="display:none" onchange="pickImages(this)" /></label>
    ${thumbs ? `<div class="thumbs">${thumbs}</div><div class="muted" style="margin-top:6px">點圖片可移除</div>` : ''}</div>`;

  const noteField = `<div class="field"><label>內容 / 備註</label><textarea id="f-note" placeholder="補充說明、想法、為什麼存這個..."></textarea></div>`;

  return seg + titleField + mainField + noteField + imgField +
    `<div class="row"><button class="btn" onclick="addItem()" style="flex:1">➕ 加到「${state.folder}」</button></div>`;
}

function itemCard(x) {
  let inner = '';
  if (x.type === 'link') inner = `<a href="${esc(x.content)}" target="_blank" rel="noopener">${esc(x.content)}</a>`;
  else if (x.type === 'audio') inner = `<audio controls src="${esc(x.content)}"></audio>`;
  else inner = `<div style="white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(x.content)}</div>`;
  const note = x.note ? `<div style="margin-top:8px;font-size:13px;color:#5b6b73;white-space:pre-wrap;line-height:1.55">${esc(x.note)}</div>` : '';
  const imgs = (x.images && x.images.length) ? `<div class="thumbs">${x.images.map((u) => `<img src="${esc(u)}" onclick="zoom('${esc(u)}')" />`).join('')}</div>` : '';
  const title = x.title ? `<h3>${esc(x.title)}</h3>` : '';
  const d = new Date(x.createdAt);
  const ds = `${d.getMonth() + 1}/${d.getDate()}`;
  return `<div class="card">${title}${inner}${note}${imgs}
    <div class="meta"><span class="muted">${ds}</span>
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
    btn.textContent = '■ 停止錄音';
    btn.style.background = '#7fa3b2';
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
  const noteEl = document.getElementById('f-note');
  const note = noteEl ? noteEl.value.trim() : '';
  let content = '';

  if (state.addType === 'audio') {
    const blob = recBlob || recFile;
    if (!blob) { alert('請先錄一段語音，或選一個錄音檔'); return; }
    let ext = 'webm', ct = 'audio/webm';
    if (recFile) {
      ct = recFile.type || 'audio/mpeg';
      const m = recFile.name.match(/\.([a-z0-9]+)$/i);
      ext = m ? m[1].toLowerCase() : ((ct.split('/')[1]) || 'mp3');
    }
    try { content = await uploadBlob(blob, ext, ct); }
    catch (e) { alert('語音上傳失敗：' + e.message); return; }
  } else {
    const cEl = document.getElementById('f-content');
    content = cEl ? cEl.value.trim() : '';
    if (!content && !imgFiles.length && !note) { alert('請至少填一個連結、文字、備註或圖片'); return; }
  }

  const urls = [];
  try {
    for (const f of imgFiles) {
      const m = f.name.match(/\.([a-z0-9]+)$/i);
      const ext = m ? m[1].toLowerCase() : 'jpg';
      urls.push(await uploadBlob(f, ext, f.type || 'image/jpeg'));
    }
  } catch (e) { alert('圖片上傳失敗：' + e.message); return; }

  try {
    await api('/api/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: state.folder, type: state.addType, title, content, note, images: urls }),
    });
    recBlob = null; recFile = null; imgFiles = [];
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
  if (s.startsWith('http://')) s = s.replace('http://', 'https://');
  if (s.includes('calendar.google.com')) s = s.replace('calendar.google.com', 'www.google.com');
  return s;
}

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  if (!el) return;
  const src = calSrc();
  const today = state.tasks.filter((t) => t.due === new Date().toISOString().slice(0, 10));
  const upcoming = state.tasks.filter((t) => t.status !== 'done' && t.due && t.due >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);

  let body = '';
  if (!src) {
    body = `<div class="calbox">
      <div class="sub">還沒接上 Google 行事曆。把行事曆的網址貼進來，就能在這裡直接看到。</div>
      <div class="field"><label>行事曆網址</label><input id="cal-input" placeholder="貼上 iframe 網址或行事曆網址" value="" /></div>
      <button class="btn" onclick="saveCal()">儲存並顯示</button>
      <div class="hint" style="margin-top:14px">
        <b>怎麼拿網址：</b>電腦開 Google 行事曆 → 左邊你的行事曆旁邊「⋮」→ 設定和共用 → 往下拉找「整合行事曆」→ 複製「嵌入程式碼」那段整包貼進來就好（網站會自動抓網址）。記得該行事曆的權限要設成公開。
      </div>
    </div>`;
  } else {
    body = `<div class="calbox">
      <div class="calbtns" style="margin:0 0 10px">
        <button class="${state.calMode === 'week' ? 'on' : ''}" onclick="setCalMode('week')">本週</button>
        <button class="${state.calMode === 'month' ? 'on' : ''}" onclick="setCalMode('month')">本月</button>
        <button class="${state.calMode === 'agenda' ? 'on' : ''}" onclick="setCalMode('agenda')">清單</button>
        <button onclick="clearCal()">重新設定</button>
      </div>
      <iframe src="${esc(buildCalUrl(src))}" loading="lazy"></iframe>
    </div>`;
  }

  const todayList = today.length ? today.map((t) => `<li>• ${esc(t.title)}</li>`).join('') : '<div class="muted">今天沒有標日期的待辦事項。</div>';
  const upList = upcoming.length ? upcoming.map((t) => `<li>${esc(t.due.slice(5))} ・ ${esc(t.title)} <span style="color:#9a6f3a;cursor:pointer" onclick="addToCal('${t.id}')">📅</span></li>`).join('') : '<div class="muted">還沒有排日期的待辦事項。</div>';

  const myTasks = `<div class="exec"><h2>今天的待辦</h2><ul style="margin:0;padding-left:16px">${todayList}</ul></div>
    <div class="exec"><h2>接下來要做的事</h2><ul style="margin:0;padding-left:16px;list-style:none">${upList}</ul></div>`;

  el.innerHTML = body + myTasks;
}

function buildCalUrl(base) {
  const mode = state.calMode === 'agenda' ? 'AGENDA' : (state.calMode === 'month' ? 'MONTH' : 'WEEK');
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + 'mode=' + mode + '&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&ctz=Asia%2FTaipei';
}
function setCalMode(m) { state.calMode = m; renderCalendar(); }
async function saveCal() {
  const v = document.getElementById('cal-input').value.trim();
  if (!v) { alert('請先貼上行事曆網址'); return; }
  try {
    const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSrc: v }) });
    state.settings = r.settings;
    renderCalendar();
  } catch (e) { alert('儲存失敗：' + e.message); }
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
