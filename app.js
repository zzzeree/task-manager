'use strict';

// ---- Состояние ----------------------------------------------------------

let people = [];                // список исполнителей: { id, name }
let tasks = [];                 // задачи (порядок = порядок в массиве)
let currentFilter = 'all';      // all | active | done
let currentAssignee = null;     // фильтр по исполнителю (id) или null
let editingId = null;           // id задачи в окне редактирования
let formAssignees = [];         // выбранные исполнители в форме создания
let editAssignees = [];         // выбранные исполнители в окне редактирования
let saveTimer = null;

const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

// ---- DOM ----------------------------------------------------------------

const els = {
  form: document.getElementById('task-form'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  priority: document.getElementById('priority'),
  deadline: document.getElementById('deadline'),
  assigneeMs: document.getElementById('assignee-ms'),
  assigneeTrigger: document.getElementById('assignee-trigger'),
  assigneeLabel: document.getElementById('assignee-label'),
  assigneePanel: document.getElementById('assignee-panel'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  counter: document.getElementById('counter'),
  filters: document.getElementById('filters'),
  toast: document.getElementById('toast'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  assigneeBanner: document.getElementById('assignee-banner'),
  managePeopleBtn: document.getElementById('manage-people-btn'),
  // Модалка редактирования
  editModal: document.getElementById('edit-modal'),
  editTitle: document.getElementById('edit-title'),
  editDescription: document.getElementById('edit-description'),
  editPriority: document.getElementById('edit-priority'),
  editAssigneeMs: document.getElementById('edit-assignee-ms'),
  editAssigneeTrigger: document.getElementById('edit-assignee-trigger'),
  editAssigneeLabel: document.getElementById('edit-assignee-label'),
  editAssigneePanel: document.getElementById('edit-assignee-panel'),
  editDeadline: document.getElementById('edit-deadline'),
  editCancel: document.getElementById('edit-cancel'),
  editSave: document.getElementById('edit-save'),
  // Модалка исполнителей
  peopleModal: document.getElementById('people-modal'),
  peopleList: document.getElementById('people-list'),
  peopleForm: document.getElementById('people-form'),
  personName: document.getElementById('person-name'),
  peopleClose: document.getElementById('people-close'),
};

function uid() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
function getPerson(id) {
  return people.find((p) => p.id === id) || null;
}
function taskAssignees(t) {
  return Array.isArray(t.assigneeIds) ? t.assigneeIds : [];
}

// ---- API ----------------------------------------------------------------

async function loadData() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyData(await res.json());
  } catch (err) {
    showToast('Не удалось загрузить данные');
    people = [];
    tasks = [];
  }
  renderAll();
}

// Поддержка старого формата (массив задач) и нового ({ people, tasks }).
function applyData(data) {
  if (Array.isArray(data)) {
    people = [];
    tasks = data;
  } else if (data && typeof data === 'object') {
    people = Array.isArray(data.people) ? data.people : [];
    tasks = Array.isArray(data.tasks) ? data.tasks : [];
  } else {
    people = [];
    tasks = [];
  }
  // Миграция: одиночный assigneeId -> массив assigneeIds
  tasks.forEach((t) => {
    if (!Array.isArray(t.assigneeIds)) {
      t.assigneeIds = t.assigneeId ? [t.assigneeId] : [];
    }
    delete t.assigneeId;
  });
}

// Сохраняем весь объект. Дебаунс, чтобы не слать запрос на каждый клик.
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people, tasks }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      showToast('Ошибка сохранения');
    }
  }, 250);
}

// ---- Исполнители --------------------------------------------------------

function addPerson(e) {
  e.preventDefault();
  const name = els.personName.value.trim();
  if (!name) return;
  people.push({ id: uid(), name });
  els.personName.value = '';
  save();
  renderAll();
  renderPeopleModal();
  if (!els.editModal.hidden) renderEditPicker();
}

function renamePerson(id) {
  const p = getPerson(id);
  if (!p) return;
  const v = prompt('Переименовать исполнителя:', p.name);
  if (v === null) return;
  const t = v.trim();
  if (!t) return;
  p.name = t;
  save();
  renderAll();
  renderPeopleModal();
  if (!els.editModal.hidden) renderEditPicker();
}

function deletePerson(id) {
  const p = getPerson(id);
  if (!p) return;
  if (!confirm(`Удалить «${p.name}»? Он будет снят со своих задач.`)) return;
  people = people.filter((x) => x.id !== id);
  tasks.forEach((t) => {
    t.assigneeIds = taskAssignees(t).filter((a) => a !== id);
  });
  formAssignees = formAssignees.filter((a) => a !== id);
  editAssignees = editAssignees.filter((a) => a !== id);
  if (currentAssignee === id) currentAssignee = null;
  save();
  renderAll();
  renderPeopleModal();
  if (!els.editModal.hidden) renderEditPicker();
}

function toggleAssigneeFilter(id) {
  currentAssignee = currentAssignee === id ? null : id;
  renderAll();
}

// ---- Задачи -------------------------------------------------------------

function addTask(e) {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  tasks.unshift({
    id: uid(),
    title,
    description: els.description.value.trim(),
    priority: els.priority.value,
    deadline: els.deadline.value || null,
    assigneeIds: [...formAssignees],
    done: false,
    createdAt: new Date().toISOString(),
  });
  els.form.reset();
  els.priority.value = 'medium';
  formAssignees = [];
  renderFormPicker();
  els.title.focus();
  save();
  renderAll();
}

function toggleDone(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  save();
  renderAll();
}

function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  save();
  renderAll();
}

function setFilter(filter) {
  currentFilter = filter;
  renderAll();
}

// ---- Редактирование (модалка) -------------------------------------------

function openEditModal(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  els.editTitle.value = t.title;
  els.editDescription.value = t.description || '';
  els.editPriority.value = t.priority;
  editAssignees = [...taskAssignees(t)];
  renderEditPicker();
  els.editDeadline.value = t.deadline || '';
  els.editModal.hidden = false;
  els.editTitle.focus();
}

function closeEditModal() {
  els.editModal.hidden = true;
  editingId = null;
}

function saveEdit() {
  const t = tasks.find((x) => x.id === editingId);
  if (!t) return closeEditModal();
  const title = els.editTitle.value.trim();
  if (!title) {
    showToast('Название не может быть пустым');
    return;
  }
  t.title = title;
  t.description = els.editDescription.value.trim();
  t.priority = els.editPriority.value;
  t.assigneeIds = [...editAssignees];
  t.deadline = els.editDeadline.value || null;
  save();
  closeEditModal();
  renderAll();
}

// ---- Дедлайны -----------------------------------------------------------

function deadlineInfo(deadline) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (isNaN(due)) return null;
  const diffMs = due - new Date();
  let state = 'normal';
  if (diffMs < 0) state = 'overdue';
  else if (diffMs / 36e5 <= 24) state = 'soon';
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

// Выпадающий мультиселект выбора нескольких исполнителей.
function msLabelText(ids) {
  const names = ids.map((id) => getPerson(id)).filter(Boolean).map((p) => p.name);
  if (names.length === 0) return 'Не выбрано';
  if (names.length <= 2) return names.join(', ');
  return names.length + ' выбрано';
}
function msOptionsHtml(selectedIds) {
  if (people.length === 0) {
    return '<div class="ms-empty">Сначала добавьте людей кнопкой «👥 Исполнители» вверху</div>';
  }
  return people
    .map((p) => {
      const on = selectedIds.includes(p.id) ? ' is-on' : '';
      return `<button type="button" class="ms-option${on}" data-id="${p.id}"><span class="ms-check">✓</span>${escapeHtml(p.name)}</button>`;
    })
    .join('');
}
function renderFormPicker() {
  els.assigneeLabel.textContent = msLabelText(formAssignees);
  els.assigneeLabel.classList.toggle('is-placeholder', formAssignees.length === 0);
  els.assigneePanel.innerHTML = msOptionsHtml(formAssignees);
}
function renderEditPicker() {
  els.editAssigneeLabel.textContent = msLabelText(editAssignees);
  els.editAssigneeLabel.classList.toggle('is-placeholder', editAssignees.length === 0);
  els.editAssigneePanel.innerHTML = msOptionsHtml(editAssignees);
}

function visibleTasks() {
  let arr = tasks;
  if (currentFilter === 'active') arr = arr.filter((t) => !t.done);
  else if (currentFilter === 'done') arr = arr.filter((t) => t.done);
  if (currentAssignee) arr = arr.filter((t) => taskAssignees(t).includes(currentAssignee));
  return arr;
}

function renderAll() {
  renderFormPicker();
  renderTasks();
  renderCounter();
  renderStatusFilter();
}

function renderCounter() {
  const remaining = tasks.filter((t) => !t.done).length;
  els.counter.textContent = `Осталось: ${remaining}`;
}

function renderStatusFilter() {
  [...els.filters.children].forEach((b) =>
    b.classList.toggle('is-active', b.dataset.filter === currentFilter)
  );
  const p = currentAssignee ? getPerson(currentAssignee) : null;
  if (p) {
    els.assigneeBanner.hidden = false;
    els.assigneeBanner.innerHTML = `Показаны задачи: <b>${escapeHtml(p.name)}</b> <button id="clear-assignee">показать все ✕</button>`;
    document.getElementById('clear-assignee').addEventListener('click', () => {
      currentAssignee = null;
      renderAll();
    });
  } else {
    els.assigneeBanner.hidden = true;
    els.assigneeBanner.innerHTML = '';
  }
}

function renderTasks() {
  els.list.innerHTML = '';
  els.empty.hidden = tasks.length !== 0;
  for (const t of visibleTasks()) els.list.appendChild(renderTask(t));
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
  const assigneeBadges = taskAssignees(t)
    .map((id) => getPerson(id))
    .filter(Boolean)
    .map(
      (p) =>
        `<button class="badge badge-assignee" data-id="${p.id}" title="Показать задачи этого исполнителя">👤 ${escapeHtml(p.name)}</button>`
    )
    .join('');
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
        ${assigneeBadges}
      </div>
    </div>
    <div class="task-actions">
      <button class="icon-btn edit" title="Редактировать">✏️</button>
      <button class="icon-btn delete" title="Удалить">🗑️</button>
    </div>
  `;

  li.querySelector('.task-check').addEventListener('change', () => toggleDone(t.id));
  li.querySelector('.edit').addEventListener('click', () => openEditModal(t.id));
  li.querySelector('.delete').addEventListener('click', () => deleteTask(t.id));
  li.querySelectorAll('.badge-assignee').forEach((b) =>
    b.addEventListener('click', () => toggleAssigneeFilter(b.dataset.id))
  );

  attachDnd(li);
  return li;
}

// Список исполнителей внутри модального окна.
function renderPeopleModal() {
  els.peopleList.innerHTML = '';
  if (people.length === 0) {
    els.peopleList.innerHTML = '<span class="people-empty">Пока нет исполнителей — добавьте ниже</span>';
    return;
  }
  for (const p of people) {
    const count = tasks.filter((t) => taskAssignees(t).includes(p.id) && !t.done).length;
    const chip = document.createElement('span');
    chip.className = 'person-chip';
    chip.dataset.id = p.id;
    chip.innerHTML = `
      <span class="person-name">${escapeHtml(p.name)}<span class="person-count">${count}</span></span>
      <button class="person-edit" data-act="edit" title="Переименовать">✎</button>
      <button class="person-del" data-act="del" title="Удалить">×</button>
    `;
    els.peopleList.appendChild(chip);
  }
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
    if (!dragId || dragId === li.dataset.id) return;
    reorder(dragId, li.dataset.id);
  });
}

function reorder(fromId, toId) {
  const fromIdx = tasks.findIndex((t) => t.id === fromId);
  const toIdx = tasks.findIndex((t) => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = tasks.splice(fromIdx, 1);
  tasks.splice(toIdx, 0, moved);
  save();
  renderAll();
}

// ---- Экспорт / Импорт JSON ----------------------------------------------

function exportJson() {
  const blob = new Blob([JSON.stringify({ people, tasks }, null, 2)], {
    type: 'application/json',
  });
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
      const parsed = JSON.parse(reader.result);
      let impPeople = [];
      let impTasks = [];
      if (Array.isArray(parsed)) {
        impTasks = parsed;
      } else if (parsed && typeof parsed === 'object') {
        impPeople = Array.isArray(parsed.people) ? parsed.people : [];
        impTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      } else {
        throw new Error('Неверный формат файла');
      }
      if (!impTasks.every((t) => t && typeof t === 'object' && typeof t.id === 'string')) {
        throw new Error('Неверный формат задач');
      }
      // Миграция одиночного assigneeId у импортируемых задач
      impTasks.forEach((t) => {
        if (!Array.isArray(t.assigneeIds)) t.assigneeIds = t.assigneeId ? [t.assigneeId] : [];
        delete t.assigneeId;
      });

      const empty = tasks.length === 0 && people.length === 0;
      const msg = empty
        ? 'Импортировать ' + impTasks.length + ' задач(и)?'
        : 'Добавить импортированных людей и задачи к текущим? (Отмена — ничего не менять)';
      if (!confirm(msg)) return;

      // Объединяем людей по имени (без дублей), запоминаем перенос их id
      const nameToId = {};
      people.forEach((p) => { nameToId[p.name.trim().toLowerCase()] = p.id; });
      const idMap = {};
      let addedPeople = 0;
      impPeople.forEach((p) => {
        if (!p || typeof p.name !== 'string') return;
        const key = p.name.trim().toLowerCase();
        if (nameToId[key]) {
          idMap[p.id] = nameToId[key];
        } else {
          const np = { id: typeof p.id === 'string' ? p.id : uid(), name: p.name };
          people.push(np);
          nameToId[key] = np.id;
          idMap[p.id] = np.id;
          addedPeople++;
        }
      });

      // Переносим исполнителей в импортируемых задачах и добавляем задачи
      const knownPeople = new Set(people.map((p) => p.id));
      const usedTaskIds = new Set(tasks.map((t) => t.id));
      impTasks.forEach((t) => {
        if (usedTaskIds.has(t.id)) t.id = uid();
        usedTaskIds.add(t.id);
        t.assigneeIds = taskAssignees(t)
          .map((a) => idMap[a] || a)
          .filter((id) => knownPeople.has(id));
        tasks.push(t);
      });

      save();
      renderAll();
      showToast(`Добавлено: задач ${impTasks.length}, исполнителей ${addedPeople}`);
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

// ---- Модалка исполнителей ------------------------------------------------

function openPeopleModal() {
  renderPeopleModal();
  els.peopleModal.hidden = false;
  els.personName.focus();
}
function closePeopleModal() {
  els.peopleModal.hidden = true;
}
function setupModalDismiss(overlay, onClose) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });
}

// ---- Инициализация ------------------------------------------------------

els.form.addEventListener('submit', addTask);

// Мультиселект исполнителей: открытие/закрытие и выбор
function closeAllMs() {
  els.assigneePanel.hidden = true;
  els.assigneeMs.classList.remove('open');
  els.editAssigneePanel.hidden = true;
  els.editAssigneeMs.classList.remove('open');
}
function toggleMs(panel, ms) {
  const willOpen = panel.hidden;
  closeAllMs();
  if (willOpen) {
    panel.hidden = false;
    ms.classList.add('open');
  }
}
els.assigneeTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMs(els.assigneePanel, els.assigneeMs);
});
els.editAssigneeTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMs(els.editAssigneePanel, els.editAssigneeMs);
});
els.assigneePanel.addEventListener('click', (e) => {
  const opt = e.target.closest('.ms-option');
  if (!opt) return;
  e.stopPropagation();
  const id = opt.dataset.id;
  const i = formAssignees.indexOf(id);
  if (i === -1) formAssignees.push(id);
  else formAssignees.splice(i, 1);
  renderFormPicker();
});
els.editAssigneePanel.addEventListener('click', (e) => {
  const opt = e.target.closest('.ms-option');
  if (!opt) return;
  e.stopPropagation();
  const id = opt.dataset.id;
  const i = editAssignees.indexOf(id);
  if (i === -1) editAssignees.push(id);
  else editAssignees.splice(i, 1);
  renderEditPicker();
});
document.addEventListener('click', closeAllMs);
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

// Редактирование
els.editSave.addEventListener('click', saveEdit);
els.editCancel.addEventListener('click', closeEditModal);
document.getElementById('edit-close-x').addEventListener('click', closeEditModal);
setupModalDismiss(els.editModal, closeEditModal);

// Исполнители
els.managePeopleBtn.addEventListener('click', openPeopleModal);
els.peopleClose.addEventListener('click', closePeopleModal);
document.getElementById('people-close-x').addEventListener('click', closePeopleModal);
els.peopleForm.addEventListener('submit', addPerson);
els.peopleList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const chip = btn.closest('.person-chip');
  if (!chip) return;
  const id = chip.dataset.id;
  if (btn.dataset.act === 'edit') renamePerson(id);
  else if (btn.dataset.act === 'del') deletePerson(id);
});
setupModalDismiss(els.peopleModal, closePeopleModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllMs();
    if (!els.editModal.hidden) closeEditModal();
    if (!els.peopleModal.hidden) closePeopleModal();
  }
});

loadData();
