const STORAGE_KEY = 'repoMover:moves-v1';

const els = {
  statsBar: document.getElementById('statsBar'),
  board: document.getElementById('boardView'),
  tableWrap: document.getElementById('tableView'),
  tableBody: document.getElementById('tableBody'),
  empty: document.getElementById('emptyState'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  search: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  groupBy: document.getElementById('groupBy'),
  boardBtn: document.getElementById('boardViewBtn'),
  tableBtn: document.getElementById('tableViewBtn'),
  dialog: document.getElementById('repoDialog'),
  form: document.getElementById('repoForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  closeDialog: document.getElementById('closeDialog'),
  cancelBtn: document.getElementById('cancelBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  addBtn: document.getElementById('addBtn'),
  toast: document.getElementById('toast'),
  fName: document.getElementById('fName'),
  fStatus: document.getElementById('fStatus'),
  fInitial: document.getElementById('fInitial'),
  fTarget: document.getElementById('fTarget'),
  fLink: document.getElementById('fLink'),
  fExtra: document.getElementById('fExtra'),
  fNotes: document.getElementById('fNotes'),
};

let moves = load();
let viewMode = localStorage.getItem('repoMover:view') || 'board';
let editingId = null;
let draggedId = null;
let renderScheduled = false;

// ---------- utils ----------
function uid(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // fallback for insecure contexts
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){ return escapeHtml(s); }
function labelForStatus(s){
  return {planned:'Planned', in_progress:'In progress', done:'Done', blocked:'Blocked'}[s]||s;
}
function hostFromUrl(url){
  try{ return escapeHtml(new URL(url).hostname.replace(/^www\./,'')); }catch{ return escapeHtml(url.slice(0,32)); }
}
function debounce(fn, ms){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
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
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length) return parsed;
    }
  }catch(e){
    console.warn('load failed', e);
  }
  return [
    {
      id: uid(),
      name: 'payment-service',
      initialPlace: 'github.com/old-org',
      targetPlace: 'github.com/new-org/platform',
      githubUrl: 'https://github.com/old-org/payment-service',
      extraLinks: ['https://notion.so/payment-migration'],
      status: 'planned',
      notes: 'Need to transfer ownership + update CI secrets',
      createdAt: Date.now()-86400000,
      updatedAt: Date.now()-86400000,
    },
    {
      id: uid(),
      name: 'web-dashboard',
      initialPlace: 'github.com/old-org',
      targetPlace: 'Archived',
      githubUrl: 'https://github.com/old-org/web-dashboard',
      extraLinks: [],
      status: 'in_progress',
      notes: 'Archive after moving docs to wiki',
      createdAt: Date.now()-3600000,
      updatedAt: Date.now()-3600000,
    },
    {
      id: uid(),
      name: 'auth-lib',
      initialPlace: 'github.com/old-org/libs',
      targetPlace: 'github.com/new-org/shared',
      githubUrl: 'https://github.com/old-org/auth-lib',
      extraLinks: ['https://github.com/new-org/shared/issues/12'],
      status: 'done',
      notes: 'Moved and verified CI green',
      createdAt: Date.now()-172800000,
      updatedAt: Date.now()-43200000,
    },
  ];
}
function save(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(moves));
    return true;
  }catch(e){
    console.error(e);
    if(e.name === 'QuotaExceededError' || e.code===22){
      toast('Storage full — export and remove old entries');
    } else {
      toast('Save failed');
    }
    return false;
  }
}
function persistAndRender(){
  save();
  scheduleRender();
}
function scheduleRender(){
  if(renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(()=>{ renderScheduled=false; render(); });
}

// ---------- filtering ----------
function filtered(){
  const q = els.search.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  if(!q && status==='all') return moves;
  return moves.filter(m=>{
    if(status !== 'all' && m.status !== status) return false;
    if(!q) return true;
    const hay = [m.name, m.initialPlace, m.targetPlace, m.githubUrl, ...(m.extraLinks||[]), m.notes].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function grouped(list){
  const key = els.groupBy.value;
  const map = new Map();
  for(const m of list){
    const g = (m[key] || 'Unspecified').trim() || 'Unspecified';
    if(!map.has(g)) map.set(g, []);
    map.get(g).push(m);
  }
  if(key === 'status'){
    const order = ['planned','in_progress','blocked','done'];
    return new Map([...map.entries()].sort((a,b)=> order.indexOf(a[0]) - order.indexOf(b[0])));
  }
  return new Map([...map.entries()].sort((a,b)=> a[0].localeCompare(b[0])));
}

// ---------- render ----------
function renderStats(){
  const total = moves.length;
  const planned = moves.filter(m=>m.status==='planned').length;
  const progress = moves.filter(m=>m.status==='in_progress').length;
  const done = moves.filter(m=>m.status==='done').length;
  const pct = total ? Math.round(done/total*100) : 0;
  // also show filtered count when filtering
  const filteredCount = filtered().length;
  const filterNote = filteredCount !== total ? ` · ${filteredCount} shown` : '';
  els.statsBar.innerHTML = `
    <div class="stat accent"><label>Total repos</label><strong>${total}</strong><small>${pct}% moved${filterNote}</small></div>
    <div class="stat"><label>Planned</label><strong>${planned}</strong><small>awaiting move</small></div>
    <div class="stat"><label>In progress</label><strong>${progress}</strong><small>currently moving</small></div>
    <div class="stat"><label>Done</label><strong>${done}</strong><small>completed</small></div>
  `;
}

function cardHtml(m){
  const extra = (m.extraLinks||[]).map(u=> `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${hostFromUrl(u)}</a>`).join('');
  return `
    <div class="card" draggable="true" data-id="${m.id}">
      <div class="card-head">
        <div class="card-title">${escapeHtml(m.name)}</div>
        <div class="card-actions">
          <button data-action="edit" data-id="${m.id}" title="Edit" aria-label="Edit ${escapeAttr(m.name)}">✎</button>
          <button data-action="delete" data-id="${m.id}" title="Delete" aria-label="Delete ${escapeAttr(m.name)}">✕</button>
        </div>
      </div>
      <div class="places">
        <span class="place" title="${escapeAttr(m.initialPlace)}">${escapeHtml(m.initialPlace)}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="place" title="${escapeAttr(m.targetPlace)}">${escapeHtml(m.targetPlace)}</span>
      </div>
      <div class="links">
        <a href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer">↗ ${hostFromUrl(m.githubUrl)}</a>
        ${extra}
      </div>
      ${m.notes ? `<div class="card-notes">${escapeHtml(m.notes)}</div>` : ''}
      <div class="card-foot">
        <span class="badge ${m.status}">${labelForStatus(m.status)}</span>
        <select data-action="status" data-id="${m.id}" class="btn btn-ghost btn-sm" aria-label="Change status" style="padding:4px 6px">
          <option value="planned" ${m.status==='planned'?'selected':''}>Planned</option>
          <option value="in_progress" ${m.status==='in_progress'?'selected':''}>In progress</option>
          <option value="blocked" ${m.status==='blocked'?'selected':''}>Blocked</option>
          <option value="done" ${m.status==='done'?'selected':''}>Done</option>
        </select>
      </div>
    </div>
  `;
}

function renderBoard(list){
  const groups = grouped(list);
  if(list.length===0){
    els.board.innerHTML = '';
    return;
  }
  // build via array join (faster than DOM ops) but keep delegation
  els.board.innerHTML = [...groups.entries()].map(([group, items])=> `
    <div class="column" data-group="${escapeAttr(group)}">
      <div class="col-head"><h3 title="${escapeAttr(group)}">${escapeHtml(group)}</h3><span class="col-count">${items.length}</span></div>
      <div class="col-body" data-group="${escapeAttr(group)}">
        ${items.map(cardHtml).join('')}
      </div>
    </div>
  `).join('');
}

function renderTable(list){
  if(list.length===0){
    els.tableBody.innerHTML = '';
    return;
  }
  els.tableBody.innerHTML = list.map(m=> `
    <tr>
      <td><strong>${escapeHtml(m.name)}</strong>${m.notes?`<div class="mono">${escapeHtml(m.notes)}</div>`:''}</td>
      <td class="mono">${escapeHtml(m.initialPlace)}</td>
      <td class="mono">${escapeHtml(m.targetPlace)}</td>
      <td class="link-cell">
        <a href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.githubUrl)}</a>
        ${(m.extraLinks||[]).map(u=> `<br><a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>`).join('')}
      </td>
      <td><span class="badge ${m.status}">${labelForStatus(m.status)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${m.id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${m.id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

function render(){
  const list = filtered();
  renderStats();
  const isEmpty = moves.length===0;
  const isFilteredEmpty = !isEmpty && list.length===0;

  els.empty.classList.toggle('hidden', !isFilteredEmpty && !isEmpty);
  if(isEmpty){
    els.empty.querySelector('h3').textContent = 'No repos yet';
    els.empty.querySelector('p').textContent = 'Add your first repo movement to start organizing.';
    els.emptyAddBtn.style.display = '';
  } else if(isFilteredEmpty){
    els.empty.querySelector('h3').textContent = 'No matches';
    els.empty.querySelector('p').textContent = 'Try adjusting search or filters.';
    els.emptyAddBtn.style.display='none';
  } else {
    els.emptyAddBtn.style.display='';
  }

  const isBoard = viewMode==='board';
  els.board.classList.toggle('hidden', !isBoard);
  els.tableWrap.classList.toggle('hidden', isBoard);
  els.boardBtn.classList.toggle('active', isBoard);
  els.tableBtn.classList.toggle('active', !isBoard);
  els.boardBtn.setAttribute('aria-selected', String(isBoard));
  els.tableBtn.setAttribute('aria-selected', String(!isBoard));

  if(isBoard) renderBoard(list);
  else renderTable(list);
}

// ---------- drag & drop (delegated) ----------
els.board.addEventListener('dragstart', e=>{
  const card = e.target.closest('.card');
  if(!card) return;
  // don't start drag when interacting with controls
  if(e.target.closest('button, select, a')){ e.preventDefault(); return; }
  draggedId = card.dataset.id;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain', draggedId);
});

els.board.addEventListener('dragend', e=>{
  const card = e.target.closest('.card');
  if(card) card.classList.remove('dragging');
  document.querySelectorAll('.col-body.drag-over').forEach(el=> el.classList.remove('drag-over'));
  draggedId = null;
});

els.board.addEventListener('dragover', e=>{
  const col = e.target.closest('.col-body');
  if(!col) return;
  e.preventDefault();
  col.classList.add('drag-over');
});

els.board.addEventListener('dragleave', e=>{
  const col = e.target.closest('.col-body');
  if(!col) return;
  // only remove if leaving the column itself, not children
  if(!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
});

els.board.addEventListener('drop', e=>{
  const col = e.target.closest('.col-body');
  if(!col || !draggedId) return;
  e.preventDefault();
  col.classList.remove('drag-over');
  const groupVal = col.dataset.group;
  const groupKey = els.groupBy.value;
  const item = moves.find(m=>m.id===draggedId);
  if(!item) return;
  let changed = false;
  if(groupKey==='status'){
    if(['planned','in_progress','blocked','done'].includes(groupVal) && item.status !== groupVal){
      item.status = groupVal; changed=true;
    }
  } else {
    if(item[groupKey] !== groupVal){ item[groupKey] = groupVal; changed=true; }
  }
  if(changed){
    item.updatedAt = Date.now();
    persistAndRender();
    toast(`Moved "${item.name}" → ${groupVal}`);
  }
});

// ---------- dialog ----------
function openDialog(mode, id){
  editingId = id || null;
  if(mode==='edit' && id){
    const m = moves.find(x=>x.id===id);
    if(!m) return;
    els.dialogTitle.textContent = 'Edit repo movement';
    els.fName.value = m.name;
    els.fStatus.value = m.status;
    els.fInitial.value = m.initialPlace;
    els.fTarget.value = m.targetPlace;
    els.fLink.value = m.githubUrl;
    els.fExtra.value = (m.extraLinks||[]).join('\n');
    els.fNotes.value = m.notes||'';
  } else {
    els.dialogTitle.textContent = 'Add repo movement';
    els.form.reset();
    els.fStatus.value = 'planned';
  }
  if(!els.dialog.open) els.dialog.showModal();
  // focus first field
  requestAnimationFrame(()=> els.fName.focus());
}
function closeDialog(){
  if(els.dialog.open) els.dialog.close();
  editingId=null;
}

// ---------- events ----------
els.addBtn.addEventListener('click', ()=> openDialog('add'));
if(els.emptyAddBtn) els.emptyAddBtn.addEventListener('click', ()=> openDialog('add'));
els.closeDialog.addEventListener('click', closeDialog);
els.cancelBtn.addEventListener('click', closeDialog);
els.dialog.addEventListener('click', e=>{
  const r = els.dialog.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeDialog();
});
els.dialog.addEventListener('cancel', (e)=>{ e.preventDefault(); closeDialog(); });
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && els.dialog.open){ e.preventDefault(); closeDialog(); }
});

els.form.addEventListener('submit', e=>{
  e.preventDefault();
  // native validation
  if(!els.form.checkValidity()){
    els.form.reportValidity();
    return;
  }
  const data = {
    name: els.fName.value.trim(),
    status: els.fStatus.value,
    initialPlace: els.fInitial.value.trim(),
    targetPlace: els.fTarget.value.trim(),
    githubUrl: els.fLink.value.trim(),
    extraLinks: els.fExtra.value.split('\n').map(s=>s.trim()).filter(Boolean),
    notes: els.fNotes.value.trim(),
  };
  if(!data.name || !data.initialPlace || !data.targetPlace || !data.githubUrl){
    toast('Please fill all required fields');
    return;
  }
  try{ new URL(data.githubUrl); }catch{ toast('GitHub link must be a valid URL'); return; }
  // validate extra links
  for(const u of data.extraLinks){
    try{ new URL(u); }catch{ toast(`Invalid extra link: ${u}`); return; }
  }

  if(editingId){
    const idx = moves.findIndex(m=>m.id===editingId);
    if(idx!==-1) moves[idx] = {...moves[idx], ...data, updatedAt: Date.now()};
    toast('Movement updated');
  } else {
    moves.unshift({id: uid(), ...data, createdAt: Date.now(), updatedAt: Date.now()});
    toast('Movement added');
  }
  closeDialog();
  persistAndRender();
});

// delegation for edit/delete (works for board + table)
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-action="edit"],[data-action="delete"]');
  if(!btn) return;
  const {action, id} = btn.dataset;
  if(action==='edit') openDialog('edit', id);
  if(action==='delete'){
    const m = moves.find(x=>x.id===id);
    if(!m) return;
    if(confirm(`Delete "${m.name}"?\nThis cannot be undone.`)){
      moves = moves.filter(x=>x.id!==id);
      persistAndRender();
      toast('Deleted');
    }
  }
});
document.addEventListener('change', e=>{
  const sel = e.target.closest('[data-action="status"]');
  if(!sel) return;
  const m = moves.find(x=>x.id===sel.dataset.id);
  if(m){ m.status = sel.value; m.updatedAt=Date.now(); persistAndRender(); toast(`Status → ${labelForStatus(m.status)}`); }
});

const debouncedRender = debounce(()=> scheduleRender(), 120);
els.search.addEventListener('input', debouncedRender);
els.statusFilter.addEventListener('change', ()=> scheduleRender());
els.groupBy.addEventListener('change', ()=> scheduleRender());
els.boardBtn.addEventListener('click', ()=>{ viewMode='board'; localStorage.setItem('repoMover:view','board'); scheduleRender(); });
els.tableBtn.addEventListener('click', ()=>{ viewMode='table'; localStorage.setItem('repoMover:view','table'); scheduleRender(); });

// export / import
els.exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(moves,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`repo-moves-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  toast('Exported JSON');
});
els.importFile.addEventListener('change', async e=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const data = JSON.parse(await file.text());
    if(!Array.isArray(data)) throw new Error('Invalid format: expected array');
    const valid = data.filter(d=> d.name && d.initialPlace && d.targetPlace && d.githubUrl);
    if(valid.length===0) throw new Error('No valid entries');
    if(moves.length>0){
      if(!confirm(`Import ${valid.length} repos? This will REPLACE your current ${moves.length} entries.`)) return;
    }
    moves = valid.map(d=> ({
      id: d.id || uid(),
      name: String(d.name).slice(0,80),
      initialPlace: String(d.initialPlace).slice(0,120),
      targetPlace: String(d.targetPlace).slice(0,120),
      githubUrl: String(d.githubUrl),
      extraLinks: Array.isArray(d.extraLinks)? d.extraLinks.filter(u=> { try{ new URL(u); return true;}catch{ return false;}}).slice(0,10) : [],
      status: ['planned','in_progress','done','blocked'].includes(d.status) ? d.status : 'planned',
      notes: String(d.notes||'').slice(0,600),
      createdAt: Number(d.createdAt)||Date.now(),
      updatedAt: Date.now(),
    }));
    persistAndRender();
    toast(`Imported ${moves.length} repos`);
  }catch(err){
    toast('Import failed: '+ err.message);
  } finally {
    e.target.value='';
  }
});

// init
render();
