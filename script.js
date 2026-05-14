/* ============================================================
   SMART STUDY PLANNER — script.js
   Vanilla JS, modular, fully commented
   ============================================================ */

'use strict';

/* ── State & Storage ──────────────────────────────────────────
   All tasks are stored in localStorage as an array of objects.
   Shape:
   {
     id:          string  (UUID-like)
     title:       string
     description: string
     priority:    'Low' | 'Medium' | 'High'
     status:      'Pending' | 'Completed'
     date:        string  (YYYY-MM-DD)
     reminder:    string  (HH:MM or '')
     createdAt:   number  (timestamp)
   }
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'ssp_tasks_v2';

let tasks = [];
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();
let selectedDate = null;

let priorityChart = null;
let statusChart   = null;
let weekChart     = null;

let draggedTaskId  = null;
let reminderTimers = [];


/* ── Utility: generate unique ID ─────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ── Utility: today's YYYY-MM-DD ──────────────────────────────── */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Utility: format date for display ────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/* ── Local Storage ─────────────────────────────────────────────
   load / save tasks array from/to localStorage
   ───────────────────────────────────────────────────────────── */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}


/* ============================================================
   VIEWS — navigation between dashboard / calendar / tasks
   ============================================================ */
const navItems = document.querySelectorAll('.nav-item');
const views    = document.querySelectorAll('.view');

function switchView(name) {
  views.forEach(v => v.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const targetView = document.getElementById('view-' + name);
  const targetNav  = document.querySelector(`.nav-item[data-view="${name}"]`);

  if (targetView) targetView.classList.add('active');
  if (targetNav)  targetNav.classList.add('active');

  // Refresh data for the active view
  if (name === 'dashboard') renderDashboard();
  if (name === 'calendar')  renderCalendar();
  if (name === 'tasks')     renderKanban();

  // Close sidebar on mobile after navigation
  closeMobileSidebar();
}

navItems.forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});


/* ============================================================
   DARK MODE TOGGLE
   ============================================================ */
const html          = document.documentElement;
const darkToggle    = document.getElementById('darkToggle');
const darkToggleMob = document.getElementById('darkToggleMobile');

function applyTheme(dark) {
  html.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('ssp_theme', dark ? 'dark' : 'light');
  // Update Chart.js defaults if charts exist
  updateChartsTheme();
}

function toggleDark() {
  const isDark = html.getAttribute('data-theme') === 'dark';
  applyTheme(!isDark);
}

darkToggle.addEventListener('click', toggleDark);
darkToggleMob.addEventListener('click', toggleDark);

// Load saved theme
(function initTheme() {
  const saved = localStorage.getItem('ssp_theme');
  if (saved === 'dark') applyTheme(true);
})();


/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */
const sidebar  = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');

// Create backdrop element
const backdrop = document.createElement('div');
backdrop.className = 'sidebar-backdrop';
document.body.appendChild(backdrop);

function openMobileSidebar() {
  sidebar.classList.add('open');
  backdrop.classList.add('active');
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
}

hamburger.addEventListener('click', openMobileSidebar);
backdrop.addEventListener('click', closeMobileSidebar);


/* ============================================================
   MODAL — open/close, populate, save
   ============================================================ */
const taskModal    = document.getElementById('taskModal');
const modalTitle   = document.getElementById('modalTitle');
const modalClose   = document.getElementById('modalClose');
const modalCancel  = document.getElementById('modalCancel');
const modalSave    = document.getElementById('modalSave');

// Form fields
const fId          = document.getElementById('taskId');
const fTitle       = document.getElementById('taskTitle');
const fDesc        = document.getElementById('taskDesc');
const fPriority    = document.getElementById('taskPriority');
const fStatus      = document.getElementById('taskStatus');
const fDate        = document.getElementById('taskDate');
const fReminder    = document.getElementById('taskReminder');

function openModal(taskId = null, prefillDate = null) {
  taskModal.classList.add('open');
  fTitle.focus();

  if (taskId) {
    // Edit mode
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    modalTitle.textContent = 'Edit Task';
    fId.value       = t.id;
    fTitle.value    = t.title;
    fDesc.value     = t.description;
    fPriority.value = t.priority;
    fStatus.value   = t.status;
    fDate.value     = t.date;
    fReminder.value = t.reminder || '';
  } else {
    // Add mode
    modalTitle.textContent = 'Add Task';
    fId.value       = '';
    fTitle.value    = '';
    fDesc.value     = '';
    fPriority.value = 'Medium';
    fStatus.value   = 'Pending';
    fDate.value     = prefillDate || todayStr();
    fReminder.value = '';
  }
}

function closeModal() {
  taskModal.classList.remove('open');
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);

// Close on overlay click
taskModal.addEventListener('click', e => {
  if (e.target === taskModal) closeModal();
});

// Save
modalSave.addEventListener('click', () => {
  const title = fTitle.value.trim();
  if (!title) {
    fTitle.classList.add('shake');
    setTimeout(() => fTitle.classList.remove('shake'), 400);
    showToast('Please enter a task title.', 'error');
    return;
  }

  const id = fId.value;

  if (id) {
    // Update existing
    const idx = tasks.findIndex(x => x.id === id);
    if (idx !== -1) {
      tasks[idx] = {
        ...tasks[idx],
        title:       title,
        description: fDesc.value.trim(),
        priority:    fPriority.value,
        status:      fStatus.value,
        date:        fDate.value,
        reminder:    fReminder.value,
      };
    }
    showToast('Task updated!', 'success');
  } else {
    // Create new
    const newTask = {
      id:          uid(),
      title:       title,
      description: fDesc.value.trim(),
      priority:    fPriority.value,
      status:      fStatus.value,
      date:        fDate.value,
      reminder:    fReminder.value,
      createdAt:   Date.now(),
    };
    tasks.push(newTask);
    showToast('Task added!', 'success');
    scheduleReminder(newTask);
  }

  saveTasks();
  closeModal();
  refreshAllViews();
});


/* ============================================================
   TASK CARD — builder helper
   ============================================================ */
function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id       = task.id;
  card.dataset.priority = task.priority;
  card.draggable = true;

  const isCompleted = task.status === 'Completed';

  card.innerHTML = `
    <div class="task-checkbox ${isCompleted ? 'checked' : ''}" title="Toggle status"></div>
    <div class="task-body">
      <div class="task-title-text ${isCompleted ? 'done' : ''}">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-desc-text">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
        <span class="badge badge-${task.status.toLowerCase()}">${task.status}</span>
        ${task.date ? `<span class="badge-date"><i class="fa-regular fa-calendar"></i> ${formatDate(task.date)}</span>` : ''}
        ${task.reminder ? `<span class="badge-date"><i class="fa-regular fa-clock"></i> ${task.reminder}</span>` : ''}
      </div>
    </div>
    <div class="task-actions">
      <button class="task-action-btn edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button class="task-action-btn delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;

  // Toggle checkbox
  card.querySelector('.task-checkbox').addEventListener('click', () => {
    const t = tasks.find(x => x.id === task.id);
    if (!t) return;
    t.status = t.status === 'Completed' ? 'Pending' : 'Completed';
    saveTasks();
    refreshAllViews();
  });

  // Edit button
  card.querySelector('.edit').addEventListener('click', () => openModal(task.id));

  // Delete button
  card.querySelector('.delete').addEventListener('click', () => deleteTask(task.id));

  // Drag events
  card.addEventListener('dragstart', e => {
    draggedTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    draggedTaskId = null;
    card.classList.remove('dragging');
  });

  return card;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  refreshAllViews();
  showToast('Task deleted.', 'info');
}


/* ============================================================
   DASHBOARD — stats, progress, charts, recent tasks
   ============================================================ */
function renderDashboard() {
  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const pending   = total - completed;
  const rate      = total ? Math.round((completed / total) * 100) : 0;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statDone').textContent    = completed;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statRate').textContent    = rate + '%';

  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  fill.style.width = rate + '%';
  label.textContent = rate + '%';

  renderCharts();
  renderRecentTasks();
}

/* ── Charts ──────────────────────────────────────────────────── */
function chartColors() {
  const dark = html.getAttribute('data-theme') === 'dark';
  return {
    text:   dark ? '#b8b0a6' : '#5c554d',
    grid:   dark ? '#3a3530' : '#e2ddd7',
    bg:     dark ? '#242019' : '#ffffff',
  };
}

function renderCharts() {
  const c = chartColors();
  const high   = tasks.filter(t => t.priority === 'High').length;
  const medium = tasks.filter(t => t.priority === 'Medium').length;
  const low    = tasks.filter(t => t.priority === 'Low').length;
  const done   = tasks.filter(t => t.status === 'Completed').length;
  const pend   = tasks.filter(t => t.status === 'Pending').length;

  // Priority doughnut
  const pCtx = document.getElementById('priorityChart').getContext('2d');
  if (priorityChart) priorityChart.destroy();
  priorityChart = new Chart(pCtx, {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [high, medium, low],
        backgroundColor: ['#c03535', '#c9992f', '#3a8c5c'],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: c.text, padding: 12, font: { size: 12, family: 'DM Sans' } }
        }
      }
    }
  });

  // Status pie
  const sCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(sCtx, {
    type: 'pie',
    data: {
      labels: ['Completed', 'Pending'],
      datasets: [{
        data: [done, pend],
        backgroundColor: ['#3a8c5c', '#c9992f'],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: c.text, padding: 12, font: { size: 12, family: 'DM Sans' } }
        }
      }
    }
  });

  // Week bar chart — last 7 days
  const today = new Date();
  const days  = [];
  const dayCounts  = [];
  const doneCounts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    days.push(label);
    const dayTasks = tasks.filter(t => t.date === key);
    dayCounts.push(dayTasks.length);
    doneCounts.push(dayTasks.filter(t => t.status === 'Completed').length);
  }

  const wCtx = document.getElementById('weekChart').getContext('2d');
  if (weekChart) weekChart.destroy();
  weekChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Total',
          data: dayCounts,
          backgroundColor: '#c9622f22',
          borderColor: '#c9622f',
          borderWidth: 2,
          borderRadius: 6,
        },
        {
          label: 'Completed',
          data: doneCounts,
          backgroundColor: '#3a8c5c22',
          borderColor: '#3a8c5c',
          borderWidth: 2,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: c.text, padding: 12, font: { size: 12, family: 'DM Sans' } }
        }
      },
      scales: {
        x: {
          grid: { color: c.grid },
          ticks: { color: c.text, font: { size: 12, family: 'DM Sans' } }
        },
        y: {
          grid: { color: c.grid },
          ticks: { color: c.text, stepSize: 1, font: { size: 12, family: 'DM Sans' } },
          beginAtZero: true,
        }
      }
    }
  });
}

function updateChartsTheme() {
  // Simply re-render if dashboard is active
  if (document.getElementById('view-dashboard').classList.contains('active')) {
    renderCharts();
  }
}

/* ── Recent / Filtered Tasks ──────────────────────────────────── */
function renderRecentTasks() {
  const list  = document.getElementById('recentTaskList');
  const pf    = document.getElementById('filterPriority').value;
  const sf    = document.getElementById('filterStatus').value;

  let filtered = [...tasks];
  if (pf) filtered = filtered.filter(t => t.priority === pf);
  if (sf) filtered = filtered.filter(t => t.status === sf);
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No tasks found</p></div>';
    return;
  }
  filtered.slice(0, 12).forEach(t => list.appendChild(buildTaskCard(t)));
}

document.getElementById('filterPriority').addEventListener('change', renderRecentTasks);
document.getElementById('filterStatus').addEventListener('change', renderRecentTasks);


/* ============================================================
   CALENDAR
   ============================================================ */
const calBody      = document.getElementById('calBody');
const calMonthLabel = document.getElementById('calMonthLabel');
const dayPanel     = document.getElementById('dayPanel');
const dayPanelTitle = document.getElementById('dayPanelTitle');
const dayTaskList  = document.getElementById('dayTaskList');
const btnAddTask   = document.getElementById('btnAddTask');

document.getElementById('prevMonth').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
});

function renderCalendar() {
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  calMonthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrev  = new Date(currentYear, currentMonth, 0).getDate();

  calBody.innerHTML = '';

  const today = todayStr();

  // Prefix cells from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const cell = makeCalCell(currentYear, currentMonth - 1, d, true);
    calBody.appendChild(cell);
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = makeCalCell(currentYear, currentMonth, d, false);
    if (dateStr === today) cell.classList.add('today');
    if (dateStr === selectedDate) cell.classList.add('selected');
    calBody.appendChild(cell);
  }

  // Suffix cells from next month
  const totalCells = calBody.children.length;
  const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    const cell = makeCalCell(currentYear, currentMonth + 1, d, true);
    calBody.appendChild(cell);
  }

  // Render selected date panel
  if (selectedDate) renderDayPanel(selectedDate);
}

function makeCalCell(year, month, day, otherMonth) {
  // Normalize month overflow
  let y = year, m = month;
  if (m < 0)  { m = 11; y--; }
  if (m > 11) { m = 0;  y++; }

  const dateStr = `${y}-${String(m + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const dayTasks = tasks.filter(t => t.date === dateStr);

  const cell = document.createElement('div');
  cell.className = 'cal-day' + (otherMonth ? ' other-month' : '');
  cell.dataset.date = dateStr;

  const numEl = document.createElement('span');
  numEl.className = 'day-num';
  numEl.textContent = day;
  cell.appendChild(numEl);

  if (dayTasks.length) {
    cell.classList.add('has-tasks');
    const dots = document.createElement('div');
    dots.className = 'day-dots';
    // Show up to 3 priority dots
    dayTasks.slice(0, 3).forEach(t => {
      const dot = document.createElement('span');
      dot.className = `day-dot ${t.priority}`;
      dots.appendChild(dot);
    });
    cell.appendChild(dots);
  }

  cell.addEventListener('click', () => selectDate(dateStr));
  return cell;
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  // Update selected style
  document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  const target = calBody.querySelector(`[data-date="${dateStr}"]`);
  if (target) target.classList.add('selected');
  renderDayPanel(dateStr);
}

function renderDayPanel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const display = new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  dayPanelTitle.textContent = display;
  btnAddTask.style.display  = 'flex';

  btnAddTask.onclick = () => openModal(null, dateStr);

  const dayTasks = tasks.filter(t => t.date === dateStr);
  dayTaskList.innerHTML = '';

  if (!dayTasks.length) {
    dayTaskList.innerHTML = '<div class="empty-state"><i class="fa-regular fa-note-sticky"></i><p>No tasks for this day</p></div>';
    return;
  }

  dayTasks.forEach(t => dayTaskList.appendChild(buildTaskCard(t)));
}


/* ============================================================
   KANBAN BOARD — drag-and-drop between columns
   ============================================================ */
const btnNewTask = document.getElementById('btnNewTask');
btnNewTask.addEventListener('click', () => openModal());

function renderKanban() {
  const dropPending   = document.getElementById('drop-pending');
  const dropCompleted = document.getElementById('drop-completed');

  dropPending.innerHTML   = '';
  dropCompleted.innerHTML = '';

  const pending   = tasks.filter(t => t.status === 'Pending');
  const completed = tasks.filter(t => t.status === 'Completed');

  document.getElementById('countPending').textContent   = pending.length;
  document.getElementById('countCompleted').textContent = completed.length;

  if (!pending.length)
    dropPending.innerHTML = '<div class="empty-state"><i class="fa-regular fa-clock"></i><p>No pending tasks</p></div>';
  else
    pending.forEach(t => dropPending.appendChild(buildTaskCard(t)));

  if (!completed.length)
    dropCompleted.innerHTML = '<div class="empty-state"><i class="fa-solid fa-check-double"></i><p>No completed tasks</p></div>';
  else
    completed.forEach(t => dropCompleted.appendChild(buildTaskCard(t)));

  // Setup drop zones
  setupDropZone(dropPending, 'Pending');
  setupDropZone(dropCompleted, 'Completed');
}

function setupDropZone(zone, status) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over-zone');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over-zone'));

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over-zone');

    if (!draggedTaskId) return;

    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    if (task.status !== status) {
      task.status = status;
      saveTasks();
      showToast(`Moved to ${status}`, 'success');
      refreshAllViews();
    }
  });
}


/* ============================================================
   SEARCH
   ============================================================ */
const globalSearch   = document.getElementById('globalSearch');
const searchOverlay  = document.getElementById('searchOverlay');
const searchResults  = document.getElementById('searchResultsList');
const closeSearch    = document.getElementById('closeSearch');

globalSearch.addEventListener('input', () => {
  const q = globalSearch.value.trim().toLowerCase();
  if (!q) {
    searchOverlay.classList.remove('open');
    return;
  }

  const found = tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q)
  );

  searchOverlay.classList.add('open');
  searchResults.innerHTML = '';

  if (!found.length) {
    searchResults.innerHTML = '<div class="no-results">No tasks found</div>';
    return;
  }

  found.slice(0, 10).forEach(t => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <div class="sri-title">${escapeHtml(t.title)}</div>
      <div class="sri-meta">${t.priority} · ${t.status} · ${formatDate(t.date)}</div>
    `;
    item.addEventListener('click', () => {
      openModal(t.id);
      searchOverlay.classList.remove('open');
      globalSearch.value = '';
    });
    searchResults.appendChild(item);
  });
});

closeSearch.addEventListener('click', () => {
  searchOverlay.classList.remove('open');
  globalSearch.value = '';
});

// Close on outside click
document.addEventListener('click', e => {
  if (!searchOverlay.contains(e.target) && e.target !== globalSearch) {
    searchOverlay.classList.remove('open');
  }
});


/* ============================================================
   REMINDERS / NOTIFICATIONS
   ============================================================ */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleReminder(task) {
  if (!task.reminder || !task.date) return;

  const [h, m] = task.reminder.split(':').map(Number);
  const [y, mo, d] = task.date.split('-').map(Number);
  const reminderTime = new Date(y, mo - 1, d, h, m, 0);
  const now = Date.now();
  const diff = reminderTime.getTime() - now;

  if (diff <= 0) return; // Past

  const tid = setTimeout(() => {
    fireReminder(task);
  }, diff);

  reminderTimers.push(tid);
}

function fireReminder(task) {
  // Try browser notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Study Reminder', {
      body: `Time to work on: ${task.title}`,
      icon: 'https://cdn-icons-png.flaticon.com/512/1055/1055687.png'
    });
  } else {
    // Fallback to alert
    alert(`📚 Study Reminder\nTime to work on: ${task.title}`);
  }
  showToast(`Reminder: ${task.title}`, 'info');
}

function scheduleAllReminders() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  tasks.forEach(scheduleReminder);
}


/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };

  // Remove any existing toast
  document.querySelectorAll('.toast').forEach(el => el.remove());

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 280);
  }, 2600);
}


/* ============================================================
   REFRESH ALL VIEWS (after any data change)
   ============================================================ */
function refreshAllViews() {
  // Always re-render the active view
  if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
  if (document.getElementById('view-calendar').classList.contains('active'))  renderCalendar();
  if (document.getElementById('view-tasks').classList.contains('active'))     renderKanban();
}


/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', e => {
  // Escape closes modal or search
  if (e.key === 'Escape') {
    if (taskModal.classList.contains('open')) closeModal();
    else searchOverlay.classList.remove('open');
  }

  // Ctrl/Cmd + K focuses search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    globalSearch.focus();
  }

  // Ctrl/Cmd + N opens new task modal
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openModal();
  }
});


/* ============================================================
   CSS ANIMATION HELPER — shake on invalid input
   ============================================================ */
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%,60%  { transform: translateX(-6px); }
    40%,80%  { transform: translateX(6px); }
  }
  .shake { animation: shake .35s ease; border-color: var(--red) !important; }
`;
document.head.appendChild(style);


/* ============================================================
   SEED DATA — populate with demo tasks on first load
   ============================================================ */
function seedDemoData() {
  if (localStorage.getItem('ssp_seeded')) return;

  const today = new Date();
  function daysFromToday(n) {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const demoTasks = [
    { title: 'Read Chapter 5 — Algorithms', description: 'Focus on sorting and searching sections', priority: 'High',   status: 'Pending',   date: daysFromToday(0), reminder: '' },
    { title: 'Solve 10 practice problems',  description: 'LeetCode easy/medium problems',          priority: 'Medium', status: 'Completed', date: daysFromToday(-1), reminder: '' },
    { title: 'Watch lecture on data structures', description: 'MIT OpenCourseWare playlist',      priority: 'Medium', status: 'Completed', date: daysFromToday(-1), reminder: '' },
    { title: 'Write essay draft — History', description: '1500 word draft on French Revolution',   priority: 'High',   status: 'Pending',   date: daysFromToday(1), reminder: '' },
    { title: 'Math revision — Calculus',    description: 'Integration by parts exercises',         priority: 'Low',    status: 'Pending',   date: daysFromToday(2), reminder: '' },
    { title: 'Group study session',         description: 'Library room B4 — Physics revision',     priority: 'Medium', status: 'Pending',   date: daysFromToday(3), reminder: '' },
    { title: 'Submit assignment #3',        description: 'Linear algebra problem set',             priority: 'High',   status: 'Completed', date: daysFromToday(-2), reminder: '' },
    { title: 'Research paper outline',      description: 'Topic: Machine Learning in Healthcare',  priority: 'Medium', status: 'Pending',   date: daysFromToday(4), reminder: '' },
    { title: 'Flashcard review — Biology',  description: 'Cell division and genetics',             priority: 'Low',    status: 'Completed', date: daysFromToday(-3), reminder: '' },
    { title: 'Mock exam practice',          description: 'Full 3hr timed practice exam',           priority: 'High',   status: 'Pending',   date: daysFromToday(5), reminder: '' },
  ];

  tasks = demoTasks.map(t => ({
    ...t,
    id:        uid(),
    createdAt: Date.now() - Math.random() * 86400000 * 7,
  }));

  saveTasks();
  localStorage.setItem('ssp_seeded', '1');
}


/* ============================================================
   INIT
   ============================================================ */
function init() {
  loadTasks();
  seedDemoData();       // Only runs once on first visit
  loadTasks();          // Reload after seeding

  requestNotificationPermission();
  scheduleAllReminders();

  // Start on dashboard
  switchView('dashboard');
}

init();
