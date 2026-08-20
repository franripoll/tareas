/* ============================================================
   Tareas — motor de la app (localStorage, sin backend)
   ============================================================ */

const STORAGE_KEY = 'tareas-app-v1';
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']; // índice = Date.getDay()
const AREA_PALETTE = ['#5B8DBE', '#C9A24C', '#4FA893', '#A97CA5', '#8B95A8', '#B08968', '#6BAF7C', '#C77B7B'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pad(n) { return String(n).padStart(2, '0'); }
function toISO(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function todayISO() { return toISO(new Date()); }
function todayLetter() { return DAY_LETTERS[new Date().getDay()]; }
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return toISO(date);
}
function dateFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// resuelve el estado del formulario ('hoy' | 'mañana' | 'custom' | '') a una fecha ISO real
function resolveFormDate(form) {
  if (form.date === 'hoy') return todayISO();
  if (form.date === 'mañana') return addDaysISO(todayISO(), 1);
  if (form.date === 'custom') return form.customDate || '';
  return '';
}

function defaultState() {
  return {
    areas: [
      { id: 'mayor', name: 'Mayor', color: '#5B8DBE' },
      { id: 'musica', name: 'Música', color: '#C9A24C' },
      { id: 'pastera', name: 'Sa Pastera', color: '#4FA893' },
      { id: 'personal', name: 'Personal', color: '#A97CA5' }
    ],
    tasks: [],
    notes: []
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed.areas || !parsed.tasks || !parsed.notes) return defaultState();
    return parsed;
  } catch (e) {
    console.error('No se pudo leer el almacenamiento local', e);
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getArea(id) { return state.areas.find(a => a.id === id) || null; }

function addArea(name) {
  const clean = name.trim();
  if (!clean) return null;
  const existing = state.areas.find(a => a.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const color = AREA_PALETTE[state.areas.length % AREA_PALETTE.length];
  const area = { id: uid(), name: clean, color };
  state.areas.push(area);
  saveState();
  return area;
}

/* ---------- fecha / racha helpers ---------- */

function formatDateLabel(dateISO, { long = false } = {}) {
  if (dateISO === '') return 'sin fecha';
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  if (dateISO === today) return 'hoy';
  if (dateISO === tomorrow) return 'mañana';
  if (dateISO < today) {
    const days = Math.round((dateFromISO(today) - dateFromISO(dateISO)) / 86400000);
    return `vencía hace ${days} día${days === 1 ? '' : 's'}`;
  }
  const d = dateFromISO(dateISO);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: long ? 'long' : 'short' });
}

function isOverdue(task) {
  return task.type === 'puntual' && !task.done && task.date && task.date < todayISO();
}

function computeStreak(task) {
  if (task.type !== 'recurrente' || !task.days || !task.days.length) return 0;
  let streak = 0;
  let cursor = dateFromISO(todayISO());
  for (let i = 0; i < 400; i++) {
    const iso = toISO(cursor);
    const letter = DAY_LETTERS[cursor.getDay()];
    if (task.days.includes(letter)) {
      if (task.history.includes(iso)) {
        streak++;
      } else {
        // si es el día de hoy y aún no se ha marcado, no rompe la racha todavía
        if (iso !== todayISO()) break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function last7Days() {
  const out = [];
  let cursor = dateFromISO(todayISO());
  for (let i = 0; i < 7; i++) {
    out.unshift({ iso: toISO(cursor), letter: DAY_LETTERS[cursor.getDay()] });
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}

/* ---------- tareas: CRUD ---------- */

function addTask(data) {
  const task = {
    id: uid(),
    title: data.title,
    areaId: data.areaId || null,
    type: data.type,
    date: data.type === 'puntual' ? data.date : '',
    done: false,
    completedAt: null,
    days: data.type === 'recurrente' ? data.days : [],
    history: [],
    createdAt: Date.now()
  };
  state.tasks.unshift(task);
  saveState();
  render();
}

function updateTask(id, data) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.title = data.title;
  task.areaId = data.areaId || null;
  task.type = data.type;
  if (data.type === 'puntual') {
    task.date = data.date;
    task.days = [];
  } else {
    task.days = data.days;
    task.date = '';
  }
  saveState();
  render();
}

function deleteTask(id) {
  const idx = state.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const [removed] = state.tasks.splice(idx, 1);
  saveState();
  render();
  showToast('Tarea eliminada', () => {
    state.tasks.splice(idx, 0, removed);
    saveState();
    render();
  });
}

function toggleTaskDone(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  let justCompleted = false;
  if (task.type === 'puntual') {
    task.done = !task.done;
    task.completedAt = task.done ? todayISO() : null;
    justCompleted = task.done;
  } else {
    const today = todayISO();
    const idx = task.history.indexOf(today);
    if (idx >= 0) { task.history.splice(idx, 1); }
    else { task.history.push(today); justCompleted = true; }
  }
  saveState();
  render();
  if (justCompleted) {
    showToast('Tarea completada', () => toggleTaskDone(id));
  }
}

/* ---------- notas: CRUD ---------- */

function extractTags(text) {
  const matches = text.match(/#(\S+)/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function addNote(title, text) {
  const tags = extractTags(title + ' ' + text);
  const note = { id: uid(), title, text, tags, pinned: false, createdAt: Date.now() };
  state.notes.unshift(note);
  saveState();
  render();
}

function deleteNote(id) {
  const idx = state.notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [removed] = state.notes.splice(idx, 1);
  saveState();
  render();
  showToast('Nota eliminada', () => {
    state.notes.splice(idx, 0, removed);
    saveState();
    render();
  });
}

function togglePinNote(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  saveState();
  render();
}

function formatRelative(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hace 1 día';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'hace 1 semana';
  return `hace ${weeks} semanas`;
}

/* ============================================================
   RENDER
   ============================================================ */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildTaskCard(task) {
  const area = task.areaId ? getArea(task.areaId) : null;
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = task.id;
  if (area) el.style.setProperty('--area-color', area.color);

  const overdue = isOverdue(task);
  let metaHtml = area ? `<span class="area-name" style="color:${area.color}">${escapeHtml(area.name)}</span>` : '';

  if (task.type === 'puntual') {
    const label = task.done && task.completedAt ? formatDateLabel(task.completedAt) : formatDateLabel(task.date);
    metaHtml += (area ? '<span class="dot-sep">·</span>' : '') + label;
  } else {
    const streak = computeStreak(task);
    const freqLabel = task.days.length === 7 ? 'diaria' : task.days.length ? task.days.join(', ') : 'sin días elegidos';
    metaHtml += (area ? '<span class="dot-sep">·</span>' : '') + freqLabel + ` · racha de ${streak} día${streak === 1 ? '' : 's'}`;
  }

  let streakHtml = '';
  if (task.type === 'recurrente') {
    const days = last7Days();
    streakHtml = '<div class="streak">' + days.map(d => {
      const scheduled = task.days.includes(d.letter);
      const filled = task.history.includes(d.iso);
      const isToday = d.iso === todayISO();
      const cls = ['d'];
      if (filled) cls.push('filled');
      if (isToday) cls.push('today');
      return `<div class="sc"><span class="sl">${d.letter}</span><span class="${cls.join(' ')}" style="${scheduled ? '' : 'opacity:.35'}"></span></div>`;
    }).join('') + '</div>';
  }

  const isDoneToday = task.type === 'puntual' ? task.done : task.history.includes(todayISO());

  el.innerHTML = `
    <div class="check ${isDoneToday ? 'done' : ''}"></div>
    <div class="card-body">
      <div class="task-title ${isDoneToday ? 'done' : ''}">${escapeHtml(task.title)}</div>
      <div class="task-meta ${overdue ? 'overdue' : ''}">${metaHtml}</div>
      ${streakHtml}
    </div>`;

  return el;
}

let completedOpen = false;

function renderHoy() {
  const container = document.getElementById('hoyContent');
  const today = todayISO();
  const letter = todayLetter();

  const overdue = state.tasks.filter(t => t.type === 'puntual' && !t.done && t.date && t.date < today);
  const todayPuntual = state.tasks.filter(t => t.type === 'puntual' && !t.done && t.date === today);
  const todayRecurrente = state.tasks.filter(t => t.type === 'recurrente' && t.days.includes(letter) && !t.history.includes(today));
  const completedPuntual = state.tasks.filter(t => t.type === 'puntual' && t.done && t.completedAt === today);
  const completedRecurrente = state.tasks.filter(t => t.type === 'recurrente' && t.days.includes(letter) && t.history.includes(today));
  const completed = [...completedPuntual, ...completedRecurrente];

  container.innerHTML = '';

  if (overdue.length) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Atrasadas';
    container.appendChild(label);
    overdue.forEach(t => container.appendChild(buildTaskCard(t)));
  }

  const label2 = document.createElement('div');
  label2.className = 'section-label';
  label2.textContent = 'Hoy';
  container.appendChild(label2);

  const activeToday = [...todayPuntual, ...todayRecurrente];
  if (!activeToday.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No tienes nada pendiente para hoy.';
    container.appendChild(empty);
  } else {
    activeToday.forEach(t => container.appendChild(buildTaskCard(t)));
  }

  const toggle = document.createElement('div');
  toggle.className = 'completed-toggle';
  toggle.id = 'completedToggle';
  toggle.innerHTML = `<span>Completadas hoy (${completed.length})</span> <span class="chev">▾</span>`;
  container.appendChild(toggle);

  const completedWrap = document.createElement('div');
  completedWrap.className = 'completed-list';
  completedWrap.id = 'completedList';
  completedWrap.style.display = completedOpen ? 'flex' : 'none';
  toggle.classList.toggle('open', completedOpen);
  completed.forEach(t => completedWrap.appendChild(buildTaskCard(t)));
  container.appendChild(completedWrap);

  toggle.addEventListener('click', () => {
    completedOpen = !completedOpen;
    completedWrap.style.display = completedOpen ? 'flex' : 'none';
    toggle.classList.toggle('open', completedOpen);
  });
}

function renderAreas() {
  const container = document.getElementById('areasContent');
  container.innerHTML = '';
  const today = todayISO();

  state.areas.forEach(area => {
    const tasks = state.tasks.filter(t => t.areaId === area.id && !(t.type === 'puntual' && t.done));
    const group = document.createElement('div');
    group.className = 'area-group';
    group.innerHTML = `
      <div class="area-header">
        <div class="area-swatch" style="background:${area.color}"></div>
        <div class="area-header-name">${escapeHtml(area.name)}</div>
        <div class="area-header-count">${tasks.length} pendiente${tasks.length === 1 ? '' : 's'}</div>
      </div>`;
    tasks.forEach(t => group.appendChild(buildTaskCard(t)));
    container.appendChild(group);
  });

  const sinArea = state.tasks.filter(t => !t.areaId && !(t.type === 'puntual' && t.done));
  if (sinArea.length) {
    const group = document.createElement('div');
    group.className = 'area-group';
    group.innerHTML = `
      <div class="area-header">
        <div class="area-swatch" style="background:var(--text-tertiary)"></div>
        <div class="area-header-name">Sin área</div>
        <div class="area-header-count">${sinArea.length} pendiente${sinArea.length === 1 ? '' : 's'}</div>
      </div>`;
    sinArea.forEach(t => group.appendChild(buildTaskCard(t)));
    container.appendChild(group);
  }
}

function renderBacklog() {
  const list = document.getElementById('backlogList');
  const empty = document.getElementById('backlogEmpty');
  list.innerHTML = '';
  const tasks = state.tasks.filter(t => t.type === 'puntual' && !t.done && t.date === '');
  empty.style.display = tasks.length ? 'none' : 'block';
  tasks.forEach(t => list.appendChild(buildTaskCard(t)));
}

function buildNoteCard(note) {
  const el = document.createElement('div');
  el.className = 'note-card';
  el.dataset.id = note.id;
  if (note.pinned) el.classList.add('pinned');
  el.innerHTML = `
    ${note.title ? `<div class="note-title">${escapeHtml(note.title)}</div>` : ''}
    ${note.text ? `<div class="note-text">${escapeHtml(note.text)}</div>` : ''}
    <div class="note-footer">
      <div class="note-tags">${note.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>
      <span class="note-date">${formatRelative(note.createdAt)}</span>
    </div>
    <div class="note-actions">
      <span class="note-action ${note.pinned ? 'pinned' : ''}" data-action="pin">${note.pinned ? 'Fijada' : 'Fijar'}</span>
      <span class="note-action" data-action="convert">Convertir en tarea</span>
      <span class="note-action danger" data-action="delete">Eliminar</span>
    </div>`;
  return el;
}

function renderNotes() {
  const list = document.getElementById('notesList');
  const empty = document.getElementById('notesEmpty');
  list.innerHTML = '';

  const sorted = [...state.notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  if (sorted.some(n => n.pinned)) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Fijadas';
    list.appendChild(label);
  }

  let switchedToUnpinned = false;
  sorted.forEach(note => {
    if (!note.pinned && !switchedToUnpinned && sorted.some(n => n.pinned)) {
      switchedToUnpinned = true;
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = 'Todas';
      list.appendChild(label);
    }
    list.appendChild(buildNoteCard(note));
  });

  empty.style.display = sorted.length ? 'none' : 'block';
  renderTagFilter();
}

function renderTagFilter() {
  const wrap = document.getElementById('tagFilter');
  const tags = [...new Set(state.notes.flatMap(n => n.tags))].sort();
  const prevActive = wrap.dataset.active || '';
  wrap.innerHTML = `<button type="button" class="chip tag-chip ${!prevActive ? 'active' : ''}" data-tag="">Todas</button>` +
    tags.map(t => `<button type="button" class="chip tag-chip ${prevActive === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('');
}

function render() {
  renderHoy();
  renderAreas();
  renderBacklog();
  renderNotes();
  renderAreaChipSets();
  applyTaskSearch();
  applyNoteFilters();
}

/* ============================================================
   ÁREA CHIPS (compartidas por el formulario de crear y el de editar)
   ============================================================ */

function areaChipsMarkup(selectedId) {
  return state.areas.map(a =>
    `<button type="button" class="chip area-chip ${a.id === selectedId ? 'selected' : ''}" data-area-id="${a.id}" style="--chip-color:${a.color}">${escapeHtml(a.name)}</button>`
  ).join('') + `<button type="button" class="chip area-chip add-area-chip" data-add-area="1">+ Área</button>`;
}

function renderAreaChipSets() {
  document.getElementById('areaChips').innerHTML = areaChipsMarkup(createForm.areaId);
  document.getElementById('editAreaChips').innerHTML = areaChipsMarkup(editForm.areaId);
}

function handleAreaChipClick(container, form, e) {
  const addBtn = e.target.closest('[data-add-area]');
  if (addBtn) {
    const name = prompt('Nombre de la nueva área:');
    if (name && name.trim()) {
      const area = addArea(name);
      form.areaId = area.id;
      renderAreaChipSets();
    }
    return;
  }
  const chip = e.target.closest('.area-chip');
  if (!chip) return;
  const wasSelected = chip.classList.contains('selected');
  form.areaId = wasSelected ? null : chip.dataset.areaId;
  container.querySelectorAll('.area-chip').forEach(c => c.classList.toggle('selected', c.dataset.areaId === form.areaId));
}

/* ============================================================
   FORMULARIO: CREAR TAREA
   ============================================================ */

const createForm = { areaId: null, type: 'puntual', date: 'hoy', customDate: null, days: ['L', 'M', 'X', 'J', 'V', 'S', 'D'] };

const quickInput = document.getElementById('quickAddInput');
const details = document.getElementById('quickAddDetails');
const typeSegs = document.querySelectorAll('#typeSegmented .seg');
const dateRow = document.getElementById('dateRow');
const freqRow = document.getElementById('freqRow');
const dateChips = document.querySelectorAll('#dateChips .chip');
const customDateChip = document.getElementById('customDateChip');
const customDateInput = document.getElementById('customDateInput');
const freqChips = document.querySelectorAll('#freqChips .chip');

quickInput.addEventListener('focus', () => details.classList.add('expanded'));

document.getElementById('areaChips').addEventListener('click', (e) => handleAreaChipClick(document.getElementById('areaChips'), createForm, e));

typeSegs.forEach(seg => seg.addEventListener('click', () => {
  typeSegs.forEach(s => s.classList.remove('active'));
  seg.classList.add('active');
  createForm.type = seg.dataset.type;
  dateRow.style.display = createForm.type === 'puntual' ? 'flex' : 'none';
  freqRow.style.display = createForm.type === 'recurrente' ? 'flex' : 'none';
}));

dateChips.forEach(chip => chip.addEventListener('click', () => {
  dateChips.forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  createForm.date = chip.dataset.date;
  if (chip.dataset.date === 'custom') {
    customDateInput.classList.add('show');
    if (customDateInput.showPicker) { try { customDateInput.showPicker(); } catch (e) { customDateInput.focus(); } }
    else customDateInput.focus();
  } else {
    customDateInput.classList.remove('show');
  }
}));

customDateInput.addEventListener('change', () => {
  if (!customDateInput.value) return;
  createForm.customDate = customDateInput.value;
  createForm.date = 'custom';
  const d = dateFromISO(customDateInput.value);
  customDateChip.textContent = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  dateChips.forEach(c => c.classList.remove('selected'));
  customDateChip.classList.add('selected');
});

freqChips.forEach(chip => chip.addEventListener('click', () => {
  chip.classList.toggle('selected');
  createForm.days = Array.from(freqChips).filter(c => c.classList.contains('selected')).map(c => c.dataset.day);
}));

function resetCreateForm() {
  quickInput.value = '';
  createForm.areaId = null;
  createForm.type = 'puntual';
  createForm.date = 'hoy';
  createForm.customDate = null;
  createForm.days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  typeSegs.forEach(s => s.classList.toggle('active', s.dataset.type === 'puntual'));
  dateRow.style.display = 'flex';
  freqRow.style.display = 'none';
  dateChips.forEach(c => c.classList.toggle('selected', c.dataset.date === 'hoy'));
  customDateChip.textContent = 'Elegir fecha';
  customDateInput.value = '';
  customDateInput.classList.remove('show');
  freqChips.forEach(c => c.classList.add('selected'));
  renderAreaChipSets();
  details.classList.remove('expanded');
  quickInput.blur();
}

document.getElementById('qaCancel').addEventListener('click', resetCreateForm);

function saveTaskFromForm() {
  if (!quickInput.value.trim()) { quickInput.focus(); return; }
  const finalDate = createForm.type === 'puntual' ? resolveFormDate(createForm) : '';
  addTask({
    title: quickInput.value.trim(),
    areaId: createForm.areaId,
    type: createForm.type,
    date: finalDate || '',
    days: createForm.days
  });
  resetCreateForm();
}

document.getElementById('qaSave').addEventListener('click', saveTaskFromForm);
quickInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !quickInput.value.trim()) return;
  saveTaskFromForm();
});

/* ============================================================
   MODAL: EDITAR TAREA
   ============================================================ */

const editForm = { areaId: null, type: 'puntual', date: 'hoy', customDate: null, days: [] };
let editingTaskId = null;

const editBackdrop = document.getElementById('editBackdrop');
const editTitleInput = document.getElementById('editTitleInput');
const editTypeSegs = document.querySelectorAll('#editTypeSegmented .seg');
const editDateRow = document.getElementById('editDateRow');
const editFreqRow = document.getElementById('editFreqRow');
const editDateChips = document.querySelectorAll('#editDateChips .chip');
const editCustomDateChip = document.getElementById('editCustomDateChip');
const editCustomDateInput = document.getElementById('editCustomDateInput');
const editFreqChips = document.querySelectorAll('#editFreqChips .chip');

document.getElementById('editAreaChips').addEventListener('click', (e) => handleAreaChipClick(document.getElementById('editAreaChips'), editForm, e));

function openEditModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;
  editTitleInput.value = task.title;

  editForm.areaId = task.areaId;
  renderAreaChipSets();

  editForm.type = task.type;
  editTypeSegs.forEach(s => s.classList.toggle('active', s.dataset.type === task.type));
  editDateRow.style.display = task.type === 'puntual' ? 'flex' : 'none';
  editFreqRow.style.display = task.type === 'recurrente' ? 'flex' : 'none';

  editCustomDateChip.textContent = 'Elegir fecha';
  editCustomDateInput.classList.remove('show');
  editForm.customDate = null;
  const rawDate = task.date || '';
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  if (rawDate === today) {
    editForm.date = 'hoy';
    editDateChips.forEach(c => c.classList.toggle('selected', c.dataset.date === 'hoy'));
  } else if (rawDate === tomorrow) {
    editForm.date = 'mañana';
    editDateChips.forEach(c => c.classList.toggle('selected', c.dataset.date === 'mañana'));
  } else if (rawDate === '') {
    editForm.date = '';
    editDateChips.forEach(c => c.classList.toggle('selected', c.dataset.date === ''));
  } else {
    editForm.date = 'custom';
    editForm.customDate = rawDate;
    editCustomDateInput.value = rawDate;
    const d = dateFromISO(rawDate);
    editCustomDateChip.textContent = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    editDateChips.forEach(c => c.classList.toggle('selected', c === editCustomDateChip));
  }

  editForm.days = task.days ? [...task.days] : [];
  editFreqChips.forEach(c => c.classList.toggle('selected', editForm.days.includes(c.dataset.day)));

  editBackdrop.classList.add('show');
}

function closeEditModal() {
  editBackdrop.classList.remove('show');
  editingTaskId = null;
}

editTypeSegs.forEach(seg => seg.addEventListener('click', () => {
  editTypeSegs.forEach(s => s.classList.remove('active'));
  seg.classList.add('active');
  editForm.type = seg.dataset.type;
  editDateRow.style.display = editForm.type === 'puntual' ? 'flex' : 'none';
  editFreqRow.style.display = editForm.type === 'recurrente' ? 'flex' : 'none';
}));

editDateChips.forEach(chip => chip.addEventListener('click', () => {
  editDateChips.forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  editForm.date = chip.dataset.date;
  if (chip.dataset.date === 'custom') {
    editCustomDateInput.classList.add('show');
    if (editCustomDateInput.showPicker) { try { editCustomDateInput.showPicker(); } catch (e) { editCustomDateInput.focus(); } }
    else editCustomDateInput.focus();
  } else {
    editCustomDateInput.classList.remove('show');
  }
}));

editCustomDateInput.addEventListener('change', () => {
  if (!editCustomDateInput.value) return;
  editForm.customDate = editCustomDateInput.value;
  editForm.date = 'custom';
  const d = dateFromISO(editCustomDateInput.value);
  editCustomDateChip.textContent = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  editDateChips.forEach(c => c.classList.remove('selected'));
  editCustomDateChip.classList.add('selected');
});

editFreqChips.forEach(chip => chip.addEventListener('click', () => {
  chip.classList.toggle('selected');
  editForm.days = Array.from(editFreqChips).filter(c => c.classList.contains('selected')).map(c => c.dataset.day);
}));

document.getElementById('editCancel').addEventListener('click', closeEditModal);
editBackdrop.addEventListener('click', (e) => { if (e.target === editBackdrop) closeEditModal(); });

document.getElementById('editDelete').addEventListener('click', () => {
  if (!editingTaskId) return;
  const id = editingTaskId;
  closeEditModal();
  deleteTask(id);
});

document.getElementById('editSave').addEventListener('click', () => {
  if (!editingTaskId) return;
  const finalDate = editForm.type === 'puntual' ? resolveFormDate(editForm) : '';
  updateTask(editingTaskId, {
    title: editTitleInput.value.trim() || 'Sin título',
    areaId: editForm.areaId,
    type: editForm.type,
    date: finalDate || '',
    days: editForm.days
  });
  closeEditModal();
});

/* ============================================================
   TARJETAS DE TAREA: abrir edición / marcar hecha (delegación)
   ============================================================ */

document.querySelector('.phone').addEventListener('click', (e) => {
  const check = e.target.closest('.check');
  if (check) {
    const card = check.closest('.card');
    if (card) toggleTaskDone(card.dataset.id);
    return;
  }
  const body = e.target.closest('.card-body');
  if (body) {
    const card = body.closest('.card');
    if (card) openEditModal(card.dataset.id);
  }
});

/* ============================================================
   NOTAS: captura, filtro, búsqueda, fijar/convertir/eliminar
   ============================================================ */

const noteTitleInput = document.getElementById('noteTitleInput');
const noteInput = document.getElementById('noteInput');
const noteSaveBtn = document.getElementById('noteSaveBtn');
const noteSearch = document.getElementById('noteSearch');
let activeTag = '';

function updateNoteSaveVisibility() {
  noteSaveBtn.classList.toggle('show', noteTitleInput.value.trim().length > 0 || noteInput.value.trim().length > 0);
}
noteTitleInput.addEventListener('input', updateNoteSaveVisibility);
noteInput.addEventListener('input', () => {
  noteInput.style.height = 'auto';
  noteInput.style.height = noteInput.scrollHeight + 'px';
  updateNoteSaveVisibility();
});

function saveNoteFromForm() {
  const title = noteTitleInput.value.trim();
  const text = noteInput.value.trim();
  if (!title && !text) return;
  addNote(title, text);
  noteTitleInput.value = '';
  noteInput.value = '';
  noteInput.style.height = 'auto';
  noteSaveBtn.classList.remove('show');
}
noteSaveBtn.addEventListener('click', saveNoteFromForm);
noteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNoteFromForm(); }
});

document.getElementById('tagFilter').addEventListener('click', (e) => {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  activeTag = chip.dataset.tag;
  document.getElementById('tagFilter').dataset.active = activeTag;
  document.querySelectorAll('#tagFilter .tag-chip').forEach(c => c.classList.toggle('active', c.dataset.tag === activeTag));
  applyNoteFilters();
});

function applyNoteFilters() {
  const query = noteSearch.value.trim().toLowerCase();
  document.querySelectorAll('#notesList .note-card').forEach(card => {
    const note = state.notes.find(n => n.id === card.dataset.id);
    if (!note) return;
    const haystack = (note.title + ' ' + note.text + ' ' + note.tags.join(' ')).toLowerCase();
    const matchesTag = !activeTag || note.tags.includes(activeTag);
    const matchesQuery = !query || haystack.includes(query);
    card.style.display = matchesTag && matchesQuery ? '' : 'none';
  });
}
noteSearch.addEventListener('input', applyNoteFilters);

document.getElementById('notesList').addEventListener('click', (e) => {
  const actionEl = e.target.closest('.note-action');
  if (actionEl) {
    e.stopPropagation();
    const card = actionEl.closest('.note-card');
    const id = card.dataset.id;
    if (actionEl.dataset.action === 'pin') togglePinNote(id);
    if (actionEl.dataset.action === 'delete') deleteNote(id);
    if (actionEl.dataset.action === 'convert') {
      const note = state.notes.find(n => n.id === id);
      document.querySelector('.tab[data-tab="hoy"]').click();
      quickInput.value = note.title || note.text.slice(0, 60);
      details.classList.add('expanded');
      quickInput.focus();
      quickInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  const card = e.target.closest('.note-card');
  if (card) card.classList.toggle('expanded');
});

/* ============================================================
   BÚSQUEDA DE TAREAS
   ============================================================ */

document.getElementById('taskSearch').addEventListener('input', applyTaskSearch);
function applyTaskSearch() {
  const q = document.getElementById('taskSearch').value.trim().toLowerCase();
  const activePanel = document.querySelector('.panel.active');
  if (!activePanel) return;
  activePanel.querySelectorAll('.card').forEach(card => {
    const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
    card.style.display = !q || title.includes(q) ? '' : 'none';
  });
}

/* ============================================================
   PESTAÑAS
   ============================================================ */

const taskQuickAddWrap = document.getElementById('taskQuickAddWrap');
const taskSearchWrap = document.getElementById('taskSearchWrap');
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    const isNotas = tab.dataset.tab === 'notas';
    taskQuickAddWrap.style.display = isNotas ? 'none' : 'block';
    taskSearchWrap.style.display = isNotas ? 'none' : 'block';
    document.getElementById('taskSearch').value = '';
    applyTaskSearch();
  });
});

/* ============================================================
   TOAST DE DESHACER
   ============================================================ */

const undoToast = document.getElementById('undoToast');
const toastMessage = document.getElementById('toastMessage');
const toastUndo = document.getElementById('toastUndo');
let toastTimer = null;
function showToast(message, onUndo) {
  toastMessage.textContent = message;
  undoToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => undoToast.classList.remove('show'), 4000);
  toastUndo.onclick = () => {
    undoToast.classList.remove('show');
    clearTimeout(toastTimer);
    if (onUndo) onUndo();
  };
}

/* ============================================================
   BACKUP: EXPORTAR / IMPORTAR
   ============================================================ */

document.getElementById('backupLink').addEventListener('click', () => {
  document.getElementById('backupPanel').classList.toggle('show');
});
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tareas-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.areas || !parsed.tasks || !parsed.notes) throw new Error('formato inválido');
      if (confirm('Esto reemplazará todos tus datos actuales por los del archivo. ¿Continuar?')) {
        state = parsed;
        saveState();
        render();
      }
    } catch (err) {
      alert('No se pudo leer el archivo: formato no válido.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ============================================================
   BLOQUEO DE ZOOM (pellizco y doble-toque)
   El viewport con user-scalable=no ya no es suficiente en
   navegadores modernos, así que se refuerza por JS.
   ============================================================ */

// pellizco (gestos nativos de Safari/iOS)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// pellizco con dos dedos (resto de navegadores)
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// doble-toque para hacer zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

/* ============================================================
   ARRANQUE
   ============================================================ */

document.getElementById('headerDate').textContent =
  new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no registrado', err));
  });
}

render();
