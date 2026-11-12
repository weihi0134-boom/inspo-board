const FOLDERS = ['影片靈感', '文案點子', '語音備忘', '想拍的影片', '新歌靈感'];
const STATUS = { todo: '代辦', doing: '正在處理', done: '已完成' };
const DOT = { todo: '#ffb020', doing: '#7c5cff', done: '#3ddc84' };
let state = { items: [], tasks: [], folder: FOLDERS[0], addType: 'link' };
let recorder = null, recChunks = [], recBlob = null;

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
    const [a, b] = await Promise.all([api('/api/items'), api('/api/tasks')]);
    state.items = a.items || [];
    state.tasks = b.tasks || [];
  } catch (e) { alert('讀取資料失敗：' + e.message); }
  renderIdeas();
  renderBoard();
}

function switchView(v) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.getElementById('view-ideas').classList.toggle('hidden', v !== 'ideas');
  document.getElementById('view-board').classList.toggle('hidden', v !== 'board');
}

/* ===== IDEAS ===== */
function pickFolder(f) {
  state.folder = f;
  state.addType = f === '語音備忘' ? 'audio' : 'link';
  recBlob = null;
  renderIdeas();
}
function pickType(t) { state.addType = t; recBlob = null; renderIdeas(); }

function renderIdeas() {
  const el = document.getElementById('view-ideas');
  const chips = FOLDERS.map((f) => `<div class="chip ${f === state.folder ? 'active' : ''}" onclick="pickFolder('${f}')">${f}</div>`).join('');
  const list = state.items.filter((x) => x.folder === state.folder);
  const cards = list.length ? list.map(itemCard).join('') : '<div class="empty">這個資料夾還沒有靈感，從上面新增吧！</div>';
  el.innerHTML = `
    <div class="chips">${chips}</div>
    <div class="panel">${addForm()}</div>
    ${cards}`;
}

function addForm() {
  const seg = `<div class="seg">
    <button class="${state.addType === 'link' ? 'on' : ''}" onclick="pickType('link')">🔗 連結</button>
    <button class="${state.addType === 'text' ? 'on' : ''}" onclick="pickType('text')">📝 文字</button>
    <button class="${state.addType === 'audio' ? 'on' : ''}" onclick="pickType('audio')">🎤 錄音</button>
  </div>`;
  let body = '';
  if (state.addType === 'link') {
    body = `<input id="f-title" placeholder="標題（可空）" />
      <div class="row"><input id="f-content" placeholder="貼上影片 / 網頁連結" /></div>`;
  } else if (state.addType === 'text') {
    body = `<input id="f-title" placeholder="標題（可空）" />
      <div class="row"><textarea id="f-content" placeholder="寫下你的點子..."></textarea></div>`;
  } else {
    const preview = recBlob ? `<audio controls src="${URL.createObjectURL(recBlob)}"></audio>` : '<div class="muted">點「開始錄音」說話，再按「停止」。</div>';
    body = `<input id="f-title" placeholder="標題（可空）" />
      <div class="row">
        <button class="btn rec" id="rec-btn" onclick="toggleRec()">● 開始錄音</button>
      </div>
      <div style="margin-top:10px">${preview}</div>`;
  }
  return seg + body + `<div class="row"><button class="btn" onclick="addItem()" style="flex:1">➕ 加到「${state.folder}」</button></div>`;
}
function itemCard(x) {
  let inner = '';
  if (x.type === 'link') inner = `<a href="${esc(x.content)}" target="_blank" rel="noopener">${esc(x.content)}</a>`;
  else if (x.type === 'audio') inner = `<audio controls src="${esc(x.content)}"></audio>`;
  else inner = `<div style="white-space:pre-wrap;font-size:14px">${esc(x.content)}</div>`;
  const title = x.title ? `<h3>${esc(x.title)}</h3>` : '';
  const d = new Date(x.createdAt);
  const ds = `${d.getMonth() + 1}/${d.getDate()}`;
  return `<div class="card">${title}${inner}
    <div class="meta"><span class="muted">${ds}</span>
    <button class="del" onclick="delItem('${x.id}')">🗑 刪除</button></div></div>`;
}

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
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      renderIdeas();
    };
    recorder.start();
    btn.textContent = '■ 停止錄音';
    btn.style.background = '#2a2f3a';
  } catch (e) {
    alert('無法使用麥克風，請允許麥克風權限：' + e.message);
  }
}

async function addItem() {
  const titleEl = document.getElementById('f-title');
  const title = titleEl ? titleEl.value.trim() : '';
  let content = '';
  if (state.addType === 'audio') {
    if (!recBlob) { alert('請先錄一段語音'); return; }
    try {
      const up = await fetch('/api/upload?ext=webm', { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: recBlob });
      const j = await up.json();
      if (!up.ok) throw new Error(j.error || '上傳失敗');
      content = j.url;
    } catch (e) { alert('語音上傳失敗：' + e.message); return; }
  } else {
    const cEl = document.getElementById('f-content');
    content = cEl ? cEl.value.trim() : '';
    if (!content) { alert('內容不能空白'); return; }
  }
  try {
    await api('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: state.folder, type: state.addType, title, content }) });
    recBlob = null;
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

function renderBoard() {
  const el = document.getElementById('view-board');
  const todo = state.tasks.filter((t) => t.status === 'todo');
  const doing = state.tasks.filter((t) => t.status === 'doing');
  const done = state.tasks.filter((t) => t.status === 'done');

  const banner = `<div class="banner">
    <div class="stat"><b>${todo.length}</b><span>待辦 代辦</span></div>
    <div class="stat"><b style="color:#7c5cff">${doing.length}</b><span>正在處理</span></div>
    <div class="stat"><b style="color:#3ddc84">${done.length}</b><span>已完成</span></div>
  </div>`;

  const execIdeas = [...new Set(doing.filter((t) => t.ideaId).map((t) => t.ideaId))].map((id) => `<li>🔥 ${esc(ideaTitle(id))}</li>`).join('');
  const exec = `<div class="exec"><h2>正在執行的創意</h2>${execIdeas ? '<ul style="margin:0;padding-left:18px">' + execIdeas + '</ul>' : '<div class="muted">把代辦移到「正在處理」並關聯一個靈感，這裡就會顯示。</div>'}</div>`;

  const ideaOpts = ['<option value="">（可選）關聯一個靈感</option>']
    .concat(state.items.map((x) => `<option value="${x.id}">${esc(ideaTitle(x.id) || x.folder)}</option>`)).join('');
  const addPanel = `<div class="panel">
    <input id="t-title" placeholder="要做什麼事？" />
    <div class="row"><select id="t-idea">${ideaOpts}</select></div>
    <div class="row"><input id="t-due" type="date" /></div>
    <div class="row"><button class="btn" style="flex:1" onclick="addTask()">➕ 新增代辦</button></div>
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
    <div style="text-align:right;margin-top:4px"><button class="del" onclick="delTask('${t.id}')">🗑</button></div></div>`;
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
  if (!confirm('確定刪除這件代辦？')) return;
  try { await api('/api/tasks?id=' + encodeURIComponent(id), { method: 'DELETE' }); await loadAll(); }
  catch (e) { alert('刪除失敗：' + e.message); }
}

loadAll();
