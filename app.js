const STORAGE_KEY = 'repoMover:moves-v1';

const els = {
  statsBar: document.getElementById('statsBar'),
  progressBar: document.getElementById('progressBar'),
  board: document.getElementById('boardView'),
  tableWrap: document.getElementById('tableView'),
  tableBody: document.getElementById('tableBody'),
  empty: document.getElementById('emptyState'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  search: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  groupBy: document.getElementById('groupBy'),
  sortBy: document.getElementById('sortBy'),
  chipsBar: document.getElementById('chipsBar'),
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
  footCount: document.getElementById('footCount'),
  fName: document.getElementById('fName'),
  fStatus: document.getElementById('fStatus'),
  fInitial: document.getElementById('fInitial'),
  fTarget: document.getElementById('fTarget'),
  fLink: document.getElementById('fLink'),
  fExtra: document.getElementById('fExtra'),
  fNotes: document.getElementById('fNotes'),
  notesCount: document.getElementById('notesCount'),
  linkHint: document.getElementById('linkHint'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailTitle: document.getElementById('detailTitle'),
  detailSub: document.getElementById('detailSub'),
  detailBadge: document.getElementById('detailBadge'),
  detailBody: document.getElementById('detailBody'),
  closeDetail: document.getElementById('closeDetail'),
  detailEditBtn: document.getElementById('detailEditBtn'),
  detailDeleteBtn: document.getElementById('detailDeleteBtn'),
  detailOpenBtn: document.getElementById('detailOpenBtn'),
  placesList: document.getElementById('placesList'),
  nameList: document.getElementById('nameList'),
};

let moves = load();
let viewMode = localStorage.getItem('repoMover:view') || 'board';
let editingId = null;
let detailId = null;
let draggedId = null;
let renderScheduled = false;
let activeChip = localStorage.getItem('repoMover:chip') || '';
let lastDeleted = null;
let lastDeletedTimer = null;

// ---------- utils ----------
function uid(){ if(typeof crypto!=='undefined'&&crypto.randomUUID) return crypto.randomUUID(); return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function labelForStatus(s){ return {planned:'Planned', in_progress:'In progress', done:'Done', blocked:'Blocked'}[s]||s; }
function statusColor(s){ return {planned:'#9aa0c2', in_progress:'#38bdf8', done:'#22c55e', blocked:'#ff4d6a'}[s]||'#9aa0c2'; }
function hostFromUrl(url){ try{ return escapeHtml(new URL(url).hostname.replace(/^www\./,'')); }catch{ return escapeHtml(url.slice(0,32)); } }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function hashColor(str){
  let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0;
  const hue=h%360; return `hsl(${hue} 70% 58%)`;
}
function relativeTime(ts){
  const diff=Date.now()-ts;
  const mins=Math.floor(diff/60000);
  if(mins<1) return 'just now';
  if(mins<60) return mins+'m ago';
  const hrs=Math.floor(mins/60); if(hrs<24) return hrs+'h ago';
  const days=Math.floor(hrs/24); if(days<7) return days+'d ago';
  return new Date(ts).toLocaleDateString();
}
function highlight(text, q){
  if(!q) return escapeHtml(text);
  const idx=text.toLowerCase().indexOf(q.toLowerCase());
  if(idx===-1) return escapeHtml(text);
  return escapeHtml(text.slice(0,idx)) + `<span class="mark">${escapeHtml(text.slice(idx, idx+q.length))}</span>` + escapeHtml(text.slice(idx+q.length));
}
function toast(msg, action){
  els.toast.innerHTML = `<span>${escapeHtml(msg)}</span>` + (action? `<button class="toast-action" id="toastAction">${escapeHtml(action.label)}</button>` : '');
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  if(action){
    const btn=document.getElementById('toastAction');
    if(btn) btn.onclick=()=>{ action.onClick(); hideToast(); };
  }
  toast._t=setTimeout(hideToast, action? 4200:2200);
}
function hideToast(){ els.toast.classList.add('hidden'); }

// ---------- storage ----------
function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){ const p=JSON.parse(raw); if(Array.isArray(p)&&p.length) return p; }
  }catch(e){ console.warn(e); }
  return [
    { id:uid(), name:'payment-service', initialPlace:'github.com/old-org', targetPlace:'github.com/new-org/platform', githubUrl:'https://github.com/old-org/payment-service', extraLinks:['https://notion.so/payment-migration'], status:'planned', notes:'Need to transfer ownership + update CI secrets', createdAt:Date.now()-86400000, updatedAt:Date.now()-86400000 },
    { id:uid(), name:'web-dashboard', initialPlace:'github.com/old-org', targetPlace:'Archived', githubUrl:'https://github.com/old-org/web-dashboard', extraLinks:[], status:'in_progress', notes:'Archive after moving docs to wiki — keep release tags', createdAt:Date.now()-3600000, updatedAt:Date.now()-3600000 },
    { id:uid(), name:'auth-lib', initialPlace:'github.com/old-org/libs', targetPlace:'github.com/new-org/shared', githubUrl:'https://github.com/old-org/auth-lib', extraLinks:['https://github.com/new-org/shared/issues/12'], status:'done', notes:'Moved and verified CI green. Updated dependents: web, api.', createdAt:Date.now()-172800000, updatedAt:Date.now()-43200000 },
  ];
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(moves)); return true; }
  catch(e){ console.error(e); toast(e.name==='QuotaExceededError' ? 'Storage full — export and remove old entries' : 'Save failed'); return false; }
}
function persistAndRender(){ save(); scheduleRender(); updateDatalists(); }
function scheduleRender(){ if(renderScheduled) return; renderScheduled=true; requestAnimationFrame(()=>{ renderScheduled=false; render(); }); }

// ---------- filtering / sorting ----------
function filtered(){
  const q=els.search.value.trim().toLowerCase();
  const status=els.statusFilter.value;
  let list=moves;
  if(activeChip) list=list.filter(m=> (m.targetPlace||'')===activeChip || (m.initialPlace||'')===activeChip );
  if(status!=='all') list=list.filter(m=>m.status===status);
  if(q) list=list.filter(m=> [m.name,m.initialPlace,m.targetPlace,m.githubUrl,...(m.extraLinks||[]),m.notes].join(' ').toLowerCase().includes(q));
  return sortList(list);
}
function sortList(list){
  const by=els.sortBy.value;
  const copy=[...list];
  if(by==='name') copy.sort((a,b)=> a.name.localeCompare(b.name));
  else if(by==='target') copy.sort((a,b)=> (a.targetPlace||'').localeCompare(b.targetPlace||''));
  else if(by==='status'){ const o={planned:0,in_progress:1,blocked:2,done:3}; copy.sort((a,b)=> (o[a.status]??9)-(o[b.status]??9) || b.updatedAt-a.updatedAt); }
  else copy.sort((a,b)=> b.updatedAt-a.updatedAt);
  return copy;
}
function grouped(list){
  const key=els.groupBy.value;
  const map=new Map();
  for(const m of list){ const g=(m[key]||'Unspecified').trim()||'Unspecified'; if(!map.has(g)) map.set(g,[]); map.get(g).push(m); }
  if(key==='status'){ const order=['planned','in_progress','blocked','done']; return new Map([...map.entries()].sort((a,b)=> order.indexOf(a[0])-order.indexOf(b[0]))); }
  return new Map([...map.entries()].sort((a,b)=> a[0].localeCompare(b[0])));
}

// ---------- chips ----------
function renderChips(){
  const places=[...new Set(moves.map(m=>m.targetPlace).filter(Boolean))].sort();
  if(!places.length){ els.chipsBar.innerHTML=''; return; }
  const allActive=!activeChip;
  els.chipsBar.innerHTML = `
    <button class="chip ${allActive?'active':''}" data-chip="">All targets <span class="chip-count">${moves.length}</span></button>
    ${places.map(p=>{
      const count=moves.filter(m=>m.targetPlace===p).length;
      const active=activeChip===p;
      return `<button class="chip ${active?'active':''}" data-chip="${escapeAttr(p)}"><span class="chip-dot" style="background:${hashColor(p)}"></span>${escapeHtml(p)} <span class="chip-count">${count}</span></button>`;
    }).join('')}
  `;
}
els.chipsBar.addEventListener('click', e=>{
  const b=e.target.closest('[data-chip]');
  if(!b) return;
  activeChip=b.dataset.chip;
  localStorage.setItem('repoMover:chip', activeChip);
  scheduleRender();
});

// ---------- render ----------
function renderStats(){
  const total=moves.length;
  const done=moves.filter(m=>m.status==='done').length;
  const planned=moves.filter(m=>m.status==='planned').length;
  const progress=moves.filter(m=>m.status==='in_progress').length;
  const blocked=moves.filter(m=>m.status==='blocked').length;
  const pct= total? Math.round(done/total*100):0;
  const filteredCount=filtered().length;
  const filterNote= filteredCount!==total ? ` · ${filteredCount} shown` : '';
  els.statsBar.innerHTML=`
    <div class="stat accent"><label>Total repos</label><strong>${total}</strong><small>${pct}% moved${filterNote}</small>${pct>0?`<span class="trend">▲ ${done} done</span>`:''}</div>
    <div class="stat"><label>Planned</label><strong>${planned}</strong><small>awaiting move</small></div>
    <div class="stat"><label>In progress</label><strong>${progress}</strong><small>currently moving</small></div>
    <div class="stat"><label>Blocked · Done</label><strong>${blocked} · ${done}</strong><small>${blocked? blocked+' need attention': 'no blockers'}</small></div>
  `;
  if(els.progressBar) els.progressBar.style.width = pct + '%';
  if(els.footCount) els.footCount.textContent = `${filteredCount} of ${total} movements${activeChip? ' · target: '+activeChip:''}`;
}

function cardHtml(m, q){
  const extra=(m.extraLinks||[]).map(u=> `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(u)}">${hostFromUrl(u)}</a>`).join('');
  const accent=statusColor(m.status);
  const avatarBg=hashColor(m.targetPlace||m.name);
  const avatarLetter=m.name.trim().charAt(0).toUpperCase()||'•';
  return `
    <div class="card" draggable="true" data-id="${m.id}" role="button" tabindex="0" aria-label="Open ${escapeAttr(m.name)} details" style="--card-accent:${accent}">
      <div class="card-top">
        <div style="display:flex;gap:9px;align-items:center;min-width:0;flex:1">
          <div class="card-avatar" style="background:${avatarBg}">${escapeHtml(avatarLetter)}</div>
          <div class="card-title">${highlight(m.name, q)}</div>
        </div>
        <div class="card-actions">
          <button data-action="edit" data-id="${m.id}" title="Edit" aria-label="Edit">✎</button>
          <button data-action="delete" data-id="${m.id}" title="Delete" aria-label="Delete">✕</button>
        </div>
      </div>
      <div class="places">
        <span class="place" title="${escapeAttr(m.initialPlace)}">${highlight(m.initialPlace,q)}</span>
        <span class="arrow">→</span>
        <span class="place" title="${escapeAttr(m.targetPlace)}">${highlight(m.targetPlace,q)}</span>
      </div>
      <div class="links">
        <a href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">↗ ${hostFromUrl(m.githubUrl)}</a>
        ${extra}
      </div>
      ${m.notes? `<div class="card-notes">${highlight(m.notes,q)}</div>`:''}
      <div class="card-foot">
        <span class="badge ${m.status}"><span class="badge-dot" style="background:${accent}"></span>${labelForStatus(m.status)}</span>
        <span class="card-meta">${escapeHtml(relativeTime(m.updatedAt))} · <select data-action="status" data-id="${m.id}" class="btn btn-ghost btn-sm" aria-label="Change status" onclick="event.stopPropagation()" style="padding:3px 6px;font-size:11px">${['planned','in_progress','blocked','done'].map(v=>`<option value="${v}" ${m.status===v?'selected':''}>${labelForStatus(v)}</option>`).join('')}</select></span>
      </div>
    </div>
  `;
}

function renderBoard(list){
  const q=els.search.value.trim();
  const groups=grouped(list);
  if(!list.length){ els.board.innerHTML=''; return; }
  els.board.innerHTML=[...groups.entries()].map(([group,items])=>{
    const dot= els.groupBy.value==='status' ? statusColor(group) : hashColor(group);
    return `
    <div class="column" data-group="${escapeAttr(group)}">
      <div class="col-head">
        <div class="col-title"><span class="col-dot" style="background:${dot}"></span><h3 title="${escapeAttr(group)}">${escapeHtml(group)}</h3></div>
        <div class="col-actions"><span class="col-count">${items.length}</span><button class="col-add" data-add-to="${escapeAttr(group)}" title="Add to ${escapeAttr(group)}">+</button></div>
      </div>
      <div class="col-body" data-group="${escapeAttr(group)}">
        ${items.map(m=> cardHtml(m,q)).join('')}
      </div>
      <div class="col-foot"><button class="btn btn-ghost btn-sm" data-add-to="${escapeAttr(group)}">+ Add</button></div>
    </div>
  `;
  }).join('');
}

function renderTable(list){
  const q=els.search.value.trim();
  if(!list.length){ els.tableBody.innerHTML=''; return; }
  els.tableBody.innerHTML=list.map(m=> `
    <tr data-id="${m.id}" style="cursor:pointer">
      <td><strong>${highlight(m.name,q)}</strong>${m.notes?`<div class="mono">${highlight(m.notes,q)}</div>`:''}<div class="mono" style="margin-top:4px;opacity:.7">${escapeHtml(relativeTime(m.updatedAt))}</div></td>
      <td class="mono">${highlight(m.initialPlace,q)}</td>
      <td class="mono">${highlight(m.targetPlace,q)}</td>
      <td class="link-cell"><a href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${highlight(m.githubUrl,q)}</a>${(m.extraLinks||[]).map(u=>`<br><a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${highlight(u,q)}</a>`).join('')}</td>
      <td><span class="badge ${m.status}"><span class="badge-dot" style="background:${statusColor(m.status)}"></span>${labelForStatus(m.status)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${m.id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${m.id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

function render(){
  const list=filtered();
  renderStats();
  renderChips();
  const isEmpty=moves.length===0;
  const isFilteredEmpty=!isEmpty && list.length===0;
  els.empty.classList.toggle('hidden', !isFilteredEmpty && !isEmpty);
  if(isEmpty){ els.empty.querySelector('h3').textContent='No repos yet'; els.empty.querySelector('p').textContent='Add your first repo movement to start organizing. Track initial place, GitHub link and where it should land.'; els.emptyAddBtn.style.display=''; }
  else if(isFilteredEmpty){ els.empty.querySelector('h3').textContent='No matches'; els.empty.querySelector('p').textContent='Try adjusting search, status or target filter.'; els.emptyAddBtn.style.display='none'; }
  else els.emptyAddBtn.style.display='';

  const isBoard=viewMode==='board';
  els.board.classList.toggle('hidden', !isBoard);
  els.tableWrap.classList.toggle('hidden', isBoard);
  els.boardBtn.classList.toggle('active', isBoard);
  els.tableBtn.classList.toggle('active', !isBoard);
  els.boardBtn.setAttribute('aria-selected', String(isBoard));
  els.tableBtn.setAttribute('aria-selected', String(!isBoard));

  if(isBoard) renderBoard(list); else renderTable(list);
}

// ---------- detail drawer ----------
function openDetail(id){
  const m=moves.find(x=>x.id===id); if(!m) return;
  detailId=id;
  els.detailTitle.textContent=m.name;
  els.detailSub.textContent=`${m.initialPlace} → ${m.targetPlace}`;
  els.detailBadge.textContent=labelForStatus(m.status);
  els.detailBadge.className='drawer-badge badge '+m.status;
  els.detailBadge.style.color=statusColor(m.status);
  els.detailBadge.style.borderColor=statusColor(m.status)+'44';
  els.detailBadge.style.background=statusColor(m.status)+'18';
  els.detailOpenBtn.href=m.githubUrl;
  els.detailBody.innerHTML=`
    <div class="stepper" role="list">
      ${['planned','in_progress','done'].map(s=> `<div class="step ${stepActive(m.status,s)?'active':''}"><div class="step-dot"></div><span>${labelForStatus(s)}</span></div>`).join('<span style="color:var(--dim)">›</span>')}
      <div class="step ${m.status==='blocked'?'active':''}" style="${m.status==='blocked'?'opacity:1;color:var(--red)':''}"><div class="step-dot" style="${m.status==='blocked'?'background:var(--red)':''}"></div><span>Blocked</span></div>
    </div>
    <div class="detail-grid">
      <div class="detail-field"><label>Initial place</label><div class="mono">${escapeHtml(m.initialPlace)}</div></div>
      <div class="detail-field"><label>Target place</label><div class="mono" style="color:${hashColor(m.targetPlace)};font-weight:600">${escapeHtml(m.targetPlace)}</div></div>
      <div class="detail-field"><label>Created</label><div class="mono">${escapeHtml(new Date(m.createdAt).toLocaleString())} · ${escapeHtml(relativeTime(m.createdAt))}</div></div>
      <div class="detail-field"><label>Updated</label><div class="mono">${escapeHtml(new Date(m.updatedAt).toLocaleString())} · ${escapeHtml(relativeTime(m.updatedAt))}</div></div>
    </div>
    <div class="detail-field">
      <label>GitHub link</label>
      <div class="links-list">
        <a href="${escapeAttr(m.githubUrl)}" target="_blank" rel="noopener noreferrer"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.githubUrl)}</span><span>↗</span></a>
        ${(m.extraLinks||[]).map(u=> `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u)}</span><span>↗</span></a>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeAttr(m.githubUrl)}'); toast('Link copied')">Copy link</button>
        <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(\`${escapeAttr([m.githubUrl,...(m.extraLinks||[])].join('\n'))}\`); toast('All links copied')">Copy all</button>
      </div>
    </div>
    ${m.notes? `<div class="detail-field"><label>Notes</label><div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(m.notes)}</div></div>` : `<div class="detail-field"><label>Notes</label><div style="color:var(--dim)">No notes</div></div>`}
    <div class="detail-field">
      <label>Quick status</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        ${['planned','in_progress','blocked','done'].map(s=> `<button class="btn ${m.status===s?'btn-primary':'btn-ghost'} btn-sm" data-detail-status="${s}">${labelForStatus(s)}</button>`).join('')}
      </div>
    </div>
  `;
  els.detailBody.querySelectorAll('[data-detail-status]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const mm=moves.find(x=>x.id===detailId); if(mm){ mm.status=b.dataset.detailStatus; mm.updatedAt=Date.now(); save(); render(); openDetail(detailId); toast('Status → '+labelForStatus(mm.status)); }
    });
  });
  if(!els.detailDrawer.open) els.detailDrawer.showModal();
}
function stepActive(cur, step){
  const order={planned:0,in_progress:1,done:2};
  if(cur==='blocked') return false;
  return (order[cur]??-1) >= (order[step]??-1);
}
function closeDetail(){ if(els.detailDrawer.open) els.detailDrawer.close(); detailId=null; }

// ---------- drag (delegated) ----------
els.board.addEventListener('dragstart', e=>{
  const card=e.target.closest('.card'); if(!card) return;
  if(e.target.closest('button, select, a')){ e.preventDefault(); return; }
  draggedId=card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', draggedId);
});
els.board.addEventListener('dragend', e=>{
  const card=e.target.closest('.card'); if(card) card.classList.remove('dragging');
  document.querySelectorAll('.col-body.drag-over').forEach(el=> el.classList.remove('drag-over')); draggedId=null;
});
els.board.addEventListener('dragover', e=>{ const col=e.target.closest('.col-body'); if(!col) return; e.preventDefault(); col.classList.add('drag-over'); });
els.board.addEventListener('dragleave', e=>{ const col=e.target.closest('.col-body'); if(!col) return; if(!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
els.board.addEventListener('drop', e=>{
  const col=e.target.closest('.col-body'); if(!col||!draggedId) return; e.preventDefault(); col.classList.remove('drag-over');
  const groupVal=col.dataset.group; const groupKey=els.groupBy.value; const item=moves.find(m=>m.id===draggedId); if(!item) return;
  let changed=false;
  if(groupKey==='status'){ if(['planned','in_progress','blocked','done'].includes(groupVal) && item.status!==groupVal){ item.status=groupVal; changed=true; } }
  else if(item[groupKey]!==groupVal){ item[groupKey]=groupVal; changed=true; }
  if(changed){ item.updatedAt=Date.now(); persistAndRender(); toast(`Moved "${item.name}" → ${groupVal}`); }
});

// card click -> detail (ignore controls)
els.board.addEventListener('click', e=>{
  if(e.target.closest('button, select, a')) return;
  const card=e.target.closest('.card'); if(card) openDetail(card.dataset.id);
});
els.board.addEventListener('keydown', e=>{
  if(e.key==='Enter' || e.key===' '){ const card=e.target.closest('.card'); if(card){ e.preventDefault(); openDetail(card.dataset.id); } }
});
document.getElementById('tableBody').addEventListener('click', e=>{
  if(e.target.closest('button, a')) return;
  const tr=e.target.closest('tr[data-id]'); if(tr) openDetail(tr.dataset.id);
});

// per-column add
document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-add-to]');
  if(!btn) return;
  const val=btn.dataset.addTo;
  openDialog('add');
  if(els.groupBy.value==='targetPlace') els.fTarget.value=val;
  else if(els.groupBy.value==='initialPlace') els.fInitial.value=val;
  else if(els.groupBy.value==='status' && ['planned','in_progress','blocked','done'].includes(val)) els.fStatus.value=val;
});

// ---------- dialog ----------
function updateDatalists(){
  const places=[...new Set(moves.flatMap(m=> [m.initialPlace,m.targetPlace]).filter(Boolean))].sort();
  els.placesList.innerHTML=places.map(p=> `<option value="${escapeAttr(p)}">`).join('');
  const names=[...new Set(moves.map(m=>m.name))].sort().slice(0,30);
  els.nameList.innerHTML=names.map(n=> `<option value="${escapeAttr(n)}">`).join('');
}
function openDialog(mode,id){
  editingId=id||null;
  if(mode==='edit'&&id){
    const m=moves.find(x=>x.id===id); if(!m) return;
    els.dialogTitle.textContent='Edit repo movement';
    els.fName.value=m.name; els.fStatus.value=m.status; els.fInitial.value=m.initialPlace; els.fTarget.value=m.targetPlace; els.fLink.value=m.githubUrl; els.fExtra.value=(m.extraLinks||[]).join('\n'); els.fNotes.value=m.notes||'';
  } else {
    els.dialogTitle.textContent='Add repo movement'; els.form.reset(); els.fStatus.value='planned';
  }
  updateNotesCount(); validateLink();
  if(!els.dialog.open) els.dialog.showModal();
  requestAnimationFrame(()=> els.fName.focus());
}
function closeDialog(){ if(els.dialog.open) els.dialog.close(); editingId=null; }
function updateNotesCount(){ if(els.notesCount) els.notesCount.textContent=`${els.fNotes.value.length}/600`; }
function validateLink(){
  const v=els.fLink.value.trim();
  if(!v){ els.linkHint.textContent=''; return; }
  try{ new URL(v); els.linkHint.textContent='✓ valid'; els.linkHint.style.color='var(--green)'; }catch{ els.linkHint.textContent='✗ invalid URL'; els.linkHint.style.color='var(--red)'; }
}

// ---------- events ----------
els.addBtn.addEventListener('click', ()=> openDialog('add'));
if(els.emptyAddBtn) els.emptyAddBtn.addEventListener('click', ()=> openDialog('add'));
els.closeDialog.addEventListener('click', closeDialog);
els.cancelBtn.addEventListener('click', closeDialog);
els.dialog.addEventListener('click', e=>{ const r=els.dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeDialog(); });
els.dialog.addEventListener('cancel', e=>{ e.preventDefault(); closeDialog(); });
els.closeDetail.addEventListener('click', closeDetail);
els.detailDrawer.addEventListener('click', e=>{ const r=els.detailDrawer.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeDetail(); });
els.detailEditBtn.addEventListener('click', ()=>{ const id=detailId; closeDetail(); openDialog('edit', id); });
els.detailDeleteBtn.addEventListener('click', ()=>{
  const m=moves.find(x=>x.id===detailId); if(!m) return;
  if(!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
  doDelete(detailId); closeDetail();
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && els.dialog.open){ e.preventDefault(); closeDialog(); }
  if(e.key==='Escape' && els.detailDrawer.open){ e.preventDefault(); closeDetail(); }
  // shortcuts
  if(!els.dialog.open && !els.detailDrawer.open){
    if(e.key==='/' && document.activeElement!==els.search){ e.preventDefault(); els.search.focus(); }
    if(e.key.toLowerCase()==='n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); openDialog('add'); }
    if(e.key.toLowerCase()==='b'){ viewMode='board'; localStorage.setItem('repoMover:view','board'); scheduleRender(); }
    if(e.key.toLowerCase()==='t'){ viewMode='table'; localStorage.setItem('repoMover:view','table'); scheduleRender(); }
  }
});
els.fNotes.addEventListener('input', updateNotesCount);
els.fLink.addEventListener('input', validateLink);
els.form.addEventListener('submit', e=>{
  e.preventDefault();
  if(!els.form.checkValidity()){ els.form.reportValidity(); return; }
  const data={
    name:els.fName.value.trim(),
    status:els.fStatus.value,
    initialPlace:els.fInitial.value.trim(),
    targetPlace:els.fTarget.value.trim(),
    githubUrl:els.fLink.value.trim(),
    extraLinks:els.fExtra.value.split('\n').map(s=>s.trim()).filter(Boolean),
    notes:els.fNotes.value.trim(),
  };
  if(!data.name||!data.initialPlace||!data.targetPlace||!data.githubUrl){ toast('Please fill all required fields'); return; }
  try{ new URL(data.githubUrl); }catch{ toast('GitHub link must be a valid URL'); return; }
  for(const u of data.extraLinks){ try{ new URL(u); }catch{ toast(`Invalid extra link: ${u}`); return; } }
  if(editingId){
    const idx=moves.findIndex(m=>m.id===editingId);
    if(idx!==-1) moves[idx]={...moves[idx],...data, updatedAt:Date.now()};
    toast('Movement updated');
  } else { moves.unshift({id:uid(),...data, createdAt:Date.now(), updatedAt:Date.now()}); toast('Movement added'); }
  closeDialog(); persistAndRender();
});

function doDelete(id){
  const m=moves.find(x=>x.id===id); if(!m) return;
  lastDeleted={ item:m, index:moves.findIndex(x=>x.id===id) };
  moves=moves.filter(x=>x.id!==id);
  persistAndRender();
  clearTimeout(lastDeletedTimer);
  toast(`Deleted "${m.name}"`, { label:'Undo', onClick:()=>{
    if(lastDeleted){ moves.splice(lastDeleted.index,0,lastDeleted.item); lastDeleted=null; persistAndRender(); toast('Restored'); }
  }});
  lastDeletedTimer=setTimeout(()=> lastDeleted=null, 5000);
}
document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-action="edit"],[data-action="delete"]');
  if(!btn) return; e.stopPropagation();
  const {action,id}=btn.dataset;
  if(action==='edit') openDialog('edit', id);
  if(action==='delete'){
    const m=moves.find(x=>x.id===id); if(!m) return;
    if(confirm(`Delete "${m.name}"?`)) doDelete(id);
  }
});
document.addEventListener('change', e=>{
  const sel=e.target.closest('[data-action="status"]'); if(!sel) return; e.stopPropagation();
  const m=moves.find(x=>x.id===sel.dataset.id); if(m){ m.status=sel.value; m.updatedAt=Date.now(); persistAndRender(); toast(`Status → ${labelForStatus(m.status)}`); if(detailId===m.id) openDetail(m.id); }
});

const debouncedRender=debounce(()=> scheduleRender(), 110);
els.search.addEventListener('input', debouncedRender);
els.statusFilter.addEventListener('change', ()=> scheduleRender());
els.groupBy.addEventListener('change', ()=> scheduleRender());
els.sortBy.addEventListener('change', ()=> scheduleRender());
els.boardBtn.addEventListener('click', ()=>{ viewMode='board'; localStorage.setItem('repoMover:view','board'); scheduleRender(); });
els.tableBtn.addEventListener('click', ()=>{ viewMode='table'; localStorage.setItem('repoMover:view','table'); scheduleRender(); });
document.querySelectorAll('th.sortable').forEach(th=>{
  th.addEventListener('click', ()=>{
    els.sortBy.value='name'; scheduleRender(); toast('Sorted by name');
  });
});

// export / import
els.exportBtn.addEventListener('click', ()=>{
  const blob=new Blob([JSON.stringify(moves,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`repo-moves-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=> URL.revokeObjectURL(url),1000); toast('Exported JSON');
});
els.importFile.addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data)) throw new Error('Invalid format: expected array');
    const valid=data.filter(d=> d.name&&d.initialPlace&&d.targetPlace&&d.githubUrl);
    if(!valid.length) throw new Error('No valid entries');
    if(moves.length>0){ if(!confirm(`Import ${valid.length} repos? This will REPLACE your current ${moves.length} entries.`)) return; }
    moves=valid.map(d=> ({
      id:d.id||uid(), name:String(d.name).slice(0,80), initialPlace:String(d.initialPlace).slice(0,120), targetPlace:String(d.targetPlace).slice(0,120), githubUrl:String(d.githubUrl),
      extraLinks:Array.isArray(d.extraLinks)? d.extraLinks.filter(u=>{ try{ new URL(u); return true;}catch{return false;}}).slice(0,10):[],
      status:['planned','in_progress','done','blocked'].includes(d.status)? d.status:'planned',
      notes:String(d.notes||'').slice(0,600), createdAt:Number(d.createdAt)||Date.now(), updatedAt:Date.now(),
    }));
    persistAndRender(); toast(`Imported ${moves.length} repos`);
  }catch(err){ toast('Import failed: '+err.message); } finally{ e.target.value=''; }
});

// init
updateDatalists();
render();
