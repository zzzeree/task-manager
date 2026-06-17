'use strict';

// ====================== Константы ======================
const STATUSES = [
  { key: 'new', label: 'Новые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'review', label: 'На проверке' },
  { key: 'done', label: 'Выполнено' },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
const PROGRESS = { new: 0, in_progress: 40, review: 75, done: 100 };
const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const PALETTE = ['#5a63f0', '#7c5cf6', '#18a971', '#e0a312', '#ed5a73', '#3b9af0', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
const VIEWS = ['dashboard', 'board', 'calendar', 'team'];
const VIEW_LABEL = { dashboard: 'Дашборд', board: 'Доска', calendar: 'Календарь', team: 'Команда' };
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// ====================== Состояние ======================
let people = [];
let tasks = [];
let history = [];
let meetings = [];
let notes = {};             // { personId: текст заметок }
let settings = {};          // общие настройки (напр. adminPassHash)
let adminUnlocked = false;  // разблокирован ли экспорт/импорт в этой сессии
let view = 'dashboard';
let personView = '';        // личный режим: id исполнителя или ''
let filters = { q: '', person: '', priority: '', status: '' };
let calMonth = startOfMonth(new Date());
let editingId = null;       // задача в модалке
let modalAssignees = [];    // выбранные исполнители в модалке
let modalType = 'task';     // task | project
let modalLinks = [];
let modalFiles = [];
let modalSubtasks = [];
let meetingId = null;
let meetingParts = [];
let meetingOwner = '';      // '' = общий созвон, иначе id владельца (личный)
let saveTimer = null;

const root = document.getElementById('view-root');
const els = {
  nav: document.getElementById('nav'),
  navMobile: document.getElementById('nav-mobile'),
  toast: document.getElementById('toast'),
  addTaskBtn: document.getElementById('add-task-btn'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  managePeopleBtn: document.getElementById('manage-people-btn'),
  // task modal
  taskModal: document.getElementById('task-modal'),
  taskModalTitle: document.getElementById('task-modal-title'),
  tTitle: document.getElementById('t-title'),
  tDescription: document.getElementById('t-description'),
  tStatus: document.getElementById('t-status'),
  tPriority: document.getElementById('t-priority'),
  tDeadline: document.getElementById('t-deadline'),
  tAssigneeMs: document.getElementById('t-assignee-ms'),
  tAssigneeTrigger: document.getElementById('t-assignee-trigger'),
  tAssigneeLabel: document.getElementById('t-assignee-label'),
  tAssigneePanel: document.getElementById('t-assignee-panel'),
  tDelete: document.getElementById('t-delete'),
  tCancel: document.getElementById('t-cancel'),
  tSave: document.getElementById('t-save'),
  // people modal
  peopleModal: document.getElementById('people-modal'),
  peopleList: document.getElementById('people-list'),
  peopleForm: document.getElementById('people-form'),
  personName: document.getElementById('person-name'),
  personPass: document.getElementById('person-pass'),
  peopleClose: document.getElementById('people-close'),
  // личный режим
  personViewSel: document.getElementById('person-view'),
  // проект
  typeRow: document.getElementById('t-type-row'),
  projectExtra: document.getElementById('t-project-extra'),
  linkInput: document.getElementById('t-link-input'),
  linkAdd: document.getElementById('t-link-add'),
  linksBox: document.getElementById('t-links'),
  filesInput: document.getElementById('t-files'),
  filesList: document.getElementById('t-files-list'),
  subInput: document.getElementById('t-sub-input'),
  subAdd: document.getElementById('t-sub-add'),
  subList: document.getElementById('t-subtasks'),
  subProgress: document.getElementById('t-sub-progress'),
  // созвон
  meetingModal: document.getElementById('meeting-modal'),
  meetingModalTitle: document.getElementById('meeting-modal-title'),
  mScope: document.getElementById('m-scope'),
  mTitle: document.getElementById('m-title'),
  mDate: document.getElementById('m-date'),
  mTime: document.getElementById('m-time'),
  mLink: document.getElementById('m-link'),
  mDescription: document.getElementById('m-description'),
  mAssigneeMs: document.getElementById('m-assignee-ms'),
  mAssigneeTrigger: document.getElementById('m-assignee-trigger'),
  mAssigneeLabel: document.getElementById('m-assignee-label'),
  mAssigneePanel: document.getElementById('m-assignee-panel'),
  mDelete: document.getElementById('m-delete'),
  mCancel: document.getElementById('m-cancel'),
  mSave: document.getElementById('m-save'),
  // окно дня
  dayModal: document.getElementById('day-modal'),
  dayTitle: document.getElementById('day-title'),
  dayBody: document.getElementById('day-body'),
  dayClose: document.getElementById('day-close'),
};

// ====================== Утилиты ======================
function uid() { return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function getPerson(id) { return people.find((p) => p.id === id) || null; }
function taskAssignees(t) { return Array.isArray(t.assigneeIds) ? t.assigneeIds : []; }
function statusOf(t) { return t.status || (t.done ? 'done' : 'new'); }
function isDone(t) { return statusOf(t) === 'done'; }
function progressOf(t) { return PROGRESS[statusOf(t)] ?? 0; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function personColor(p) {
  if (!p) return '#b3b9c6';
  if (p.color) return p.color;
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function avatarHtml(p, size) {
  const cls = 'avatar' + (size ? ' ' + size : '');
  if (!p) return `<span class="${cls}" style="background:#b3b9c6">?</span>`;
  return `<span class="${cls}" style="background:${personColor(p)}" title="${escapeHtml(p.name)}">${escapeHtml(initials(p.name))}</span>`;
}
function assigneesStack(t) {
  const ps = taskAssignees(t).map(getPerson).filter(Boolean);
  if (!ps.length) return '';
  const shown = ps.slice(0, 3).map((p) => avatarHtml(p, 'sm')).join('');
  const extra = ps.length > 3 ? `<span class="avatar sm" style="background:#c4c9d4">+${ps.length - 3}</span>` : '';
  return `<span class="avatar-stack">${shown}${extra}</span>`;
}
function assigneeNames(t) {
  const ns = taskAssignees(t).map(getPerson).filter(Boolean).map((p) => p.name);
  return ns.length ? ns.join(', ') : 'Не назначено';
}
function calAvatars(ids) {
  const ps = (ids || []).map(getPerson).filter(Boolean).slice(0, 2);
  return ps.map((p) => `<span class="avatar xs" style="background:${personColor(p)}">${escapeHtml(initials(p.name))}</span>`).join('');
}
function isProject(t) { return t.type === 'project'; }
function subStats(t) {
  const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
  const done = subs.filter((s) => s.status === 'done').length;
  return { total: subs.length, done };
}
function overdueDays(t) {
  if (!t.deadline) return 0;
  const diff = new Date() - new Date(t.deadline);
  return Math.max(1, Math.floor(diff / 864e5));
}
function tasksForPerson() {
  return personView ? tasks.filter((t) => taskAssignees(t).includes(personView)) : tasks;
}
// Видимость созвонов: «Все» → только общие (без владельца);
// личный режим → общие + личные этого человека.
function meetingsForPerson() {
  return meetings.filter((m) => personView ? (!m.owner || m.owner === personView) : !m.owner);
}
function meetingDateTime(m) { return new Date(m.date + 'T' + (m.time || '00:00')); }

// Лёгкое конфетти при завершении задачи
function celebrate(title) {
  showToast('🎉 Задача выполнена: ' + title);
  const colors = ['#5a63f0', '#7c5cf6', '#18a971', '#e0a312', '#ed5a73', '#3b9af0'];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.background = colors[i % colors.length];
    c.style.left = (20 + Math.random() * 60) + 'vw';
    document.body.appendChild(c);
    const dx = (Math.random() - 0.5) * 320;
    const dy = window.innerHeight * (0.55 + Math.random() * 0.4);
    const rot = (Math.random() - 0.5) * 720;
    c.animate(
      [{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
       { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0.9 }],
      { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(.2,.6,.3,1)' }
    ).onfinish = () => c.remove();
  }
}

function deadlineInfo(deadline, done) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (isNaN(due)) return null;
  const diff = due - new Date();
  let state = 'normal';
  if (!done && diff < 0) state = 'overdue';
  else if (!done && diff / 36e5 <= 24) state = 'soon';
  const text = due.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return { state, text, due };
}
function isToday(d) { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); }
function isOverdue(t) { if (isDone(t) || !t.deadline) return false; return new Date(t.deadline) < new Date(); }
function isDueToday(t) { if (!t.deadline) return false; const d = new Date(t.deadline); return isToday(d); }

function relTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  if (isToday(d)) return 'сегодня ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ====================== Данные ======================
// Офлайн (файл открыт напрямую) — храним в браузере; иначе — на сервере.
const OFFLINE = location.protocol === 'file:';
const STORAGE_KEY = 'task-manager-tasks';

async function loadData() {
  if (OFFLINE) {
    try { applyData(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch (e) { people = []; tasks = []; history = []; }
    render();
    startReminders();
    return;
  }
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyData(await res.json());
  } catch (e) { showToast('Не удалось загрузить данные'); people = []; tasks = []; history = []; }
  render();
  startReminders();
}
function applyData(data) {
  if (Array.isArray(data)) { people = []; tasks = data; history = []; meetings = []; notes = {}; settings = {}; }
  else if (data && typeof data === 'object') {
    people = Array.isArray(data.people) ? data.people : [];
    tasks = Array.isArray(data.tasks) ? data.tasks : [];
    history = Array.isArray(data.history) ? data.history : [];
    meetings = Array.isArray(data.meetings) ? data.meetings : [];
    notes = (data.notes && typeof data.notes === 'object') ? data.notes : {};
    settings = (data.settings && typeof data.settings === 'object') ? data.settings : {};
  } else { people = []; tasks = []; history = []; meetings = []; notes = {}; settings = {}; }
  // миграции
  people.forEach((p, i) => { if (!p.color) p.color = PALETTE[i % PALETTE.length]; });
  tasks.forEach((t) => {
    if (!Array.isArray(t.assigneeIds)) t.assigneeIds = t.assigneeId ? [t.assigneeId] : [];
    delete t.assigneeId;
    if (!t.status) t.status = t.done ? 'done' : 'new';
    t.done = t.status === 'done';
    if (!t.type) t.type = 'task';
    if (!Array.isArray(t.links)) t.links = [];
    if (!Array.isArray(t.files)) t.files = [];
    if (!Array.isArray(t.subtasks)) t.subtasks = [];
  });
  meetings.forEach((m) => { if (!m.owner) m.owner = ''; if (!Array.isArray(m.participantIds)) m.participantIds = []; });
}
function save() {
  if (OFFLINE) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ people, tasks, history, meetings, notes, settings })); }
    catch (e) { showToast('Не удалось сохранить'); }
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people, tasks, history, meetings, notes, settings }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) { showToast('Ошибка сохранения'); }
  }, 200);
}
function logEvent(text) {
  const who = personView ? (getPerson(personView) ? getPerson(personView).name : '') : '';
  history.unshift({ id: uid(), ts: new Date().toISOString(), text, who });
  if (history.length > 80) history.length = 80;
}

// ====================== Действия с задачами ======================
function setStatus(id, status) {
  const t = tasks.find((x) => x.id === id);
  if (!t || statusOf(t) === status) return;
  const from = STATUS_LABEL[statusOf(t)];
  t.status = status;
  t.done = status === 'done';
  logEvent(`Статус «${t.title}»: ${from} → ${STATUS_LABEL[status]}`);
  if (status === 'done') celebrate(t.title);
  save();
  render();
}
function deleteTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  tasks = tasks.filter((x) => x.id !== id);
  logEvent(`Удалена задача «${t.title}»`);
  save();
}

// ====================== Фильтрация ======================
function filteredTasks(opts) {
  opts = opts || {};
  const q = filters.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (personView && !taskAssignees(t).includes(personView)) return false;
    if (q && !(t.title + ' ' + (t.description || '')).toLowerCase().includes(q)) return false;
    if (filters.person && !taskAssignees(t).includes(filters.person)) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (opts.useStatus && filters.status && statusOf(t) !== filters.status) return false;
    return true;
  });
}
function activeFiltersCount() {
  let n = 0;
  if (filters.q) n++; if (filters.person) n++; if (filters.priority) n++; if (filters.status) n++;
  return n;
}

// ====================== Рендер: каркас ======================
function render() {
  renderPersonViewSelect();
  root.className = 'view-root' + (view === 'calendar' ? ' wide' : '');
  [...els.nav.children].forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  [...els.navMobile.children].forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  if (view === 'board') renderBoard();
  else if (view === 'calendar') renderCalendar();
  else if (view === 'team') renderTeam();
  else renderDashboard();
}

function renderPersonViewSelect() {
  const cur = personView;
  els.personViewSel.innerHTML = `<option value="">👁 Все</option>` +
    people.map((p) => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>👤 ${escapeHtml(p.name)}</option>`).join('');
  els.personViewSel.classList.toggle('active', !!personView);
}
const unlockedPersons = new Set();
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(36);
}
function setPersonView(id) {
  if (id) {
    const p = getPerson(id);
    if (p && p.passHash && !unlockedPersons.has(id)) {
      const entry = prompt(`🔒 Кабинет «${p.name}» защищён паролем.\nВведите пароль:`);
      if (entry === null) { renderPersonViewSelect(); return; }
      if (hashStr(entry) !== p.passHash) { showToast('Неверный пароль'); renderPersonViewSelect(); return; }
      unlockedPersons.add(id);
    }
  }
  personView = id || '';
  render();
}
// Пароль на экспорт/импорт (общий «админ-пароль»)
function requireAdmin() {
  if (adminUnlocked) return true;
  if (!settings.adminPassHash) {
    const set = prompt('💾 / ⬆ Эти кнопки выгружают и загружают ВСЕ данные.\nЗащитите их паролем — придумайте его (пусто — без защиты):', '');
    if (set === null) return false;
    if (set.trim()) { settings.adminPassHash = hashStr(set); save(); showToast('Пароль установлен'); }
    adminUnlocked = true;
    return true;
  }
  const entry = prompt('🔒 Введите пароль для экспорта/импорта:');
  if (entry === null) return false;
  if (hashStr(entry) !== settings.adminPassHash) { showToast('Неверный пароль'); return false; }
  adminUnlocked = true;
  return true;
}
// Установить / снять / сменить пароль участника
function setPersonPassword(id) {
  const p = getPerson(id);
  if (!p) return;
  // чтобы сменить/снять пароль — нужно знать текущий
  if (p.passHash) {
    const cur = prompt(`🔒 Кабинет «${p.name}» защищён.\nВведите текущий пароль, чтобы изменить его:`);
    if (cur === null) return;
    if (hashStr(cur) !== p.passHash) { showToast('Неверный пароль'); return; }
  }
  const entry = prompt(`Новый пароль для «${p.name}» (пусто — снять защиту):`, '');
  if (entry === null) return;
  if (entry.trim() === '') {
    delete p.passHash; unlockedPersons.delete(id);
    logEvent(`Снят пароль кабинета «${p.name}»`);
    showToast('Пароль снят');
  } else {
    p.passHash = hashStr(entry); unlockedPersons.add(id);
    logEvent(`Изменён пароль кабинета «${p.name}»`);
    showToast('Пароль установлен');
  }
  save();
  renderPeopleModal();
}
function personBannerHtml() {
  if (!personView) return '';
  const p = getPerson(personView);
  if (!p) return '';
  return `<div class="person-banner">${avatarHtml(p, 'lg')}
    <div><div class="pb-name">${escapeHtml(p.name)}</div><div class="pb-sub">Личный рабочий экран</div></div>
    <button id="exit-person">Показать всех</button></div>`;
}

// ---------- Карточка задачи ----------
function taskCardHtml(t, opts) {
  opts = opts || {};
  const st = statusOf(t);
  const dl = deadlineInfo(t.deadline, isDone(t));
  const dlChip = dl ? `<span class="chip-mini chip-deadline ${dl.state}">⏰ ${dl.text}</span>` : '';
  const statusChip = opts.compact ? '' : `<span class="chip-mini chip-status ${st}">${STATUS_LABEL[st]}</span>`;
  const desc = t.description ? `<div class="tc-desc">${escapeHtml(t.description)}</div>` : '';
  const ss = subStats(t);
  const typeBadge = isProject(t) ? `<span class="tc-type">📁 Проект${ss.total ? ' · ✓' + ss.done + '/' + ss.total : ''}</span>` : '';
  const prog = isProject(t) && ss.total ? Math.round((ss.done / ss.total) * 100) : progressOf(t);
  const progBar = `<div class="tc-progress"><i style="width:${prog}%"></i></div>`;
  const drag = opts.draggable ? ` draggable="true"` : '';
  return `
    <div class="task-card${isDone(t) ? ' is-done' : ''}" data-id="${t.id}"${drag}>
      <div class="tc-top">
        <span class="tc-prio ${t.priority}" title="${PRIORITY_LABEL[t.priority]}"></span>
        <div class="tc-title">${escapeHtml(t.title)}</div>
      </div>
      ${desc}
      <div class="tc-foot">
        ${typeBadge}
        ${statusChip}
        ${dlChip}
        <span class="tc-spacer"></span>
        ${assigneesStack(t)}
      </div>
      ${progBar}
    </div>`;
}

// ---------- Дашборд ----------
function renderDashboard() {
  const scope = tasksForPerson();
  const total = scope.length;
  const done = scope.filter(isDone).length;
  const overdueList = scope.filter(isOverdue).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const today = scope.filter((t) => isDueToday(t) && !isDone(t)).length;
  const donePct = total ? Math.round((done / total) * 100) : 0;
  const headTitle = personView ? 'Мой обзор' : 'Обзор проекта';

  const upcoming = scope
    .filter((t) => t.deadline && !isDone(t))
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 6);

  const workload = people
    .map((p) => ({ p, active: tasks.filter((t) => taskAssignees(t).includes(p.id) && !isDone(t)).length }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 5);
  const recent = history.slice(0, 7);

  // созвоны (личные или все), будущие/сегодня
  const now = new Date();
  const upMeetings = meetingsForPerson()
    .filter((m) => m.date && meetingDateTime(m) >= new Date(now.toDateString()))
    .sort((a, b) => meetingDateTime(a) - meetingDateTime(b))
    .slice(0, 6);

  const overdueWidget = `
    <div class="panel" style="margin-bottom:14px">
      <div class="panel-title">🔴 Просрочено</div>
      ${overdueList.length ? overdueList.slice(0, 8).map((t) => `
        <div class="overdue-item" data-open="${t.id}" style="cursor:pointer">
          <span class="tc-prio ${t.priority}"></span>
          <div class="row-main"><div class="row-title">${escapeHtml(t.title)}</div>
          <div class="row-sub">👤 ${escapeHtml(assigneeNames(t))} · дедлайн ${deadlineInfo(t.deadline, false).text}</div></div>
          <span class="od-days">${overdueDays(t)} дн.</span>
        </div>`).join('') : '<div class="empty-hint">Просроченных задач нет 👍</div>'}
    </div>`;

  const meetingsPanel = `
    <div class="panel">
      <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>📞 Созвоны${personView ? ' (личные + общие)' : ''}</span>
        <button class="btn btn-soft" id="dash-add-meeting" style="padding:5px 12px;font-size:12px">＋ Созвон</button>
      </div>
      ${upMeetings.length ? upMeetings.map((m) => {
        const dt = meetingDateTime(m);
        const when = (isToday(dt) ? 'Сегодня' : dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })) + (m.time ? ' ' + m.time : '');
        return `<div class="row-item" data-meet="${m.id}" style="cursor:pointer">
          <span class="tc-prio low"></span>
          <div class="row-main"><div class="row-title">${escapeHtml(m.title)}</div>
          <div class="row-sub">${(m.participantIds || []).map(getPerson).filter(Boolean).map((p) => p.name).join(', ') || 'без участников'}</div></div>
          <span class="chip-mini${isToday(dt) ? ' chip-deadline soon' : ''}">${when}</span>
        </div>`;
      }).join('') : '<div class="empty-hint">Нет запланированных созвонов</div>'}
    </div>`;

  const notesPanel = personView ? `
    <div class="panel">
      <div class="panel-title">📝 Мои заметки</div>
      <textarea class="notes-area" id="notes-area" placeholder="Личные заметки: что подготовить, кому написать…">${escapeHtml(notes[personView] || '')}</textarea>
      <div class="notes-foot">
        <span class="notes-saved" id="notes-saved"></span>
        <button class="btn btn-primary notes-save-btn" id="notes-save">Сохранить</button>
      </div>
    </div>` : '';

  const myTasksPanel = personView ? `
    <div class="panel" style="margin-bottom:14px">
      <div class="panel-title">🗂️ Мои задачи (${scope.length})</div>
      <div class="progress-wrap" style="margin-bottom:14px">
        <div class="progress-bar"><div class="progress-fill" style="width:${donePct}%"></div></div>
        <div class="progress-pct">${donePct}%</div>
      </div>
      ${scope.length
        ? `<div class="task-rows">${[...scope].sort((a, b) => {
            if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
            const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
            const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
            return da - db;
          }).map((t) => taskCardHtml(t, { compact: false })).join('')}</div>`
        : '<div class="empty-hint">Задач пока нет</div>'}
    </div>` : '';

  root.innerHTML = `
    ${personBannerHtml()}
    <div class="view-head"><div><div class="view-title">${headTitle}</div><div class="view-sub">${personView ? 'Только ваши задачи, дедлайны и созвоны' : 'Текущее состояние задач и команды'}</div></div></div>
    <div class="stat-grid">
      <div class="stat accent"><div class="stat-num">${total}</div><div class="stat-label">${personView ? 'Моих задач' : 'Всего задач'}</div></div>
      <div class="stat green"><div class="stat-num">${done}</div><div class="stat-label">Выполнено</div></div>
      <div class="stat red"><div class="stat-num">${overdueList.length}</div><div class="stat-label">Просрочено</div></div>
      <div class="stat yellow"><div class="stat-num">${today}</div><div class="stat-label">Дедлайн сегодня</div></div>
    </div>
    ${personView ? '' : `<div class="panel" style="margin-bottom:14px">
      <div class="panel-title">Прогресс проекта</div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${donePct}%"></div></div>
        <div class="progress-pct">${donePct}%</div>
      </div>
      <div class="view-sub">${done} из ${total} задач выполнено</div>
    </div>`}
    ${myTasksPanel}
    ${overdueWidget}
    <div class="dash-grid">
      <div>
        <div class="panel">
          <div class="panel-title">Ближайшие дедлайны</div>
          ${upcoming.length ? upcoming.map((t) => {
            const dl = deadlineInfo(t.deadline, false);
            return `<div class="row-item" data-open="${t.id}" style="cursor:pointer">
              <span class="tc-prio ${t.priority}"></span>
              <div class="row-main"><div class="row-title">${escapeHtml(t.title)}</div>
              <div class="row-sub">${STATUS_LABEL[statusOf(t)]} · 👤 ${escapeHtml(assigneeNames(t))}</div></div>
              ${assigneesStack(t)}
              <span class="chip-mini chip-deadline ${dl.state}">${dl.text}</span>
            </div>`;
          }).join('') : '<div class="empty-hint">Нет активных задач с дедлайном</div>'}
        </div>
        ${notesPanel}
      </div>
      <div>
        ${meetingsPanel}
        ${personView ? '' : `<div class="panel">
          <div class="panel-title">Загрузка команды</div>
          ${workload.length ? workload.map((w) => `
            <div class="row-item">
              ${avatarHtml(w.p)}
              <div class="row-main"><div class="row-title">${escapeHtml(w.p.name)}</div></div>
              <span class="row-sub">${w.active} в работе</span>
            </div>`).join('') : '<div class="empty-hint">Добавьте участников команды</div>'}
        </div>`}
        <div class="panel">
          <div class="panel-title">Последние изменения</div>
          ${recent.length ? recent.map((h) => `
            <div class="history-item"><span class="history-dot"></span>
            <div class="row-main">${h.who ? '<b>' + escapeHtml(h.who) + '</b> · ' : ''}${escapeHtml(h.text)}</div>
            <span class="history-time">${relTime(h.ts)}</span></div>`).join('') : '<div class="empty-hint">Пока нет событий</div>'}
        </div>
      </div>
    </div>`;

  const exitBtn = document.getElementById('exit-person');
  if (exitBtn) exitBtn.onclick = () => setPersonView('');
  const am = document.getElementById('dash-add-meeting');
  if (am) am.onclick = () => openMeetingModal(null);
  const na = document.getElementById('notes-area');
  const nsave = document.getElementById('notes-save');
  if (na) {
    na.addEventListener('input', () => {
      notes[personView] = na.value;
      const saved = document.getElementById('notes-saved');
      if (saved) saved.textContent = '● не сохранено';
    });
  }
  if (nsave) {
    nsave.addEventListener('click', () => {
      notes[personView] = na.value;
      save();
      const saved = document.getElementById('notes-saved');
      if (saved) saved.textContent = '✓ Сохранено';
      showToast('Заметки сохранены');
    });
  }
}

// ---------- Фильтр-бар ----------
function filterbarHtml(withStatus) {
  const opt = (val, label, cur) => `<option value="${val}"${cur === val ? ' selected' : ''}>${label}</option>`;
  return `
    <div class="filterbar">
      <div class="search-box"><input type="text" id="f-search" class="input" placeholder="Поиск по названию…" value="${escapeHtml(filters.q)}" /></div>
      <select id="f-person">${opt('', 'Все исполнители', filters.person)}${people.map((p) => opt(p.id, p.name, filters.person)).join('')}</select>
      <select id="f-priority">${opt('', 'Любой приоритет', filters.priority)}${['high','medium','low'].map((p) => opt(p, PRIORITY_LABEL[p], filters.priority)).join('')}</select>
      ${withStatus ? `<select id="f-status">${opt('', 'Любой статус', filters.status)}${STATUSES.map((s) => opt(s.key, s.label, filters.status)).join('')}</select>` : ''}
      ${activeFiltersCount() ? '<button class="clear-filters" id="f-clear">Сбросить</button>' : ''}
    </div>`;
}
function wireFilterbar() {
  const s = document.getElementById('f-search');
  if (s) s.oninput = () => { filters.q = s.value; renderInPlace(); };
  const p = document.getElementById('f-person');
  if (p) p.onchange = () => { filters.person = p.value; render(); };
  const pr = document.getElementById('f-priority');
  if (pr) pr.onchange = () => { filters.priority = pr.value; render(); };
  const st = document.getElementById('f-status');
  if (st) st.onchange = () => { filters.status = st.value; render(); };
  const c = document.getElementById('f-clear');
  if (c) c.onclick = () => { filters = { q: '', person: '', priority: '', status: '' }; render(); };
}
// перерисовать только содержимое (чтобы поле поиска не теряло фокус)
let renderInPlaceTimer = null;
function renderInPlace() {
  clearTimeout(renderInPlaceTimer);
  renderInPlaceTimer = setTimeout(() => {
    const active = document.activeElement;
    const wasSearch = active && active.id === 'f-search';
    const pos = wasSearch ? active.selectionStart : null;
    render();
    if (wasSearch) {
      const s = document.getElementById('f-search');
      if (s) { s.focus(); if (pos != null) s.setSelectionRange(pos, pos); }
    }
  }, 120);
}

// ---------- Доска (Kanban) ----------
function renderBoard() {
  const list = filteredTasks({ useStatus: false });
  const cols = STATUSES.map((s) => {
    const items = list.filter((t) => statusOf(t) === s.key);
    return `
      <div class="column" data-status="${s.key}">
        <div class="col-head">
          <span class="col-dot ${s.key}"></span>
          <span class="col-name">${s.label}</span>
          <span class="col-count">${items.length}</span>
        </div>
        <div class="col-body" data-status="${s.key}">
          ${items.map((t) => taskCardHtml(t, { compact: true, draggable: true })).join('') || '<div class="col-empty">Перетащите сюда</div>'}
        </div>
      </div>`;
  }).join('');
  root.innerHTML = `
    ${personBannerHtml()}
    <div class="view-head"><div class="view-title">Доска</div></div>
    ${filterbarHtml(false)}
    <div class="board">${cols}</div>`;
  const exitBtn = document.getElementById('exit-person');
  if (exitBtn) exitBtn.onclick = () => setPersonView('');
  wireFilterbar();
  wireBoardDnd();
}

let dragTaskId = null;
function wireBoardDnd() {
  root.querySelectorAll('.col-body .task-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => { dragTaskId = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; startAutoScroll(); });
    card.addEventListener('dragend', () => { dragTaskId = null; card.classList.remove('dragging'); root.querySelectorAll('.column.drop-hint').forEach((c) => c.classList.remove('drop-hint')); stopAutoScroll(); });
  });
  root.querySelectorAll('.column').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-hint'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-hint'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-hint');
      if (dragTaskId) setStatus(dragTaskId, col.dataset.status);
    });
  });
}

// Автопрокрутка страницы при перетаскивании к верх/низ краю экрана
let autoScrollDir = 0;
let autoScrollRAF = null;
function autoScrollOnDrag(e) {
  const m = 100;
  if (e.clientY < m) autoScrollDir = -1;
  else if (e.clientY > window.innerHeight - m) autoScrollDir = 1;
  else autoScrollDir = 0;
}
function autoScrollTick() {
  if (autoScrollDir !== 0) window.scrollBy(0, autoScrollDir * 13);
  autoScrollRAF = requestAnimationFrame(autoScrollTick);
}
function startAutoScroll() {
  document.addEventListener('dragover', autoScrollOnDrag);
  if (autoScrollRAF == null) autoScrollRAF = requestAnimationFrame(autoScrollTick);
}
function stopAutoScroll() {
  autoScrollDir = 0;
  document.removeEventListener('dragover', autoScrollOnDrag);
  if (autoScrollRAF != null) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
}

// ---------- Список ----------
function renderList() {
  const list = filteredTasks({ useStatus: true });
  root.innerHTML = `
    <div class="view-head"><div class="view-title">Список задач</div><div class="view-sub">${list.length} задач(и)</div></div>
    ${filterbarHtml(true)}
    ${list.length
      ? `<div class="task-rows">${list.map((t) => taskCardHtml(t, { compact: false })).join('')}</div>`
      : `<div class="empty-state"><div class="big">🗒️</div>${tasks.length ? 'Ничего не найдено по фильтрам' : 'Задач пока нет — нажмите «＋ Задача»'}</div>`}`;
  wireFilterbar();
}

// ---------- Календарь ----------
function renderCalendar() {
  const first = startOfMonth(calMonth);
  const year = first.getFullYear(), month = first.getMonth();
  const offset = (first.getDay() + 6) % 7; // Пн = 0
  const daysIn = new Date(year, month + 1, 0).getDate();

  // карта по датам: задачи (по дедлайну) + созвоны
  const byDate = {};
  tasksForPerson().forEach((t) => { if (t.deadline) { const k = dateKey(new Date(t.deadline)); (byDate[k] = byDate[k] || []).push({ kind: 'task', t }); } });
  meetingsForPerson().forEach((m) => { if (m.date) { (byDate[m.date] = byDate[m.date] || []).push({ kind: 'meeting', m }); } });

  const todayStart = new Date(new Date().toDateString());
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(year, month, d);
    const k = dateKey(date);
    const items = byDate[k] || [];
    const today = isToday(date) ? ' today' : '';
    const pills = items.slice(0, 2).map((it) => {
      if (it.kind === 'meeting') return `<div class="cal-pill meeting"><span class="cal-av">${calAvatars(it.m.participantIds || [])}</span><span class="cal-tt">${escapeHtml(it.m.title)}</span></div>`;
      const t = it.t;
      const cls = isDone(t) ? 'done' : (date < todayStart ? 'overdue' : '');
      const glyph = isProject(t) ? '👥' : '👤';
      return `<div class="cal-pill ${cls}"><span class="cal-av">${calAvatars(taskAssignees(t))}</span><span class="cal-tt">${glyph} ${escapeHtml(t.title)}</span></div>`;
    }).join('');
    const more = items.length > 2 ? `<div class="cal-more">ещё ${items.length - 2}</div>` : '';
    cells += `<div class="cal-cell${today}" data-day="${k}" data-count="${items.length || ''}"><div class="cal-date">${d}</div>${pills}${more}</div>`;
  }

  root.innerHTML = `
    ${personBannerHtml()}
    <div class="cal-topbar">
      <div class="cal-title-group">
        <span class="view-title">Календарь</span>
        <div class="cal-monthnav">
          <button class="cal-nav" id="cal-prev">‹</button>
          <span class="cal-month-lbl">${MONTHS[month]} ${year}</span>
          <button class="cal-nav" id="cal-next">›</button>
        </div>
      </div>
      <div class="cal-actions">
        <button class="btn btn-soft" id="cal-today">Сегодня</button>
        <button class="btn btn-primary" id="cal-add-task">＋ Добавить задачу</button>
      </div>
    </div>
    <div class="cal-grid">
      ${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>`;
  document.getElementById('cal-prev').onclick = () => { calMonth = new Date(year, month - 1, 1); renderCalendar(); };
  document.getElementById('cal-next').onclick = () => { calMonth = new Date(year, month + 1, 1); renderCalendar(); };
  document.getElementById('cal-today').onclick = () => { calMonth = startOfMonth(new Date()); renderCalendar(); };
  document.getElementById('cal-add-task').onclick = () => openTaskModal(null);
  const exitBtn = document.getElementById('exit-person');
  if (exitBtn) exitBtn.onclick = () => setPersonView('');
}

// ---------- Команда ----------
function renderTeam() {
  root.innerHTML = `
    <div class="view-head">
      <div class="view-title">Команда</div>
      <button class="btn btn-soft" id="team-manage">Управление</button>
    </div>
    ${people.length
      ? `<div class="team-grid">${people.map((p) => {
          const all = tasks.filter((t) => taskAssignees(t).includes(p.id));
          const done = all.filter(isDone).length;
          const prog = all.filter((t) => statusOf(t) === 'in_progress').length;
          const active = all.length - done;
          const pct = all.length ? Math.round((done / all.length) * 100) : 0;
          return `
            <div class="member" data-person="${p.id}" draggable="true">
              <span class="member-drag" title="Перетащите, чтобы поменять местами">⠿</span>
              <div class="member-head">${avatarHtml(p, 'lg')}<div><div class="member-name">${escapeHtml(p.name)}</div><div class="member-role">${all.length} задач(и)</div></div></div>
              <div class="member-stats">
                <div class="member-stat"><b>${active}</b><span>Активные</span></div>
                <div class="member-stat"><b>${prog}</b><span>В работе</span></div>
                <div class="member-stat"><b>${done}</b><span>Готово</span></div>
              </div>
              <div class="member-load"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>
            </div>`;
        }).join('')}</div>`
      : `<div class="empty-state"><div class="big">👥</div>Команда пуста — нажмите «Управление», чтобы добавить участников</div>`}`;
  document.getElementById('team-manage').onclick = openPeopleModal;
  wireTeamDnd();
}

let dragPersonId = null;
function wireTeamDnd() {
  root.querySelectorAll('.member[data-person]').forEach((m) => {
    m.addEventListener('dragstart', (e) => { dragPersonId = m.dataset.person; m.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; startAutoScroll(); });
    m.addEventListener('dragend', () => { dragPersonId = null; m.classList.remove('dragging'); root.querySelectorAll('.member.drop-hint').forEach((x) => x.classList.remove('drop-hint')); stopAutoScroll(); });
    m.addEventListener('dragover', (e) => { e.preventDefault(); if (m.dataset.person !== dragPersonId) m.classList.add('drop-hint'); });
    m.addEventListener('dragleave', () => m.classList.remove('drop-hint'));
    m.addEventListener('drop', (e) => { e.preventDefault(); m.classList.remove('drop-hint'); if (dragPersonId && dragPersonId !== m.dataset.person) reorderPeople(dragPersonId, m.dataset.person); });
  });
}

// ====================== Модалка задачи ======================
function openTaskModal(id, prefill) {
  editingId = id || null;
  const t = id ? tasks.find((x) => x.id === id) : null;
  els.tTitle.value = t ? t.title : '';
  els.tDescription.value = t ? (t.description || '') : '';
  els.tStatus.value = t ? statusOf(t) : 'new';
  els.tPriority.value = t ? t.priority : 'medium';
  els.tDeadline.value = t ? (t.deadline || '') : (prefill && prefill.deadline ? prefill.deadline : '');
  modalAssignees = t ? [...taskAssignees(t)] : (personView ? [personView] : []);
  modalType = t ? (t.type || 'task') : 'task';
  modalLinks = t ? [...(t.links || [])] : [];
  modalFiles = t ? [...(t.files || [])] : [];
  modalSubtasks = t ? (t.subtasks || []).map((s) => ({ ...s })) : [];
  renderModalAssignees();
  applyTypeUI();
  els.tDelete.hidden = !t;
  els.taskModal.hidden = false;
  els.tTitle.focus();
}
function applyTypeUI() {
  [...els.typeRow.children].forEach((b) => b.classList.toggle('is-on', b.dataset.type === modalType));
  const isProj = modalType === 'project';
  els.projectExtra.hidden = !isProj;
  els.tTitle.placeholder = isProj ? 'Название проекта' : 'Название задачи';
  els.taskModalTitle.textContent = editingId ? (isProj ? 'Проект' : 'Задача') : (isProj ? 'Новый проект' : 'Новая задача');
  if (isProj) { renderLinks(); renderFiles(); renderSubtasks(); }
}

// ---- ссылки ----
function renderLinks() {
  els.linksBox.innerHTML = modalLinks.map((url, i) =>
    `<div class="link-chip">🔗 <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a><button data-li="${i}" title="Убрать">×</button></div>`
  ).join('');
}
function addLink() {
  let v = els.linkInput.value.trim();
  if (!v) return;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  modalLinks.push(v);
  els.linkInput.value = '';
  renderLinks();
}

// ---- файлы / фото ----
function renderFiles() {
  els.filesList.innerHTML = modalFiles.map((f, i) => {
    const thumb = (f.type || '').startsWith('image/')
      ? `<img class="thumb" src="${f.dataUrl}" alt="">`
      : `<div class="thumb">📄</div>`;
    return `<div class="file-card">${thumb}<div class="fname" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div><button data-fi="${i}" title="Убрать">×</button></div>`;
  }).join('');
}
function handleFiles(fileList) {
  const files = [...fileList];
  files.forEach((file) => {
    if (file.size > 1.6 * 1024 * 1024) { showToast(`«${file.name}» больше 1.5 МБ — пропущен`); return; }
    const reader = new FileReader();
    reader.onload = () => { modalFiles.push({ name: file.name, type: file.type, dataUrl: reader.result }); renderFiles(); };
    reader.readAsDataURL(file);
  });
}

// ---- подзадачи ----
function renderSubtasks() {
  const ss = subStats({ subtasks: modalSubtasks });
  els.subProgress.textContent = ss.total ? `✓ ${ss.done}/${ss.total}` : '';
  if (!modalSubtasks.length) { els.subList.innerHTML = '<div class="empty-hint" style="padding:4px 2px">Пока нет подзадач</div>'; return; }
  const opt = (v, l, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`;
  els.subList.innerHTML = modalSubtasks.map((s, i) => `
    <div class="sub-row${s.status === 'done' ? ' done' : ''}" data-i="${i}">
      <div class="sr-top">
        <input type="checkbox" class="sr-check" data-i="${i}" ${s.status === 'done' ? 'checked' : ''} />
        <input type="text" class="sr-title" data-i="${i}" data-f="title" value="${escapeHtml(s.title)}" placeholder="Подзадача" />
        <button class="sr-del" data-del="${i}" title="Удалить">🗑</button>
      </div>
      <div class="sr-fields">
        <select data-i="${i}" data-f="assigneeId">${opt('', '— исполнитель —', s.assigneeId || '')}${people.map((p) => opt(p.id, p.name, s.assigneeId || '')).join('')}</select>
        <select data-i="${i}" data-f="priority">${['low','medium','high'].map((p) => opt(p, PRIORITY_LABEL[p], s.priority || 'medium')).join('')}</select>
        <select data-i="${i}" data-f="status">${STATUSES.map((x) => opt(x.key, x.label, s.status || 'new')).join('')}</select>
        <input type="datetime-local" data-i="${i}" data-f="deadline" value="${s.deadline || ''}" />
        <input type="text" data-i="${i}" data-f="description" value="${escapeHtml(s.description || '')}" placeholder="Описание" style="grid-column:span 2" />
      </div>
    </div>`).join('');
}
function addSubtask() {
  const v = els.subInput.value.trim();
  if (!v) return;
  modalSubtasks.push({ id: uid(), title: v, description: '', assigneeId: '', deadline: '', priority: 'medium', status: 'new' });
  els.subInput.value = '';
  renderSubtasks();
}
function closeTaskModal() { els.taskModal.hidden = true; editingId = null; closeMsPanel(); }
function saveTask() {
  const title = els.tTitle.value.trim();
  if (!title) { showToast('Введите название'); return; }
  const status = els.tStatus.value;
  const kind = modalType === 'project' ? 'проект' : 'задача';
  let justDone = false;
  if (editingId) {
    const t = tasks.find((x) => x.id === editingId);
    if (!t) return closeTaskModal();
    const prevStatus = statusOf(t), prevDl = t.deadline || '';
    t.title = title;
    t.description = els.tDescription.value.trim();
    t.status = status; t.done = status === 'done';
    t.priority = els.tPriority.value;
    t.deadline = els.tDeadline.value || null;
    t.assigneeIds = [...modalAssignees];
    t.type = modalType;
    t.links = [...modalLinks];
    t.files = [...modalFiles];
    t.subtasks = modalSubtasks.map((s) => ({ ...s }));
    let logged = false;
    if (prevStatus !== status) { logEvent(`Статус «${title}»: ${STATUS_LABEL[prevStatus]} → ${STATUS_LABEL[status]}`); logged = true; }
    if (prevDl !== (t.deadline || '')) { logEvent(`Изменён дедлайн: «${title}»`); logged = true; }
    if (!logged) logEvent(`Изменён${modalType === 'project' ? ' проект' : 'а задача'} «${title}»`);
    justDone = status === 'done' && prevStatus !== 'done';
  } else {
    tasks.unshift({
      id: uid(), title,
      description: els.tDescription.value.trim(),
      status, done: status === 'done',
      priority: els.tPriority.value,
      deadline: els.tDeadline.value || null,
      assigneeIds: [...modalAssignees],
      type: modalType,
      links: [...modalLinks],
      files: [...modalFiles],
      subtasks: modalSubtasks.map((s) => ({ ...s })),
      createdAt: new Date().toISOString(),
    });
    logEvent(`${modalType === 'project' ? 'Создан проект' : 'Добавлена задача'} «${title}»`);
    justDone = status === 'done';
  }
  save();
  closeTaskModal();
  render();
  if (justDone) celebrate(title);
}

// мультиселект исполнителей в модалке
function renderModalAssignees() {
  const names = modalAssignees.map(getPerson).filter(Boolean).map((p) => p.name);
  els.tAssigneeLabel.textContent = names.length === 0 ? 'Не выбрано' : (names.length <= 2 ? names.join(', ') : names.length + ' выбрано');
  els.tAssigneeLabel.classList.toggle('is-placeholder', names.length === 0);
  if (people.length === 0) {
    els.tAssigneePanel.innerHTML = '<div class="ms-empty">Сначала добавьте участников (кнопка 👥 вверху)</div>';
    return;
  }
  els.tAssigneePanel.innerHTML = people.map((p) => {
    const on = modalAssignees.includes(p.id) ? ' is-on' : '';
    return `<button type="button" class="ms-option${on}" data-id="${p.id}"><span class="ms-check">✓</span>${avatarHtml(p, 'sm')} ${escapeHtml(p.name)}</button>`;
  }).join('');
}
function closeMsPanel() {
  els.tAssigneePanel.hidden = true; els.tAssigneeMs.classList.remove('open');
  if (els.mAssigneePanel) { els.mAssigneePanel.hidden = true; els.mAssigneeMs.classList.remove('open'); }
}

// ====================== Команда (модалка) ======================
function openPeopleModal() { renderPeopleModal(); els.peopleModal.hidden = false; els.personName.focus(); }
function closePeopleModal() { els.peopleModal.hidden = true; }
function renderPeopleModal() {
  if (!people.length) { els.peopleList.innerHTML = '<div class="people-empty">Пока никого нет — добавьте ниже</div>'; return; }
  els.peopleList.innerHTML = people.map((p) => {
    const active = tasks.filter((t) => taskAssignees(t).includes(p.id) && !isDone(t)).length;
    return `<div class="person-row" data-id="${p.id}" draggable="true">
      <span class="pr-drag" title="Перетащите, чтобы поменять порядок">⠿</span>
      ${avatarHtml(p)}
      <span class="pr-name">${escapeHtml(p.name)}${p.passHash ? ' <span class="pr-lock" title="Защищён паролем">🔒</span>' : ''}</span>
      <span class="pr-count">${active} в работе</span>
      <button data-act="lock" title="${p.passHash ? 'Сменить / снять пароль' : 'Поставить пароль на кабинет'}">${p.passHash ? '🔒' : '🔓'}</button>
      <button data-act="edit" title="Переименовать">✎</button>
      <button class="del" data-act="del" title="Удалить">🗑</button>
    </div>`;
  }).join('');
  els.peopleList.querySelectorAll('.person-row').forEach((row) => {
    row.addEventListener('dragstart', (e) => { dragPersonId = row.dataset.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { dragPersonId = null; els.peopleList.querySelectorAll('.drop-hint').forEach((x) => x.classList.remove('drop-hint')); els.peopleList.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging')); });
    row.addEventListener('dragover', (e) => { e.preventDefault(); if (row.dataset.id !== dragPersonId) row.classList.add('drop-hint'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-hint'));
    row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drop-hint'); if (dragPersonId && dragPersonId !== row.dataset.id) reorderPeople(dragPersonId, row.dataset.id); });
  });
}
function addPerson(e) {
  e.preventDefault();
  const name = els.personName.value.trim();
  if (!name) return;
  const pass = els.personPass.value.trim();
  const person = { id: uid(), name, color: PALETTE[people.length % PALETTE.length] };
  if (pass) person.passHash = hashStr(pass);
  people.push(person);
  els.personName.value = '';
  els.personPass.value = '';
  logEvent(`Добавлен участник ${name}`);
  save(); renderPeopleModal(); renderModalAssignees();
}
function renamePerson(id) {
  const p = getPerson(id); if (!p) return;
  const v = prompt('Переименовать участника:', p.name); if (v === null) return;
  const t = v.trim(); if (!t) return;
  p.name = t; save(); renderPeopleModal(); renderModalAssignees();
}
function deletePerson(id) {
  const p = getPerson(id); if (!p) return;
  if (!confirm(`Удалить «${p.name}»? Он будет снят со своих задач.`)) return;
  people = people.filter((x) => x.id !== id);
  tasks.forEach((t) => { t.assigneeIds = taskAssignees(t).filter((a) => a !== id); });
  modalAssignees = modalAssignees.filter((a) => a !== id);
  if (filters.person === id) filters.person = '';
  save(); renderPeopleModal(); renderModalAssignees();
}
function reorderPeople(fromId, toId) {
  const fi = people.findIndex((p) => p.id === fromId);
  const ti = people.findIndex((p) => p.id === toId);
  if (fi === -1 || ti === -1 || fi === ti) return;
  const [moved] = people.splice(fi, 1);
  people.splice(ti, 0, moved);
  save();
  if (!els.peopleModal.hidden) renderPeopleModal();
  if (view === 'team') renderTeam();
}

// ====================== Созвоны ======================
function openMeetingModal(id) {
  meetingId = id || null;
  const m = id ? meetings.find((x) => x.id === id) : null;
  meetingOwner = m ? (m.owner || '') : personView; // новый созвон наследует текущий режим
  els.meetingModalTitle.textContent = m ? 'Созвон' : 'Новый созвон';
  els.mTitle.value = m ? m.title : '';
  els.mDate.value = m ? (m.date || '') : '';
  els.mTime.value = m ? (m.time || '') : '';
  els.mLink.value = m ? (m.link || '') : '';
  els.mDescription.value = m ? (m.description || '') : '';
  meetingParts = m ? [...(m.participantIds || [])] : (personView ? [personView] : []);
  // подсказка о типе созвона
  if (meetingOwner) {
    const p = getPerson(meetingOwner);
    els.mScope.textContent = '🔒 Личный созвон' + (p ? ' — ' + p.name : '') + ' (виден только в личном кабинете)';
  } else {
    els.mScope.textContent = '🌐 Общий созвон — виден всем в календаре';
  }
  renderMeetingParts();
  els.mDelete.hidden = !m;
  els.meetingModal.hidden = false;
  els.mTitle.focus();
}
function closeMeetingModal() {
  els.meetingModal.hidden = true; meetingId = null;
  els.mAssigneePanel.hidden = true; els.mAssigneeMs.classList.remove('open');
}
function saveMeeting() {
  const title = els.mTitle.value.trim();
  if (!title) { showToast('Введите название созвона'); return; }
  if (!els.mDate.value) { showToast('Укажите дату'); return; }
  if (meetingId) {
    const m = meetings.find((x) => x.id === meetingId);
    if (!m) return closeMeetingModal();
    m.title = title; m.date = els.mDate.value; m.time = els.mTime.value;
    m.link = els.mLink.value.trim(); m.description = els.mDescription.value.trim();
    m.participantIds = [...meetingParts]; m.owner = meetingOwner || '';
    logEvent(`Изменён созвон «${title}»`);
  } else {
    meetings.push({ id: uid(), title, date: els.mDate.value, time: els.mTime.value, link: els.mLink.value.trim(), description: els.mDescription.value.trim(), participantIds: [...meetingParts], owner: meetingOwner || '', createdAt: new Date().toISOString() });
    logEvent(`${meetingOwner ? 'Личный созвон' : 'Создан созвон'} «${title}»`);
  }
  save(); closeMeetingModal(); render();
}
function deleteMeeting() {
  if (!meetingId) return;
  const m = meetings.find((x) => x.id === meetingId);
  if (!m || !confirm('Удалить созвон?')) return;
  meetings = meetings.filter((x) => x.id !== meetingId);
  logEvent(`Удалён созвон «${m.title}»`);
  save(); closeMeetingModal(); render();
}
function renderMeetingParts() {
  const names = meetingParts.map(getPerson).filter(Boolean).map((p) => p.name);
  els.mAssigneeLabel.textContent = names.length === 0 ? 'Не выбрано' : (names.length <= 2 ? names.join(', ') : names.length + ' выбрано');
  els.mAssigneeLabel.classList.toggle('is-placeholder', names.length === 0);
  if (!people.length) { els.mAssigneePanel.innerHTML = '<div class="ms-empty">Сначала добавьте участников (кнопка 👥)</div>'; return; }
  els.mAssigneePanel.innerHTML = people.map((p) => {
    const on = meetingParts.includes(p.id) ? ' is-on' : '';
    return `<button type="button" class="ms-option${on}" data-id="${p.id}"><span class="ms-check">✓</span>${avatarHtml(p, 'sm')} ${escapeHtml(p.name)}</button>`;
  }).join('');
}

// ====================== Окно дня (все события даты) ======================
let dayModalDate = '';
function openDayModal(dateStr) {
  dayModalDate = dateStr;
  const dayTasks = tasksForPerson()
    .filter((t) => t.deadline && dateKey(new Date(t.deadline)) === dateStr)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const dayMeetings = meetingsForPerson()
    .filter((m) => m.date === dateStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const dt = new Date(dateStr + 'T00:00');
  els.dayTitle.textContent = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeOf = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  let html = '';
  if (dayMeetings.length) {
    html += '<div class="day-section">📞 Созвоны</div>';
    html += dayMeetings.map((m) => {
      const parts = (m.participantIds || []).map(getPerson).filter(Boolean).map((p) => p.name).join(', ') || 'без участников';
      return `<div class="row-item" data-meet="${m.id}"><span class="tc-prio low"></span>
        <div class="row-main"><div class="row-title">${escapeHtml(m.title)}</div>
        <div class="row-sub">${m.time ? m.time + ' · ' : ''}${escapeHtml(parts)}</div></div></div>`;
    }).join('');
  }
  if (dayTasks.length) {
    html += '<div class="day-section">🗒️ Задачи и дедлайны</div>';
    html += dayTasks.map((t) => `<div class="row-item${isDone(t) ? ' is-done' : ''}" data-open="${t.id}">
      <span class="tc-prio ${t.priority}"></span>
      <div class="row-main"><div class="row-title">${escapeHtml(t.title)}${isProject(t) ? ' 📁' : ''}</div>
      <div class="row-sub">${STATUS_LABEL[statusOf(t)]} · 👤 ${escapeHtml(assigneeNames(t))} · ${timeOf(t.deadline)}</div></div>
      ${assigneesStack(t)}</div>`).join('');
  }
  els.dayBody.innerHTML = html || '<div class="empty-hint">На этот день ничего не запланировано</div>';
  els.dayModal.hidden = false;
}
function closeDayModal() { els.dayModal.hidden = true; }

// ====================== Экспорт / Импорт ======================
function exportJson() {
  const blob = new Blob([JSON.stringify({ people, tasks, history }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'tasks.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл tasks.json сохранён');
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      let impPeople = [], impTasks = [], impHistory = [];
      if (Array.isArray(parsed)) { impTasks = parsed; }
      else if (parsed && typeof parsed === 'object') {
        impPeople = Array.isArray(parsed.people) ? parsed.people : [];
        impTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        impHistory = Array.isArray(parsed.history) ? parsed.history : [];
      } else throw new Error('Неверный формат файла');
      if (!impTasks.every((t) => t && typeof t === 'object' && typeof t.id === 'string')) throw new Error('Неверный формат задач');
      impTasks.forEach((t) => {
        if (!Array.isArray(t.assigneeIds)) t.assigneeIds = t.assigneeId ? [t.assigneeId] : [];
        delete t.assigneeId;
        if (!t.status) t.status = t.done ? 'done' : 'new';
        t.done = t.status === 'done';
      });
      const empty = tasks.length === 0 && people.length === 0;
      const msg = empty ? `Импортировать ${impTasks.length} задач(и)?` : 'Добавить импортированные данные к текущим? (Отмена — отменить)';
      if (!confirm(msg)) return;
      const nameToId = {};
      people.forEach((p) => { nameToId[p.name.trim().toLowerCase()] = p.id; });
      const idMap = {}; let addedPeople = 0;
      impPeople.forEach((p) => {
        if (!p || typeof p.name !== 'string') return;
        const key = p.name.trim().toLowerCase();
        if (nameToId[key]) { idMap[p.id] = nameToId[key]; }
        else { const np = { id: typeof p.id === 'string' ? p.id : uid(), name: p.name, color: p.color || PALETTE[people.length % PALETTE.length] }; people.push(np); nameToId[key] = np.id; idMap[p.id] = np.id; addedPeople++; }
      });
      const known = new Set(people.map((p) => p.id));
      const usedIds = new Set(tasks.map((t) => t.id));
      impTasks.forEach((t) => {
        if (usedIds.has(t.id)) t.id = uid();
        usedIds.add(t.id);
        t.assigneeIds = taskAssignees(t).map((a) => idMap[a] || a).filter((id) => known.has(id));
        tasks.push(t);
      });
      if (impHistory.length) history = impHistory.concat(history).slice(0, 80);
      logEvent(`Импортировано ${impTasks.length} задач(и)`);
      save(); render();
      showToast(`Добавлено: задач ${impTasks.length}, участников ${addedPeople}`);
    } catch (e) { showToast('Ошибка импорта: ' + e.message); }
  };
  reader.readAsText(file);
}

// ====================== Тост ======================
let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2500);
}

// ====================== Напоминания ======================
const remindersShown = new Set();
const remindersBox = document.getElementById('reminders');

function notifyReminder(text, kind) {
  const card = document.createElement('div');
  card.className = 'reminder' + (kind ? ' ' + kind : '');
  card.innerHTML = `<div>${escapeHtml(text)}</div><span class="rx">×</span>`;
  card.onclick = () => card.remove();
  remindersBox.appendChild(card);
  setTimeout(() => card.remove(), 12000);
  try { if (window.Notification && Notification.permission === 'granted') new Notification('TaskFlow', { body: text }); } catch (e) {}
}

function checkReminders() {
  const now = new Date();
  // созвоны — в пределах 15 минут до начала
  meetings.forEach((m) => {
    if (!m.date) return;
    const mins = (meetingDateTime(m) - now) / 60000;
    if (mins > 0 && mins <= 15) {
      const key = 'm:' + m.id;
      if (remindersShown.has(key)) return;
      remindersShown.add(key);
      const who = (m.participantIds || []).map(getPerson).filter(Boolean).map((p) => p.name).join(', ');
      notifyReminder(`📞 Через ${Math.max(1, Math.round(mins))} мин созвон: «${m.title}»` + (who ? ` — ${who}` : ''), 'meeting');
    }
  });
  // дедлайны — в пределах 24 часов, не выполнено
  tasks.forEach((t) => {
    if (!t.deadline || isDone(t)) return;
    const hrs = (new Date(t.deadline) - now) / 36e5;
    if (hrs > 0 && hrs <= 24) {
      const key = 'd:' + t.id;
      if (remindersShown.has(key)) return;
      remindersShown.add(key);
      const left = hrs >= 1 ? `${Math.round(hrs)} ч` : `${Math.max(1, Math.round(hrs * 60))} мин`;
      notifyReminder(`⏰ Дедлайн «${t.title}» — осталось ${left} · ${assigneeNames(t)}`, 'deadline');
    }
  });
}

function startReminders() {
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  checkReminders();
  setInterval(checkReminders, 60000);
}

// ====================== Навигация и события ======================
function setView(v) { if (!VIEWS.includes(v)) return; view = v; closeMsPanel(); render(); window.scrollTo(0, 0); }

// мобильная навигация = копия
els.navMobile.innerHTML = VIEWS.map((v) => `<button class="nav-btn" data-view="${v}">${VIEW_LABEL[v]}</button>`).join('');
[els.nav, els.navMobile].forEach((nav) => nav.addEventListener('click', (e) => {
  const b = e.target.closest('.nav-btn'); if (b) setView(b.dataset.view);
}));

els.addTaskBtn.addEventListener('click', () => openTaskModal(null));
els.managePeopleBtn.addEventListener('click', openPeopleModal);
els.exportBtn.addEventListener('click', () => { if (requireAdmin()) exportJson(); });
els.importBtn.addEventListener('click', () => { if (requireAdmin()) els.importFile.click(); });
els.importFile.addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });

// делегирование кликов в контенте: открыть задачу
root.addEventListener('click', (e) => {
  const day = e.target.closest('[data-day]');
  if (day) { openDayModal(day.dataset.day); return; }
  const meet = e.target.closest('[data-meet]');
  if (meet) { openMeetingModal(meet.dataset.meet); return; }
  const open = e.target.closest('[data-open]');
  if (open) { openTaskModal(open.dataset.open); return; }
  const card = e.target.closest('.task-card');
  if (card && !card.classList.contains('dragging')) { openTaskModal(card.dataset.id); return; }
  const member = e.target.closest('.member[data-person]');
  if (member) { personView = member.dataset.person; view = 'dashboard'; render(); window.scrollTo(0, 0); return; }
});

// модалка задачи
els.tSave.addEventListener('click', saveTask);
els.tCancel.addEventListener('click', closeTaskModal);
els.taskCloseX = document.getElementById('task-close-x');
els.taskCloseX.addEventListener('click', closeTaskModal);
els.tDelete.addEventListener('click', () => { if (editingId && confirm('Удалить задачу?')) { deleteTask(editingId); closeTaskModal(); render(); } });
els.taskModal.addEventListener('click', (e) => { if (e.target === els.taskModal) closeTaskModal(); });
els.tAssigneeTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = els.tAssigneePanel.hidden;
  closeMsPanel();
  if (willOpen) { els.tAssigneePanel.hidden = false; els.tAssigneeMs.classList.add('open'); }
});
els.tAssigneePanel.addEventListener('click', (e) => {
  const opt = e.target.closest('.ms-option'); if (!opt) return;
  e.stopPropagation();
  const id = opt.dataset.id;
  const i = modalAssignees.indexOf(id);
  if (i === -1) modalAssignees.push(id); else modalAssignees.splice(i, 1);
  renderModalAssignees();
});

// модалка команды
els.peopleForm.addEventListener('submit', addPerson);
els.peopleClose.addEventListener('click', closePeopleModal);
document.getElementById('people-close-x').addEventListener('click', closePeopleModal);
els.peopleModal.addEventListener('click', (e) => { if (e.target === els.peopleModal) closePeopleModal(); });
els.peopleList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const row = btn.closest('.person-row'); if (!row) return;
  if (btn.dataset.act === 'edit') renamePerson(row.dataset.id);
  else if (btn.dataset.act === 'del') deletePerson(row.dataset.id);
  else if (btn.dataset.act === 'lock') setPersonPassword(row.dataset.id);
});

// личный режим
els.personViewSel.addEventListener('change', () => setPersonView(els.personViewSel.value));

// тип задачи/проекта
els.typeRow.addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (!b) return; modalType = b.dataset.type; applyTypeUI(); });

// ссылки
els.linkAdd.addEventListener('click', addLink);
els.linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
els.linksBox.addEventListener('click', (e) => { const b = e.target.closest('[data-li]'); if (b) { modalLinks.splice(+b.dataset.li, 1); renderLinks(); } });

// файлы / фото
els.filesInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
els.filesList.addEventListener('click', (e) => { const b = e.target.closest('[data-fi]'); if (b) { modalFiles.splice(+b.dataset.fi, 1); renderFiles(); } });

// подзадачи
els.subAdd.addEventListener('click', addSubtask);
els.subInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } });
els.subList.addEventListener('input', (e) => {
  const el = e.target.closest('[data-i][data-f]'); if (!el) return;
  const i = +el.dataset.i; if (modalSubtasks[i]) modalSubtasks[i][el.dataset.f] = el.value;
});
els.subList.addEventListener('change', (e) => {
  const chk = e.target.closest('.sr-check');
  if (chk) { const i = +chk.dataset.i; if (modalSubtasks[i]) { modalSubtasks[i].status = chk.checked ? 'done' : 'new'; renderSubtasks(); } return; }
  const sel = e.target.closest('select[data-i][data-f]');
  if (sel) { const i = +sel.dataset.i; if (modalSubtasks[i]) { modalSubtasks[i][sel.dataset.f] = sel.value; if (sel.dataset.f === 'status') renderSubtasks(); } }
});
els.subList.addEventListener('click', (e) => {
  const d = e.target.closest('[data-del]'); if (d) { modalSubtasks.splice(+d.dataset.del, 1); renderSubtasks(); }
});

// созвон
els.mSave.addEventListener('click', saveMeeting);
els.mCancel.addEventListener('click', closeMeetingModal);
document.getElementById('m-close-x').addEventListener('click', closeMeetingModal);
els.mDelete.addEventListener('click', deleteMeeting);
els.meetingModal.addEventListener('click', (e) => { if (e.target === els.meetingModal) closeMeetingModal(); });
els.mAssigneeTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = els.mAssigneePanel.hidden;
  closeMsPanel();
  if (willOpen) { els.mAssigneePanel.hidden = false; els.mAssigneeMs.classList.add('open'); }
});
els.mAssigneePanel.addEventListener('click', (e) => {
  const opt = e.target.closest('.ms-option'); if (!opt) return;
  e.stopPropagation();
  const id = opt.dataset.id;
  const i = meetingParts.indexOf(id);
  if (i === -1) meetingParts.push(id); else meetingParts.splice(i, 1);
  renderMeetingParts();
});

// окно дня
els.dayBody.addEventListener('click', (e) => {
  const m = e.target.closest('[data-meet]'); if (m) { closeDayModal(); openMeetingModal(m.dataset.meet); return; }
  const o = e.target.closest('[data-open]'); if (o) { closeDayModal(); openTaskModal(o.dataset.open); return; }
});
els.dayClose.addEventListener('click', closeDayModal);
document.getElementById('day-close-x').addEventListener('click', closeDayModal);
document.getElementById('day-add-task').addEventListener('click', () => {
  const d = dayModalDate;
  closeDayModal();
  openTaskModal(null, d ? { deadline: d + 'T18:00' } : null);
});
els.dayModal.addEventListener('click', (e) => { if (e.target === els.dayModal) closeDayModal(); });

document.addEventListener('click', closeMsPanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMsPanel();
    if (!els.dayModal.hidden) closeDayModal();
    if (!els.taskModal.hidden) closeTaskModal();
    if (!els.peopleModal.hidden) closePeopleModal();
    if (!els.meetingModal.hidden) closeMeetingModal();
  }
});

loadData();
