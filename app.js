const STORAGE_KEY = 'repoMover:moves-v3';
const THEME_KEY = 'repoMover:theme';

const els = {
  themeToggle: document.getElementById('themeToggle'),
  addBtn: document.getElementById('addBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  undoBtn: document.getElementById('undoBtn'),
  bulkFetchBtn: document.getElementById('bulkFetchBtn'),
  search: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  sortSelect: document.getElementById('sortSelect'),
  listView: document.getElementById('listView'),
  boardView: document.getElementById('boardView'),
  empty: document.getElementById('emptyState'),
  listViewBtn: document.getElementById('listViewBtn'),
  boardViewBtn: document.getElementById('boardViewBtn'),
  summaryText: document.getElementById('summaryText'),
  progressBar: document.getElementById('progressBar'),
  ringFg: document.getElementById('ringFg'),
  ringPct: document.getElementById('ringPct'),
  statTotal: document.getElementById('statTotal'),
  statDone: document.getElementById('statDone'),
  statProgress: document.getElementById('statProgress'),
  statBlocked: document.getElementById('statBlocked'),
  countLabel: document.getElementById('countLabel'),
  dialog: document.getElementById('repoDialog'),
  form: document.getElementById('repoForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  closeDialog: document.getElementById('closeDialog'),
  cancelBtn: document.getElementById('cancelBtn'),
  formError: document.getElementById('formError'),
  toast: document.getElementById('toast'),
  fName: document.getElementById('fName'),
  fInitial: document.getElementById('fInitial'),
  fTarget: document.getElementById('fTarget'),
  fLink: document.getElementById('fLink'),
  fDue: document.getElementById('fDue'),
  fNotes: document.getElementById('fNotes'),
  fTags: document.getElementById('fTags'),
  previewInitial: document.getElementById('previewInitial'),
  previewTarget: document.getElementById('previewTarget'),
  validInitial: document.getElementById('validInitial'),
  validTarget: document.getElementById('validTarget'),
  tagBar: document.getElementById('tagBar'),
  statusBar: document.getElementById('statusBar'),
  dateLine: document.getElementById('dateLine'),
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
};

let moves = load();
let viewMode = localStorage.getItem('repoMover:view2') || 'list';
let editingId = null;
let draggedId = null;
let activeTag = null;
let activeStatus = null;

// ---------- history (undo) ----------
const HISTORY_LIMIT = 30;
let historyStack = [];
function pushHistory(){
  try{ historyStack.push(JSON.stringify(moves)); if(historyStack.length>HISTORY_LIMIT) historyStack.shift(); }catch{}
  updateUndoBtn();
}
function updateUndoBtn(){
  if(!els.undoBtn) return;
  els.undoBtn.classList.toggle('hidden', historyStack.length===0);
}
function undo(){
  if(!historyStack.length) return;
  const prev = historyStack.pop();
  try{
    moves = JSON.parse(prev).map(migrate);
    save(); render(); updateUndoBtn();
    toast('Undone ↩');
  }catch{ toast('Undo failed'); }
}
if(els.undoBtn) els.undoBtn.addEventListener('click', undo);
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && !els.dialog.open){
    e.preventDefault(); undo();
  }
});

// ---------- theme ----------
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
els.themeToggle.addEventListener('click', toggleTheme);

// ---------- utils ----------
function uid(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function labelForStatus(s){ return {planned:'Planned', in_progress:'In progress', done:'Done', blocked:'Blocked'}[s] || s; }
function hostFromUrl(url){
  try{ return new URL(url).hostname.replace(/^www\./,''); }catch{ return url.slice(0,28); }
}
function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> els.toast.classList.add('hidden'), 2400);
}

// ---------- repo parsing (account/repo) ----------
function parseRepo(input){
  const raw = String(input||'').trim();
  if(!raw) return null;
  let s = raw;
  try{
    if(s.includes('://')){
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      if(parts.length >= 2){
        const owner = parts[0];
        const repo = parts[1].replace(/\.git$/,'');
        if(isValidOwner(owner) && isValidRepo(repo)) return { owner, repo, slug:`${owner}/${repo}`, url:`https://github.com/${owner}/${repo}` };
      }
    }
  }catch{}
  if(s.includes('github.com/')){
    const idx = s.indexOf('github.com/');
    s = s.slice(idx + 'github.com/'.length);
  }
  s = s.replace(/^\/+/, '').replace(/\.git\/?$/, '').trim();
  const parts = s.split('/').filter(Boolean);
  if(parts.length === 2 && isValidOwner(parts[0]) && isValidRepo(parts[1])){
    return { owner: parts[0], repo: parts[1], slug:`${parts[0]}/${parts[1]}`, url:`https://github.com/${parts[0]}/${parts[1]}` };
  }
  if(parts.length > 2 && isValidOwner(parts[0]) && isValidRepo(parts[1])){
    return { owner: parts[0], repo: parts[1], slug:`${parts[0]}/${parts[1]}`, url:`https://github.com/${parts[0]}/${parts[1]}` };
  }
  return null;
}
function isValidOwner(s){ return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(s); }
function isValidRepo(s){ return /^[a-zA-Z0-9._-]{1,100}$/.test(s); }
function repoLinkHtml(slug, cls=''){
  const p = parseRepo(slug);
  if(!p) return `<span class="repo-pill ${cls}" title="${escapeAttr(slug)}"><span class="gh">⎇</span> ${escapeHtml(slug)}</span>`;
  return `<a class="repo-pill ${cls}" href="${escapeAttr(p.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(p.url)}" onclick="event.stopPropagation()"><span class="gh">⬢</span> ${escapeHtml(p.slug)}</a>`;
}
function updatePreview(inputEl, previewEl){
  const p = parseRepo(inputEl.value);
  if(p){
    previewEl.href = p.url;
    previewEl.textContent = p.url;
    previewEl.classList.remove('hidden');
  } else {
    previewEl.classList.add('hidden');
    previewEl.removeAttribute('href');
    previewEl.textContent='';
  }
}

// ---------- live GH validation ----------
const validCache = new Map(); // slug -> {state, private, stars}
let validTimers = new Map();
function setBadge(el, state, detail=''){
  if(!el) return;
  el.className='valid-badge '+state;
  if(state==='checking') el.textContent='… checking';
  else if(state==='ok') el.textContent = detail ? `✓ ${detail}` : '✓ exists';
  else if(state==='notfound') el.textContent='✗ not found';
  else if(state==='error') el.textContent = detail ? `⚠ ${detail}` : '⚠ error';
  else if(state==='rate') el.textContent='⚠ rate-limited';
  else el.textContent='';
}
function validateRepoLive(slug, badgeEl){
  if(!badgeEl) return;
  if(!slug || !parseRepo(slug)){
    setBadge(badgeEl,'',''); return;
  }
  const p = parseRepo(slug);
  const key = p.slug;
  if(validCache.has(key)){
    const c = validCache.get(key);
    if(c.state==='ok') setBadge(badgeEl,'ok', c.private?'private':'public');
    else if(c.state==='notfound') setBadge(badgeEl,'notfound');
    else setBadge(badgeEl,c.state, c.detail||'');
    return;
  }
  setBadge(badgeEl,'checking');
  // debounce per badge
  clearTimeout(validTimers.get(badgeEl));
  const t = setTimeout(async ()=>{
    try{
      const res = await fetch(`https://api.github.com/repos/${key}`, { headers:{'Accept':'application/vnd.github.v3+json'} });
      if(res.status===200){
        const j = await res.json();
        validCache.set(key,{state:'ok', private: j.private, stars: j.stargazers_count});
        setBadge(badgeEl,'ok', j.private?'private · ★'+j.stargazers_count : 'public · ★'+j.stargazers_count);
      } else if(res.status===404){
        validCache.set(key,{state:'notfound'});
        setBadge(badgeEl,'notfound');
      } else if(res.status===403){
        const remaining = res.headers.get('x-ratelimit-remaining');
        if(remaining==='0'){ validCache.set(key,{state:'rate'}); setBadge(badgeEl,'rate'); }
        else { setBadge(badgeEl,'error', res.status+' '+res.statusText); }
      } else {
        setBadge(badgeEl,'error', res.status+'');
      }
    }catch(e){
      setBadge(badgeEl,'error', e.message.slice(0,22));
    }
  }, 520);
  validTimers.set(badgeEl, t);
}
function wireValidation(){
  els.fInitial.addEventListener('input', ()=>{
    updatePreview(els.fInitial, els.previewInitial);
    const p=parseRepo(els.fInitial.value);
    validateRepoLive(p? p.slug : '', els.validInitial);
  });
  els.fTarget.addEventListener('input', ()=>{
    updatePreview(els.fTarget, els.previewTarget);
    // target is destination — 404 is expected for new location, so show hint
    const p=parseRepo(els.fTarget.value);
    if(!p){ setBadge(els.validTarget,'',''); return; }
    // we still check but badge wording differs
    validateRepoLive(p.slug, els.validTarget);
    // after fetch, if ok we warn "already exists", if 404 we show "available"
    const orig = els.validTarget.textContent;
    // override label after cache resolves: wrap after a tick
    setTimeout(()=>{
      if(els.validTarget.textContent.includes('not found')){ els.validTarget.textContent='○ available (not yet created)'; els.validTarget.className='valid-badge available'; }
      else if(els.validTarget.textContent.includes('exists')){ els.validTarget.textContent=els.validTarget.textContent.replace('exists','already exists'); }
    }, 900);
  });
}
wireValidation();

// ---------- storage ----------
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ const p = JSON.parse(raw); if(Array.isArray(p)) return p.map(migrate); }
  }catch(e){ console.warn(e); }
  return [];
}
function migrate(m){
  const n = { ...m };
  if(n.initialPlace) n.initialPlace = normalizeSlug(n.initialPlace);
  if(n.targetPlace) n.targetPlace = normalizeSlug(n.targetPlace);
  n.updatedAt = n.updatedAt || Date.now();
  n.tags = normalizeTags(n.tags);
  return n;
}
function normalizeSlug(s){
  const p = parseRepo(s);
  return p ? p.slug : String(s||'').trim();
}
function todayISO(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(moves)); return true; }
  catch(e){ console.error(e); toast(e.name === 'QuotaExceededError' ? 'Storage full' : 'Save failed'); return false; }
}
function persistAndRender(){ save(); render(); }

// ---------- data helpers ----------
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  const date = new Date(y, m-1, d);
  return date.toLocaleDateString(undefined, {month:'short', day:'numeric', year: date.getFullYear()!==new Date().getFullYear() ? 'numeric' : undefined});
}
function dueHtml(m){
  if(!m.due) return '';
  const label = fmtDate(m.due);
  const overdue = m.due < todayISO() && m.status !== 'done';
  return `<span class="due ${overdue?'overdue':'soon'}">${overdue?'⚠ ':''}${label}</span>`;
}

// ---------- tags ----------
const TAG_COLORS = ['#7c6cff','#22c55e','#38bdf8','#fb923c','#ff4d6a','#f59e0b','#8b5cf6','#14b8a6','#ef4444','#64748b'];
function tagColor(tag){
  let h=0; for(const c of tag){ h=(h*31+c.charCodeAt(0))>>>0; }
  return TAG_COLORS[h % TAG_COLORS.length];
}
function normalizeTags(list){
  const raw = Array.isArray(list) ? list : [];
  return [...new Set(raw.map(t=>String(t).trim().toLowerCase()).filter(Boolean))];
}
function allTags(){
  const set = new Set();
  for(const m of moves){ for(const t of (m.tags||[])) set.add(t); }
  return [...set].sort();
}
function tagChipsHtml(tags){
  return (tags||[]).map(t=> `<span class="tag" style="--tag:${tagColor(t)}" data-tag="${escapeAttr(t)}">#${escapeHtml(t)}</span>`).join('');
}
function tagFilterBarHtml(){
  const tags = allTags();
  if(!tags.length) return '';
  return tags.map(t=>`<button class="tag-filter-chip${activeTag===t?' active':''}" data-tagfilter="${escapeAttr(t)}">#${escapeHtml(t)}</button>`).join('');
}
function statusFilterBarHtml(){
  const statuses = ['planned','in_progress','blocked','done'];
  return statuses.map(s=>`<button class="status-chip${activeStatus===s?' active':''}" data-statusfilter="${s}">${labelForStatus(s)}</button>`).join('') + (activeStatus ? ` <button class="status-chip" data-statusfilter="__clear">✕ clear</button>` : '');
}

// ---------- filtering + sorting ----------
function filtered(){
  const q = els.search.value.trim().toLowerCase();
  const sort = els.sortSelect.value;
  let arr = moves.filter(m=>{
    if(activeTag && !(m.tags||[]).includes(activeTag)) return false;
    if(activeStatus && m.status !== activeStatus) return false;
    if(!q) return true;
    return [m.name, m.initialPlace, m.targetPlace, m.githubUrl, m.notes, (m.tags||[]).join(' ')]
      .join(' ').toLowerCase().includes(q);
  });
  arr = [...arr].sort((a,b)=>{
    if(sort==='name') return a.name.localeCompare(b.name);
    if(sort==='due'){
      if(!a.due && !b.due) return 0;
      if(!a.due) return 1;
      if(!b.due) return -1;
      return a.due.localeCompare(b.due);
    }
    if(sort==='status'){
      const o={planned:0,in_progress:1,blocked:2,done:3};
      return (o[a.status]??9)-(o[b.status]??9);
    }
    return (b.updatedAt||0)-(a.updatedAt||0);
  });
  return arr;
}

// ---------- transfer command helper ----------
function transferCmd(m){
  const init = parseRepo(m.initialPlace);
  const targ = parseRepo(m.targetPlace);
  if(!init || !targ) return '';
  return `gh repo transfer ${init.slug} ${targ.owner} --confirm  # or: gh api repos/${init.slug}/transfer -f new_owner=${targ.owner}`;
}

// ---------- list view ----------
function listItemHtml(m){
  const done = m.status === 'done';
  const checked = done ? 'checked' : '';
  const strikethrough = done ? ' style="text-decoration:line-through;opacity:.6"' : '';
  const extra = m.githubUrl ? `<a class="item-link" href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(m.githubUrl)}" onclick="event.stopPropagation()">↗</a>` : '';
  const cmd = transferCmd(m);
  return `
    <div class="todo-item${done?' done':''}" data-id="${m.id}" data-status="${m.status}" draggable="true" role="button" tabindex="0" aria-label="Edit ${escapeAttr(m.name)}">
      <label class="checkbox" onclick="event.stopPropagation()">
        <input type="checkbox" data-action="toggle" data-id="${m.id}" ${checked} />
        <span class="checkmark"></span>
      </label>
      <div class="repo-icon" aria-hidden="true">⬢</div>
      <div class="todo-body">
        <div class="todo-title"${strikethrough}>
          <span>${escapeHtml(m.name)}</span>
          <span class="status-badge ${m.status}">${labelForStatus(m.status)}</span>
          ${dueHtml(m)}
        </div>
        <div class="todo-route">
          ${repoLinkHtml(m.initialPlace,'')}
          <span class="arrow">→</span>
          ${repoLinkHtml(m.targetPlace,'target')}
          ${m.status==='blocked'? `<span class="status-badge blocked">blocked</span>`:''}
          <button class="copy-cmd" data-action="copycmd" data-id="${m.id}" title="Copy transfer command: ${escapeAttr(cmd)}" onclick="event.stopPropagation()">⎘</button>
        </div>
        <div class="todo-tags">${tagChipsHtml(m.tags)}</div>
        ${m.notes? `<div class="todo-notes">${escapeHtml(m.notes)}</div>`:''}
      </div>
      <div class="item-actions">
        ${extra}
        <button class="del-btn" data-action="delete" data-id="${m.id}" title="Delete" onclick="event.stopPropagation()">✕</button>
      </div>
    </div>
  `;
}
function renderList(){
  const items = filtered();
  els.listView.innerHTML = items.map(listItemHtml).join('');
}

// ---------- board view ----------
function renderBoard(){
  const items = filtered();
  if(!items.length){ els.boardView.innerHTML=''; return; }
  const groups = new Map();
  for(const it of items){ if(!groups.has(it.status)) groups.set(it.status, []); groups.get(it.status).push(it); }
  const order = ['planned','in_progress','blocked','done'];
  const dotColor = {planned:'var(--planned)',in_progress:'var(--in_progress)',blocked:'var(--blocked)',done:'var(--done)'};
  els.boardView.innerHTML = order.map(s=>{
    const list = groups.get(s) || [];
    return `
      <div class="board-col" data-group="${s}">
        <div class="col-head">
          <span class="dot" style="background:${dotColor[s]}"></span>
          <h3>${labelForStatus(s)}</h3>
          <span class="count">${list.length}</span>
        </div>
        <div class="col-body" data-group="${s}">
          ${list.map(m=> `
            <div class="card" draggable="true" data-id="${m.id}" role="button" tabindex="0" aria-label="Edit ${escapeAttr(m.name)}">
              <div class="card-title">${escapeHtml(m.name)} <span class="status-badge ${m.status}" style="font-size:9px;vertical-align:middle;margin-left:4px">${labelForStatus(m.status)}</span></div>
              <div class="card-route">${repoLinkHtml(m.initialPlace,'')} <span class="arrow">→</span> ${repoLinkHtml(m.targetPlace,'target')}</div>
              ${dueHtml(m)}
              <div class="todo-tags">${tagChipsHtml(m.tags)}</div>
              ${m.notes? `<div class="card-note">${escapeHtml(m.notes)}</div>`:''}
              ${m.githubUrl? `<a class="card-link" href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">↗ ${escapeHtml(hostFromUrl(m.githubUrl))}</a>`:''}
              <div class="card-actions">
                <button data-action="copycmd" data-id="${m.id}" onclick="event.stopPropagation()">⎘ cmd</button>
                <button data-action="edit" data-id="${m.id}" onclick="event.stopPropagation()">Edit</button>
                <button data-action="delete" data-id="${m.id}" onclick="event.stopPropagation()">Delete</button>
              </div>
            </div>
          `).join('') || '<div class="col-empty">No items</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// ---------- render ----------
function render(){
  const items = filtered();
  const total = moves.length;
  const done = moves.filter(m=>m.status==='done').length;
  const inProg = moves.filter(m=>m.status==='in_progress').length;
  const blocked = moves.filter(m=>m.status==='blocked').length;
  const shown = items.length;
  const pct = total ? Math.round(done/total*100) : 0;

  els.summaryText.textContent = `${done}/${total} done${shown!==total?` · ${shown} shown`:''} · drag cards to change status`;
  els.progressBar.style.width = pct + '%';
  const circumference = 2 * Math.PI * 16;
  const offset = circumference * (1 - pct/100);
  if(els.ringFg){ els.ringFg.style.strokeDasharray = String(circumference); els.ringFg.style.strokeDashoffset = String(offset); }
  if(els.ringPct) els.ringPct.textContent = pct + '%';
  if(els.statTotal) els.statTotal.textContent = total;
  if(els.statDone) els.statDone.textContent = done;
  if(els.statProgress) els.statProgress.textContent = inProg;
  if(els.statBlocked) els.statBlocked.textContent = blocked;
  if(els.countLabel) els.countLabel.textContent = `${total} repos`;

  els.tagBar.innerHTML = tagFilterBarHtml();
  els.statusBar.innerHTML = statusFilterBarHtml();
  els.clearSearch.classList.toggle('hidden', !els.search.value);

  const isEmpty = moves.length===0;
  const filteredEmpty = !isEmpty && items.length===0;
  els.empty.classList.toggle('hidden', !isEmpty && !filteredEmpty);
  if(isEmpty){ els.empty.querySelector('h3').textContent='Nothing here yet'; els.empty.querySelector('p').innerHTML='Add your first move — link <code>old-account/repo</code> → <code>new-account/repo</code>.'; els.emptyAddBtn.style.display=''; }
  else if(filteredEmpty){ els.empty.querySelector('h3').textContent='No matches'; els.empty.querySelector('p').textContent='Try a different search or clear filters.'; els.emptyAddBtn.style.display='none'; }
  else els.emptyAddBtn.style.display='none';

  const isList = viewMode==='list';
  els.listView.classList.toggle('hidden', !isList);
  els.boardView.classList.toggle('hidden', isList);
  els.listViewBtn.classList.toggle('active', isList);
  els.boardViewBtn.classList.toggle('active', !isList);
  els.listViewBtn.setAttribute('aria-selected', String(isList));
  els.boardViewBtn.setAttribute('aria-selected', String(!isList));

  if(isList) renderList(); else renderBoard();
  updateUndoBtn();
}

// ---------- drag (board) ----------
els.boardView.addEventListener('dragstart', e=>{
  const card = e.target.closest('.card'); if(!card) return;
  if(e.target.closest('button, a')) { e.preventDefault(); return; }
  draggedId = card.dataset.id; card.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
});
els.boardView.addEventListener('dragend', ()=>{
  document.querySelectorAll('.col-body.drag-over').forEach(el=>el.classList.remove('drag-over'));
  draggedId=null;
});
els.boardView.addEventListener('dragover', e=>{ const col=e.target.closest('.col-body'); if(!col) return; e.preventDefault(); col.classList.add('drag-over'); });
els.boardView.addEventListener('dragleave', e=>{ const col=e.target.closest('.col-body'); if(!col) return; if(!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
els.boardView.addEventListener('drop', e=>{
  const col=e.target.closest('.col-body'); if(!col || !draggedId) return;
  e.preventDefault(); col.classList.remove('drag-over');
  const st=col.dataset.group;
  const item=moves.find(m=>m.id===draggedId); if(!item) return;
  if(item.status!==st){ pushHistory(); item.status=st; item.updatedAt=Date.now(); persistAndRender(); toast(`"${item.name}" → ${labelForStatus(st)}`); }
});

// ---------- actions ----------
document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  const {action, id}=btn.dataset;
  if(action==='toggle'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    pushHistory();
    m.status = m.status==='done' ? 'planned' : 'done';
    m.updatedAt=Date.now();
    persistAndRender(); toast(m.status==='done'?'Done ✓':'Back to planned');
  }
  else if(action==='edit') openDialog('edit', id);
  else if(action==='copycmd'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    const cmd=transferCmd(m);
    navigator.clipboard.writeText(cmd).then(()=> toast('Copied: '+cmd.slice(0,48)+'…')).catch(()=> toast(cmd));
  }
  else if(action==='delete'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    if(confirm(`Delete "${m.name}"?`)){
      pushHistory();
      moves = moves.filter(x=>x.id!==id);
      persistAndRender(); toast('Deleted — ↩ Undo to restore');
    }
  }
});

document.addEventListener('click', e=>{
  if(e.target.closest('button, a, input, label, .tag, .repo-pill, .copy-cmd')) return;
  const el=e.target.closest('[data-id]'); if(!el) return;
  const m=moves.find(x=>x.id===el.dataset.id);
  if(m && el.dataset.action===undefined) openDialog('edit', m.id);
});
document.addEventListener('keydown', e=>{
  if(e.target.closest('input, textarea, select')) return;
  if(e.key==='Enter' && e.target.closest('[data-id]')){
    const el=e.target.closest('[data-id]');
    openDialog('edit', el.dataset.id);
  }
});

// tag/status filtering
document.addEventListener('click', e=>{
  const filterBtn = e.target.closest('[data-tagfilter]');
  if(filterBtn){
    const t = filterBtn.dataset.tagfilter;
    activeTag = activeTag === t ? null : t;
    render(); return;
  }
  const sBtn = e.target.closest('[data-statusfilter]');
  if(sBtn){
    const v = sBtn.dataset.statusfilter;
    if(v==='__clear') activeStatus=null; else activeStatus = activeStatus===v ? null : v;
    render(); return;
  }
  const chip = e.target.closest('.tag[data-tag]');
  if(chip){
    const t = chip.dataset.tag;
    activeTag = activeTag === t ? null : t;
    if(activeTag) els.search.value = '';
    render();
  }
});

// ---------- dialog ----------
function openDialog(mode, id){
  editingId = id || null;
  els.formError.classList.add('hidden');
  els.formError.textContent='';
  if(mode==='edit' && id){
    const m=moves.find(x=>x.id===id); if(!m) return;
    els.dialogTitle.textContent = 'Edit repo move';
    els.fName.value=m.name; els.fInitial.value=m.initialPlace; els.fTarget.value=m.targetPlace; els.fLink.value=m.githubUrl||'';
    els.fDue.value=m.due||''; els.fNotes.value=m.notes||''; els.fTags.value=(m.tags||[]).join(', ');
    const radio=els.form.querySelector(`input[name="fStatus"][value="${m.status}"]`); if(radio) radio.checked=true;
  } else {
    els.dialogTitle.textContent = 'Add repo move';
    els.form.reset();
    const r=els.form.querySelector('input[name="fStatus"][value="planned"]'); if(r) r.checked=true;
  }
  updatePreview(els.fInitial, els.previewInitial);
  updatePreview(els.fTarget, els.previewTarget);
  const pi=parseRepo(els.fInitial.value); const pt=parseRepo(els.fTarget.value);
  if(pi) validateRepoLive(pi.slug, els.validInitial); else setBadge(els.validInitial,'','');
  if(pt) validateRepoLive(pt.slug, els.validTarget); else setBadge(els.validTarget,'','');
  if(!els.dialog.open) els.dialog.showModal();
  setTimeout(()=> els.fName.focus(), 50);
}
function closeDialog(){ if(els.dialog.open) els.dialog.close(); editingId=null; }

els.addBtn.addEventListener('click', ()=>openDialog('add'));
els.emptyAddBtn.addEventListener('click', ()=>openDialog('add'));
els.closeDialog.addEventListener('click', closeDialog);
els.cancelBtn.addEventListener('click', closeDialog);
els.dialog.addEventListener('click', e=>{
  const r=els.dialog.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeDialog();
});
els.dialog.addEventListener('cancel', e=>{ e.preventDefault(); closeDialog(); });
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && els.dialog.open){ e.preventDefault(); closeDialog(); }
  if(!els.dialog.open && e.key.toLowerCase()==='n' && !e.ctrlKey && !e.metaKey &&
     document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA' && document.activeElement.tagName!=='SELECT'){ e.preventDefault(); openDialog('add'); }
});

function showError(msg){
  els.formError.textContent = msg;
  els.formError.classList.remove('hidden');
}
els.form.addEventListener('submit', e=>{
  e.preventDefault();
  const name=els.fName.value.trim();
  const initialRaw=els.fInitial.value.trim();
  const targetRaw=els.fTarget.value.trim();
  const link=els.fLink.value.trim();
  const due=els.fDue.value;
  const notes=els.fNotes.value.trim();
  const tags=normalizeTags(els.fTags.value.split(','));
  if(!name || !initialRaw || !targetRaw){ showError('Fill required fields: name, initial repo, target repo.'); toast('Fill required fields'); return; }
  const initialParsed = parseRepo(initialRaw);
  const targetParsed = parseRepo(targetRaw);
  if(!initialParsed){ showError('Initial repo must be account/repo — e.g. old-org/my-repo or https://github.com/old-org/my-repo'); return; }
  if(!targetParsed){ showError('Target repo must be account/repo — e.g. new-org/my-repo or https://github.com/new-org/my-repo'); return; }
  if(link){ try{ new URL(link); }catch{ showError('Extra link must be a valid URL (https://…)'); return; } }
  const status = (els.form.querySelector('input[name="fStatus"]:checked')||{}).value || 'planned';
  const data={ name, initialPlace:initialParsed.slug, targetPlace:targetParsed.slug, githubUrl:link, status, due, notes, tags, updatedAt: Date.now() };
  pushHistory();
  if(editingId){
    const idx=moves.findIndex(m=>m.id===editingId);
    if(idx!==-1) moves[idx]={...moves[idx], ...data};
    toast('Saved ✓');
  } else {
    moves.push({ id:uid(), ...data });
    toast('Added ✓');
  }
  closeDialog(); persistAndRender();
});

// ---------- inputs ----------
els.search.addEventListener('input', ()=>{ render(); });
els.clearSearch.addEventListener('click', ()=>{ els.search.value=''; render(); els.search.focus(); });
els.sortSelect.addEventListener('change', render);
els.listViewBtn.addEventListener('click', ()=>{ viewMode='list'; localStorage.setItem('repoMover:view2','list'); render(); });
els.boardViewBtn.addEventListener('click', ()=>{ viewMode='board'; localStorage.setItem('repoMover:view2','board'); render(); });

// ---------- bulk fetch org ----------
if(els.bulkFetchBtn) els.bulkFetchBtn.addEventListener('click', bulkFetch);
async function bulkFetch(){
  const source = prompt('Source GitHub account/org to fetch repos from (e.g. old-org):');
  if(!source || !source.trim()) return;
  const src = source.trim();
  if(!isValidOwner(src)){ toast('Invalid account name'); return; }
  const target = prompt(`Target account/org to move TO (e.g. new-org):`, src);
  if(target===null) return;
  const tgt = (target||'').trim();
  if(tgt && !isValidOwner(tgt)){ toast('Invalid target account'); return; }
  const btn = els.bulkFetchBtn; if(btn) btn.textContent='… fetching';
  try{
    // try orgs then users
    let repos = [];
    let page=1;
    let hadData=true;
    while(hadData && page<=3 && repos.length<250){
      let res = await fetch(`https://api.github.com/orgs/${src}/repos?per_page=100&page=${page}&sort=updated`);
      if(res.status===404){
        res = await fetch(`https://api.github.com/users/${src}/repos?per_page=100&page=${page}&sort=updated`);
      }
      if(!res.ok){
        if(res.status===403) throw new Error('Rate-limited (60/h anonymous). Try again later or add token.');
        throw new Error(`Fetch failed ${res.status}`);
      }
      const batch = await res.json();
      if(!Array.isArray(batch) || batch.length===0) hadData=false;
      else { repos.push(...batch); page++; if(batch.length<100) hadData=false; }
      if(repos.length>=30) hadData=false; // cap 30 for UX
    }
    if(!repos.length){ toast('No repos found for '+src); return; }
    const existingSlugs = new Set(moves.map(m=> m.initialPlace));
    const toCreate = repos.filter(r=> !existingSlugs.has(`${src}/${r.name}`)).slice(0,30);
    if(!toCreate.length){ toast('All repos already in list'); return; }
    const names = toCreate.map(r=> r.name).join(', ').slice(0,120);
    if(!confirm(`Found ${repos.length} repos. Import ${toCreate.length} not yet in list?\n\n${names}${toCreate.length>5?' …':''}\n\nTarget will be: ${tgt||'— same name, choose target per item —'} \nCreates as "planned" status.`)) return;
    pushHistory();
    for(const r of toCreate){
      const tgtSlug = tgt ? `${tgt}/${r.name}` : `${src}/${r.name}`;
      moves.push({
        id: uid(),
        name: r.name,
        initialPlace: `${src}/${r.name}`,
        targetPlace: tgtSlug,
        githubUrl: r.html_url,
        status: 'planned',
        due: '',
        notes: r.description ? r.description.slice(0,200) : '',
        tags: r.language ? [r.language.toLowerCase()] : [],
        updatedAt: Date.now()
      });
    }
    persistAndRender();
    toast(`Imported ${toCreate.length} repos from ${src}`);
  }catch(e){
    toast('Fetch failed: '+e.message);
  }finally{
    if(btn) btn.textContent='⇄ Fetch org';
  }
}

// ---------- import / export ----------
els.exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(moves,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`repomove-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported JSON');
});
els.importFile.addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    const text=await f.text();
    const data=JSON.parse(text);
    if(!Array.isArray(data)) throw new Error('Expected array');
    const imported = data.map(x=> ({
      id: x.id || uid(),
      name: String(x.name||'').trim() || 'untitled',
      initialPlace: normalizeSlug(x.initialPlace||x.initial||''),
      targetPlace: normalizeSlug(x.targetPlace||x.target||''),
      githubUrl: String(x.githubUrl||x.link||'').trim(),
      status: ['planned','in_progress','done','blocked'].includes(x.status) ? x.status : 'planned',
      due: String(x.due||''),
      notes: String(x.notes||''),
      tags: normalizeTags(x.tags),
      updatedAt: Date.now(),
    })).filter(x=> x.initialPlace && x.targetPlace);
    if(!imported.length) throw new Error('No valid moves found (need initial & target as account/repo)');
    if(confirm(`Import ${imported.length} moves? This will append to current list.`)){
      pushHistory();
      moves.push(...imported);
      persistAndRender(); toast(`Imported ${imported.length}`);
    }
  }catch(err){ toast('Import failed: '+err.message); }
  e.target.value='';
});

// ---------- PWA ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

// ---------- init ----------
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
els.dateLine.textContent = new Date().toLocaleDateString(undefined, {weekday:'short', month:'long', day:'numeric'});
render();
