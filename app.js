const STORAGE_KEY = 'repoMover:moves-v2';
const THEME_KEY = 'repoMover:theme';

const els = {
  themeToggle: document.getElementById('themeToggle'),
  addBtn: document.getElementById('addBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  search: document.getElementById('searchInput'),
  listView: document.getElementById('listView'),
  boardView: document.getElementById('boardView'),
  empty: document.getElementById('emptyState'),
  listViewBtn: document.getElementById('listViewBtn'),
  boardViewBtn: document.getElementById('boardViewBtn'),
  summaryText: document.getElementById('summaryText'),
  progressBar: document.getElementById('progressBar'),
  dialog: document.getElementById('repoDialog'),
  form: document.getElementById('repoForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  closeDialog: document.getElementById('closeDialog'),
  cancelBtn: document.getElementById('cancelBtn'),
  toast: document.getElementById('toast'),
  fName: document.getElementById('fName'),
  fInitial: document.getElementById('fInitial'),
  fTarget: document.getElementById('fTarget'),
  fLink: document.getElementById('fLink'),
  fDue: document.getElementById('fDue'),
  fNotes: document.getElementById('fNotes'),
  dateLine: document.getElementById('dateLine'),
};

let moves = load();
let viewMode = localStorage.getItem('repoMover:view2') || 'list';
let editingId = null;
let draggedId = null;

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
  toast._t = setTimeout(()=> els.toast.classList.add('hidden'), 2200);
}

// ---------- storage ----------
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ const p = JSON.parse(raw); if(Array.isArray(p) && p.length) return p; }
  }catch(e){ console.warn(e); }
  return [
    { id:uid(), name:'payment-service', initialPlace:'github.com/old-org', targetPlace:'github.com/new-org/platform', githubUrl:'https://github.com/old-org/payment-service', status:'planned', due:todayISO(), notes:'Owner: platform team. Re-routes in gateway.' },
    { id:uid(), name:'web-dashboard', initialPlace:'github.com/old-org', targetPlace:'Archived', githubUrl:'https://github.com/old-org/web-dashboard', status:'in_progress', due:'', notes:'' },
    { id:uid(), name:'auth-lib', initialPlace:'github.com/old-org/libs', targetPlace:'github.com/new-org/shared', githubUrl:'https://github.com/old-org/auth-lib', status:'done', due:'', notes:'Blocked on token rotation.' },
  ];
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

// ---------- data ----------
function filtered(){
  const q = els.search.value.trim().toLowerCase();
  if(!q) return moves;
  return moves.filter(m => [m.name, m.initialPlace, m.targetPlace, m.githubUrl, m.notes].join(' ').toLowerCase().includes(q));
}
const STATUS_ORDER = { planned:0, in_progress:1, blocked:2, done:3 };

// ---------- due date helpers ----------
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  const date = new Date(y, m-1, d);
  return date.toLocaleDateString(undefined, {month:'short', day:'numeric', year: date.getFullYear()!==new Date().getFullYear() ? 'numeric' : undefined});
}
function dueClass(iso){
  if(!iso) return '';
  return iso < todayISO() ? 'overdue' : 'soon';
}
function dueHtml(m){
  if(!m.due) return '';
  const label = fmtDate(m.due);
  const overdue = m.due < todayISO() && m.status !== 'done';
  return `<span class="due ${overdue?'overdue':'soon'}">${overdue?'⚠ ':''}${label}</span>`;
}

// ---------- list view (to-do) ----------
function listItemHtml(m){
  const done = m.status === 'done';
  const checked = done ? 'checked' : '';
  const strikethrough = done ? ' style="text-decoration:line-through;opacity:.6"' : '';
  const link = m.githubUrl
    ? `<a class="item-link" href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">↗</a>`
    : '';
  return `
    <div class="todo-item${done?' done':''}" data-id="${m.id}" draggable="true" role="button" tabindex="0" aria-label="Edit ${escapeAttr(m.name)}">
      <label class="checkbox" onclick="event.stopPropagation()">
        <input type="checkbox" data-action="toggle" data-id="${m.id}" ${checked} />
        <span class="checkmark"></span>
      </label>
      <div class="todo-body">
        <div class="todo-title"${strikethrough}>${escapeHtml(m.name)}</div>
        <div class="todo-route">
          <span class="place">${escapeHtml(m.initialPlace)}</span>
          <span class="arrow">→</span>
          <span class="place target">${escapeHtml(m.targetPlace)}</span>
          ${dueHtml(m)}
          ${m.status==='blocked'? `<span class="blocked-tag">blocked</span>`:''}
        </div>
        ${m.notes? `<div class="todo-notes">${escapeHtml(m.notes)}</div>`:''}
      </div>
      ${link}
      <button class="del-btn" data-action="delete" data-id="${m.id}" title="Delete" onclick="event.stopPropagation()">✕</button>
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
  els.boardView.innerHTML = order.map(s=>{
    const list = groups.get(s) || [];
    return `
      <div class="board-col" data-group="${s}">
        <div class="col-head">
          <span class="dot" style="background:var(--${s})"></span>
          <h3>${labelForStatus(s)}</h3>
          <span class="count">${list.length}</span>
        </div>
        <div class="col-body" data-group="${s}">
          ${list.map(m=> `
            <div class="card" draggable="true" data-id="${m.id}" role="button" tabindex="0" aria-label="Edit ${escapeAttr(m.name)}">
              <div class="card-title">${escapeHtml(m.name)}</div>
              <div class="card-route mono">${escapeHtml(m.initialPlace)} → ${escapeHtml(m.targetPlace)}</div>
              ${dueHtml(m)}
              ${m.notes? `<div class="card-note">${escapeHtml(m.notes)}</div>`:''}
              ${m.githubUrl? `<a class="card-link" href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">↗ ${escapeHtml(hostFromUrl(m.githubUrl))}</a>`:''}
              <div class="card-actions">
                <button data-action="edit" data-id="${m.id}" onclick="event.stopPropagation()">Edit</button>
                <button data-action="delete" data-id="${m.id}" onclick="event.stopPropagation()">Delete</button>
              </div>
            </div>
          `).join('') || '<div class="col-empty">—</div>'}
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
  const shown = items.length;
  const pct = total ? Math.round(done/total*100) : 0;

  els.summaryText.textContent = `${done}/${total} done${shown!==total?` · ${shown} shown`:''}`;
  els.progressBar.style.width = pct + '%';

  const isEmpty = moves.length===0;
  const filteredEmpty = !isEmpty && items.length===0;
  els.empty.classList.toggle('hidden', !isEmpty && !filteredEmpty);
  if(isEmpty){ els.empty.querySelector('h3').textContent='Nothing here yet'; els.empty.querySelector('p').textContent='Add a repo to your move checklist.'; els.emptyAddBtn.style.display=''; }
  else if(filteredEmpty){ els.empty.querySelector('h3').textContent='No matches'; els.empty.querySelector('p').textContent='Try a different search.'; els.emptyAddBtn.style.display='none'; }
  else els.emptyAddBtn.style.display='';

  const isList = viewMode==='list';
  els.listView.classList.toggle('hidden', !isList);
  els.boardView.classList.toggle('hidden', isList);
  els.listViewBtn.classList.toggle('active', isList);
  els.boardViewBtn.classList.toggle('active', !isList);
  els.listViewBtn.setAttribute('aria-selected', String(isList));
  els.boardViewBtn.setAttribute('aria-selected', String(!isList));

  if(isList) renderList(); else renderBoard();
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
  if(STATUS_ORDER[item.status]!==undefined && item.status!==st){ item.status=st; persistAndRender(); toast(`"${item.name}" → ${labelForStatus(st)}`); }
});

// ---------- actions (delegated) ----------
document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  const {action, id}=btn.dataset;
  if(action==='toggle'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    m.status = m.status==='done' ? 'planned' : 'done';
    persistAndRender(); toast(m.status==='done'?'Done ✓':'Back to planned');
  }
  else if(action==='edit') openDialog('edit', id);
  else if(action==='delete'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    if(confirm(`Delete "${m.name}"?`)){
      moves = moves.filter(x=>x.id!==id);
      persistAndRender(); toast('Deleted');
    }
  }
});

// card / row click opens edit (ignore interactive children)
document.addEventListener('click', e=>{
  if(e.target.closest('button, a, input, label')) return;
  const el=e.target.closest('[data-id]'); if(!el) return;
  const m=moves.find(x=>x.id===el.dataset.id);
  if(m && el.dataset.action===undefined) openDialog('edit', m.id);
});

// ---------- dialog ----------
function openDialog(mode, id){
  editingId = id || null;
  if(mode==='edit' && id){
    const m=moves.find(x=>x.id===id); if(!m) return;
    els.dialogTitle.textContent = 'Edit repo';
    els.fName.value=m.name; els.fInitial.value=m.initialPlace; els.fTarget.value=m.targetPlace; els.fLink.value=m.githubUrl||'';
    els.fDue.value=m.due||''; els.fNotes.value=m.notes||'';
    const radio=els.form.querySelector(`input[name="fStatus"][value="${m.status}"]`); if(radio) radio.checked=true;
  } else {
    els.dialogTitle.textContent = 'Add repo';
    els.form.reset();
    const r=els.form.querySelector('input[name="fStatus"][value="planned"]'); if(r) r.checked=true;
  }
  els.fName.focus();
  if(!els.dialog.open) els.dialog.showModal();
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
     document.activeElement.tagName!=='INPUT'){ e.preventDefault(); openDialog('add'); }
});

els.form.addEventListener('submit', e=>{
  e.preventDefault();
  const name=els.fName.value.trim();
  const initial=els.fInitial.value.trim();
  const target=els.fTarget.value.trim();
  const link=els.fLink.value.trim();
  const due=els.fDue.value;
  const notes=els.fNotes.value.trim();
  if(!name || !initial || !target){ toast('Fill required fields'); return; }
  if(link){ try{ new URL(link); }catch{ toast('Invalid link'); return; } }
  const status = (els.form.querySelector('input[name="fStatus"]:checked')||{}).value || 'planned';
  const data={ name, initialPlace:initial, targetPlace:target, githubUrl:link, status, due, notes };
  if(editingId){
    const idx=moves.findIndex(m=>m.id===editingId);
    if(idx!==-1) moves[idx]={...moves[idx], ...data, done:status==='done'};
    toast('Saved');
  } else {
    moves.push({ id:uid(), ...data, done:status==='done' });
    toast('Added');
  }
  closeDialog(); persistAndRender();
});

// ---------- inputs ----------
els.search.addEventListener('input', render);
els.listViewBtn.addEventListener('click', ()=>{ viewMode='list'; localStorage.setItem('repoMover:view2','list'); render(); });
els.boardViewBtn.addEventListener('click', ()=>{ viewMode='board'; localStorage.setItem('repoMover:view2','board'); render(); });

// ---------- init ----------
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
els.dateLine.textContent = new Date().toLocaleDateString(undefined, {weekday:'short', month:'long', day:'numeric'});
render();
