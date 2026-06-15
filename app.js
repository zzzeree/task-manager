'use strict';

// ---- Состояние ----------------------------------------------------------

let tasks = [];                 // полный список (порядок = порядок в массиве)
let currentFilter = 'all';      // all | active | done
let saveTimer = null;

const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

// ---- DOM ----------------------------------------------------------------

const els = {
  form: document.getElementById('task-form'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  priority: document.getElementById('priority'),
  deadline: document.getElementById('deadline'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  counter: document.getElementById('counter'),
  filters: document.getElementById('filters'),
  toast: document.getElementById('toast'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
};

// ---- API ----------------------------------------------------------------

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    tasks = await res.json();
  } catch (err) {
    showToast('Не удалось загрузить задачи');
    tasks = [];
  }
  render();
}

// Сохраняем весь массив. Дебаунс, чтобы не слать запрос на каждый клик.
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      showToast('Ошибка сохранения');
    }
  }, 250);
}

// ---- Действия -----------------------------------------------------------

function addTask(e) {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;

  tasks.unshift({
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    title,
    description: els.description.value.trim(),
    priority: els.priority.value,
    deadline: els.deadline.value || null,
    done: false,
    createdAt: new Date().toISOString(),
  });

  els.form.reset();
  els.priority.value = 'medium';
  els.title.focus();
  save();
  render();
}

function toggleDone(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  save();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  save();
  render();
}

function editTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  const newTitle = prompt('Изменить задачу:', t.title);
  if (newTitle === null) return;
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  t.title = trimmed;
  save();
  render();
}

function setFilter(filter) {
  currentFilter = filter;
  [...els.filters.children].forEach((btn) =>
    btn.classList.toggle('is-active', btn.dataset.filter === filter)
  );
  render();
}

// ---- Дедлайны -----------------------------------------------------------

function deadlineInfo(deadline) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (isNaN(due)) return null;

  const now = new Date();
  const diffMs = due - now;
  const hours = diffMs / 36e5;

  let state = 'normal';
  if (diffMs < 0) state = 'overdue';
  else if (hours <= 24) state = 'soon';

  const text = due.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { state, text };
}

// ---- Рендер -------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function visibleTasks() {
  if (currentFilter === 'active') return tasks.filter((t) => !t.done);
  if (currentFilter === 'done') return tasks.filter((t) => t.done);
  return tasks;
}

function render() {
  const items = visibleTasks();
  els.list.innerHTML = '';

  const remaining = tasks.filter((t) => !t.done).length;
  els.counter.textContent = `Осталось: ${remaining}`;

  els.empty.hidden = tasks.length !== 0;

  for (const t of items) {
    els.list.appendChild(renderTask(t));
  }
}

function renderTask(t) {
  const li = document.createElement('li');
  li.className = `task priority-${t.priority}` + (t.done ? ' is-done' : '');
  li.dataset.id = t.id;
  li.draggable = true;

  const dl = deadlineInfo(t.deadline);
  const deadlineBadge = dl
    ? `<span class="badge badge-deadline ${dl.state}">⏰ ${dl.text}${
        dl.state === 'overdue' ? ' · просрочено' : ''
      }</span>`
    : '';

  const descHtml = t.description
    ? `<div class="task-desc">${escapeHtml(t.description)}</div>`
    : '';

  li.innerHTML = `
    <span class="drag-handle" title="Перетащите для сортировки">⠿</span>
    <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} />
    <div class="task-body">
      <div class="task-title">${escapeHtml(t.title)}</div>
      ${descHtml}
      <div class="task-meta">
        <span class="badge badge-priority ${t.priority}">${PRIORITY_LABEL[t.priority]}</span>
        ${deadlineBadge}
      </div>
    </div>
    <div class="task-actions">
      <button class="icon-btn edit" title="Редактировать">✏️</button>
      <button class="icon-btn delete" title="Удалить">🗑️</button>
    </div>
  `;

  li.querySelector('.task-check').addEventListener('change', () => toggleDone(t.id));
  li.querySelector('.edit').addEventListener('click', () => editTask(t.id));
  li.querySelector('.delete').addEventListener('click', () => deleteTask(t.id));

  attachDnd(li);
  return li;
}

// ---- Drag & Drop --------------------------------------------------------

let dragId = null;

function attachDnd(li) {
  li.addEventListener('dragstart', (e) => {
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  li.addEventListener('dragend', () => {
    dragId = null;
    li.classList.remove('dragging');
    document.querySelectorAll('.task.drag-over').forEach((el) =>
      el.classList.remove('drag-over')
    );
  });

  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (li.dataset.id !== dragId) li.classList.add('drag-over');
  });

  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));

  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const targetId = li.dataset.id;
    if (!dragId || dragId === targetId) return;
    reorder(dragId, targetId);
  });
}

// Перемещаем перетаскиваемую задачу на позицию целевой.
function reorder(fromId, toId) {
  const fromIdx = tasks.findIndex((t) => t.id === fromId);
  const toIdx = tasks.findIndex((t) => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = tasks.splice(fromIdx, 1);
  tasks.splice(toIdx, 0, moved);
  save();
  render();
}

// ---- Сохранить (скачать) JSON -------------------------------------------

function exportJson() {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasks.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл tasks.json сохранён');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('Ожидается массив задач');
      const valid = data.every((t) => t && typeof t === 'object' && typeof t.id === 'string');
      if (!valid) throw new Error('Неверный формат задач');
      if (tasks.length && !confirm('Заменить текущие задачи импортированными?')) return;
      tasks = data;
      save();
      render();
      showToast('Импортировано задач: ' + data.length);
    } catch (e) {
      showToast('Ошибка импорта: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ---- Тост ---------------------------------------------------------------

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2500);
}

// ---- Инициализация ------------------------------------------------------

els.form.addEventListener('submit', addTask);
els.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (btn) setFilter(btn.dataset.filter);
});
els.exportBtn.addEventListener('click', exportJson);
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', (e) => {
  if (e.target.files[0]) importJson(e.target.files[0]);
  e.target.value = '';
});

loadTasks();
