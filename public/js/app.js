/* Parent portal — wired to the real backend. Fees, grades, appointments,
   contacts, settings, quick actions, and the recent-updates feed are kept
   as static illustrative content (out of scope for this build) and are
   clearly marked wherever that applies. */

// ---------------- decorative UI (scroll-spy, reveal, bars, toggles) ----------------
const navItems = Array.from(document.querySelectorAll('#sideNav .nav-item'));
const sections = navItems.map(item => document.getElementById(item.dataset.target)).filter(Boolean);

function setActive(id){
  navItems.forEach(item => item.classList.toggle('active', item.dataset.target === id));
}
navItems.forEach(item => item.addEventListener('click', () => setActive(item.dataset.target)));
const spy = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) setActive(entry.target.id);
}), {rootMargin:'-40% 0px -50% 0px', threshold:0});
sections.forEach(section => spy.observe(section));
setActive('overview');

const revealEls = document.querySelectorAll('.card, .qa-card');
const revealIO = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting){ entry.target.classList.add('in-view'); revealIO.unobserve(entry.target); }
}), {threshold:.12, rootMargin:'0px 0px -6% 0px'});
revealEls.forEach((element, index) => { element.style.transitionDelay = (index % 4) * 60 + 'ms'; revealIO.observe(element); });

document.querySelectorAll('.view-toggle button').forEach(button => button.addEventListener('click', () => {
  button.parentElement.querySelectorAll('button').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
}));

const toast = document.getElementById('toast');
let toastTimer;
function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));
document.querySelectorAll('[data-scroll-target]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({behavior:'smooth', block:'start'})));

// ---------------- auth: this page requires a signed-in parent ----------------
let authToken = localStorage.getItem('balx_token') || null;
let currentUser = JSON.parse(localStorage.getItem('balx_user') || 'null');
let currentStudentId = localStorage.getItem('balx_student') || null;
let children = [];
let lastAttendanceRows = [];

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

const loginBtn = document.getElementById('loginBtn');

function setSignedInUI() {
  loginBtn.innerHTML = '<span aria-hidden="true">✓</span> ' + currentUser.name + ' · Sign out';
}

function signOut() {
  localStorage.removeItem('balx_token');
  localStorage.removeItem('balx_user');
  localStorage.removeItem('balx_student');
  window.location.href = '/';
}

loginBtn.addEventListener('click', signOut);

const bellBtn = document.getElementById('bellBtn');
const bellPopover = document.getElementById('bellPopover');

bellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  bellPopover.hidden = !bellPopover.hidden;
});
document.addEventListener('click', () => {
  if (!bellPopover.hidden) bellPopover.hidden = true;
});

// No valid session? Send them back to the main login gate instead of
// showing this page half-empty.
if (!authToken || !currentUser) {
  window.location.href = '/';
}

// ---------------- loading parent + student data ----------------
async function loadParentData() {
  const res = await api('/api/parent/children');
  children = res.data;
  if (!children.length) { showToast('No children are linked to this account yet.'); return; }

  const switcherWrap = document.getElementById('childSwitcherWrap');
  const switcher = document.getElementById('childSwitcher');
  switcher.innerHTML = children.map(c => `<option value="${c.student_id}">${c.name}</option>`).join('');
  switcherWrap.hidden = children.length <= 1;

  currentStudentId = children.some(c => c.student_id === currentStudentId) ? currentStudentId : children[0].student_id;
  switcher.value = currentStudentId;

  await loadStudentOverview(currentStudentId);
}

document.getElementById('childSwitcher').addEventListener('change', (e) => {
  currentStudentId = e.target.value;
  loadStudentOverview(currentStudentId);
});

async function loadStudentOverview(studentId) {
  localStorage.setItem('balx_student', studentId);
  try {
    const [overviewRes, attendanceRes, ticketsRes, feesRes] = await Promise.all([
      api(`/api/parent/students/${studentId}/overview`),
      api(`/api/parent/students/${studentId}/attendance`),
      api(`/api/parent/students/${studentId}/tickets`),
      api(`/api/parent/students/${studentId}/fees`),
    ]);
    renderOverview(overviewRes.data);
    lastAttendanceRows = attendanceRes.data;
    renderAttendanceTable(lastAttendanceRows);
    renderTickets(ticketsRes.data);
    renderFees(feesRes.data);
    await loadAcademicProgress(studentId);
  } catch (err) {
    showToast(err.message);
  }
}

function riskColor(level) {
  return { green: 'ok', amber: 'due-soon', red: 'overdue' }[level] || 'pending';
}

function renderOverview(data) {
  const { student, attendanceOverall, modules, notices } = data;
  const firstName = student.name.split(' ')[0];

  document.getElementById('heroName').textContent = `${student.name} · ${student.grade}, Section ${student.section}`;
  document.getElementById('sidebarStudentLabel').textContent = `${firstName}'s Degree Journey`;
  document.getElementById('heroSubtitle').textContent =
    `${firstName}'s attendance is tracked across ${modules.length} modules. ` +
    (attendanceOverall.riskLevel === 'green'
      ? 'Everything is currently on track.'
      : `"${attendanceOverall.worstModule}" needs the most attention right now.`);
  document.getElementById('topbarHeading').textContent = `How ${firstName} is progressing`;

  const pct = attendanceOverall.pct ?? 0;
  const ring = document.getElementById('ringAttendance');
  ring.style.setProperty('--pct', pct);
  document.getElementById('ringAttendanceValue').textContent = attendanceOverall.pct != null ? `${attendanceOverall.pct}%` : '—';

  const greenCount = modules.filter(m => m.risk_level === 'green').length;
  const modPct = modules.length ? Math.round((greenCount / modules.length) * 100) : 0;
  document.getElementById('ringModules').style.setProperty('--pct', modPct);
  document.getElementById('ringModulesValue').textContent = `${greenCount}/${modules.length}`;

  document.getElementById('statAttendance').textContent = attendanceOverall.pct != null ? `${attendanceOverall.pct}%` : '—';
  document.getElementById('statUpdates').textContent = notices.length;

  // Attendance risk check card
  const riskTag = document.getElementById('riskTag');
  const riskTitle = document.getElementById('riskTitle');
  const riskCopy = document.getElementById('riskCopy');
  if (attendanceOverall.riskLevel === 'green') {
    riskTag.textContent = 'On track'; riskTag.className = 'tag ok';
    riskTitle.textContent = 'No attendance concerns right now';
    riskCopy.textContent = `${firstName}'s attendance is healthy across all tracked modules.`;
  } else {
    riskTag.textContent = attendanceOverall.riskLevel === 'red' ? 'Needs attention' : 'Keep an eye on this';
    riskTag.className = attendanceOverall.riskLevel === 'red' ? 'tag overdue' : 'tag due-soon';
    riskTitle.textContent = `${attendanceOverall.worstModule}: ${attendanceOverall.pct}% attendance`;
    riskCopy.textContent = `This module has dropped into the ${attendanceOverall.riskLevel} zone. We recommend checking in with Student Services this week.`;
  }

  // Module-by-module breakdown (present/late/absent counts)
  const breakdownList = document.getElementById('moduleBreakdownList');
  breakdownList.innerHTML = modules.map(m => `
    <div class="module-breakdown-row">
      <div class="module-breakdown-name">${m.moduleName}</div>
      <span class="tag ${riskColor(m.risk_level)}">${m.attendance_percentage}%</span>
      <div class="module-breakdown-counts">
        <span><b>${m.present_count}</b> present</span>
        <span><b>${m.late_count}</b> late</span>
        <span><b>${m.absent_count}</b> absent</span>
      </div>
    </div>`).join('') || '<div style="color:var(--ink-faint);font-size:13px;">No modules tracked yet.</div>';

  // Notifications list — every real notice for this student, newest first.
  // Rendered inside the header bell popover (there is no separate
  // Notifications section on the page).
  const bellNotificationsList = document.getElementById('bellNotificationsList');
  const bellCount = document.getElementById('bellCount');
  if (!notices.length) {
    bellNotificationsList.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;padding:4px 0;">No notifications available.</div>';
    bellCount.hidden = true;
  } else {
    bellCount.hidden = false;
    bellCount.textContent = notices.length;
    bellNotificationsList.innerHTML = notices.map(n => {
      const severity = n.is_urgent ? 'high' : 'low';
      return `<div class="alert-row">
        <div class="alert-icon ${severity}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
        <div><div class="alert-title">${n.title}</div><div class="alert-desc">${n.body}</div><div class="alert-time">${new Date(n.created_at).toLocaleDateString()}</div></div>
      </div>`;
    }).join('');
  }

  // Urgent Messages banner — always visible. Shows the most recent UNREAD
  // urgent notice with a "View Notice" button, or a calm "No urgent
  // message" state with no button at all when there isn't one.
  const urgent = notices.find(n => n.is_urgent && !n.isRead);
  const banner = document.getElementById('urgentBanner');
  const dismissBtn = document.getElementById('dismissBanner');
  if (urgent) {
    banner.classList.remove('empty');
    document.getElementById('urgentBannerTitle').textContent = `Urgent notice · ${urgent.title}`;
    document.getElementById('urgentBannerBody').textContent = urgent.body;
    banner.dataset.noticeId = urgent.id;
    dismissBtn.hidden = false;
    dismissBtn.textContent = 'Clear';
  } else {
    banner.classList.add('empty');
    document.getElementById('urgentBannerTitle').textContent = 'No urgent message';
    document.getElementById('urgentBannerBody').textContent = '';
    delete banner.dataset.noticeId;
    dismissBtn.hidden = true;
  }
}

document.getElementById('dismissBanner').addEventListener('click', async () => {
  const banner = document.getElementById('urgentBanner');
  const noticeId = banner.dataset.noticeId;
  // Flip to the "no urgent message" state immediately — feels instant —
  // then persist it server-side so it stays that way on the next login.
  banner.classList.add('empty');
  document.getElementById('urgentBannerTitle').textContent = 'No urgent message';
  document.getElementById('urgentBannerBody').textContent = '';
  document.getElementById('dismissBanner').hidden = true;
  delete banner.dataset.noticeId;
  if (!noticeId || !currentStudentId) return;
  try {
    await api(`/api/parent/students/${currentStudentId}/notices/${noticeId}/read`, { method: 'POST' });
  } catch (err) {
    showToast(err.message);
  }
});

function formatDayLabel(dateStr) {
  const d = new Date(String(dateStr) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function renderAttendanceTable(rows, filter = 'all') {
  const tbody = document.getElementById('attendanceTableBody');
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">No records match this filter.</td></tr>`;
    return;
  }
  // Group the rows by day (they already come sorted newest-first) so the
  // scrollable history reads "one day at a time" and each day is clearly visible.
  const byDay = [];
  for (const r of filtered.slice(0, 60)) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else byDay.push({ date: r.date, rows: [r] });
  }
  tbody.innerHTML = byDay.map(day => {
    const dayHeader = `<tr class="attendance-day-head"><td colspan="6"><span class="attendance-day-label">${formatDayLabel(day.date)}</span><span class="attendance-day-count">${day.rows.length} session${day.rows.length === 1 ? '' : 's'}</span></td></tr>`;
    const dayRows = day.rows.map(r => {
      const tagClass = r.status === 'present' ? 'ok' : r.status === 'late' ? 'due-soon' : 'overdue';
      const label = r.status === 'present' ? 'Present' : r.status === 'late' ? 'Late' : 'Absent';
      const note = r.status === 'absent' ? 'Flagged for follow-up' : '—';
      const classTypeKey = (r.classType || r.class_type || '').toLowerCase();
      const classTypeBadge = classTypeKey ? `<span class="class-type ${classTypeKey}">${r.classType || r.class_type}</span>` : '';
      return `<tr>
      <td><div class="student-name">${r.moduleName}</div></td>
      <td>${classTypeBadge}</td>
      <td>${r.date}</td>
      <td><span class="tag ${tagClass}">${label}</span></td>
      <td>${r.instructor || ''}</td>
      <td>${note}</td>
    </tr>`;
    }).join('');
    return dayHeader + dayRows;
  }).join('');
  document.getElementById('attendanceMeta').textContent = `${rows.length} sessions on record · Student Services sync`;
}

document.querySelectorAll('#attendance .pill-filters .pill').forEach(pill => pill.addEventListener('click', () => {
  pill.parentElement.querySelectorAll('.pill').forEach(item => item.classList.remove('active'));
  pill.classList.add('active');
  renderAttendanceTable(lastAttendanceRows, pill.dataset.filter || 'all');
}));

// ---------------- fees & payments ----------------
let lastFees = [];
function renderFees(rows, filter = 'all') {
  lastFees = rows;
  const filtered = filter === 'all' ? lastFees : lastFees.filter(f => f.status === filter);
  const tbody = document.getElementById('feesTableBody');

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:24px;">No fees match this filter.</td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(f => {
      const tagClass = f.status === 'paid' ? 'ok' : f.status === 'overdue' ? 'overdue' : 'due-soon';
      const label = f.status === 'paid' ? 'Paid' : f.status === 'overdue' ? 'Overdue' : 'Due';
      return `<tr>
        <td><div class="student-name">${f.description}</div></td>
        <td>NPR ${Number(f.amount).toLocaleString()}</td>
        <td>${new Date(f.due_date).toLocaleDateString()}</td>
        <td><span class="tag ${tagClass}">${label}</span></td>
      </tr>`;
    }).join('');
  }

  const due = lastFees.filter(f => f.status === 'due').reduce((sum, f) => sum + Number(f.amount), 0);
  const overdue = lastFees.filter(f => f.status === 'overdue').reduce((sum, f) => sum + Number(f.amount), 0);
  document.getElementById('feesMeta').textContent =
    `NPR ${(due + overdue).toLocaleString()} outstanding` + (overdue ? ` (NPR ${overdue.toLocaleString()} overdue)` : '');
}

document.querySelectorAll('#feesFilters .pill').forEach(pill => pill.addEventListener('click', () => {
  pill.parentElement.querySelectorAll('.pill').forEach(item => item.classList.remove('active'));
  pill.classList.add('active');
  renderFees(lastFees, pill.dataset.filter || 'all');
}));

// ---------------- tickets / message student services ----------------
function renderTickets(rows) {
  const list = document.getElementById('ticketList');
  const openCount = rows.filter(t => t.status !== 'resolved').length;
  document.getElementById('ticketCount').textContent = `${openCount} open`;
  list.innerHTML = rows.map(t => {
    const tagClass = t.status === 'resolved' ? 'ok' : t.status === 'in_progress' ? 'due-soon' : 'pending';
    const tagLabel = t.status === 'resolved' ? 'Resolved' : t.status === 'in_progress' ? 'In review' : 'Open';
    // "Clear" only ever appears once a request is actually resolved — the
    // server enforces this too, so there's no way to hide an open one.
    const clearBtn = t.status === 'resolved'
      ? `<button class="text-btn" type="button" data-clear-ticket="${t.id}">Clear Request</button>`
      : '';
    return `<div class="ticket">
      <div class="ticket-top"><span class="tag ${tagClass}">${tagLabel}</span><span class="ticket-id">#SS-${1000 + t.id}</span></div>
      <div class="ticket-title">${t.category}</div>
      <div class="ticket-meta">${t.assigned_to ? 'Assigned to ' + t.assigned_to : 'Awaiting assignment'} · ${new Date(t.updated_at || t.created_at).toLocaleDateString()}</div>
      ${t.staff_reply ? `<div class="ticket-reply"><b>Reply:</b> ${t.staff_reply}</div>` : ''}
      ${clearBtn}
    </div>`;
  }).join('') || '<div style="color:var(--ink-faint);font-size:13px;">No requests yet.</div>';

  list.querySelectorAll('[data-clear-ticket]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/parent/tickets/${btn.dataset.clearTicket}/clear`, { method: 'PATCH' });
      const ticketsRes = await api(`/api/parent/students/${currentStudentId}/tickets`);
      renderTickets(ticketsRes.data);
      showToast('Request cleared.');
    } catch (err) {
      showToast(err.message);
    }
  }));
}

const serviceForm = document.getElementById('serviceForm');
serviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authToken) { showToast('Please log in first.'); return; }
  const category = document.getElementById('serviceCategory').value;
  const priorityRaw = document.getElementById('servicePriority').value;
  const message = document.getElementById('serviceMessage').value.trim();
  if (!category || !message) { showToast('Choose a category and add a short message.'); return; }
  const priority = priorityRaw.startsWith('Urgent') ? 'urgent' : 'standard';

  try {
    await api('/api/parent/tickets', {
      method: 'POST',
      body: JSON.stringify({ studentId: currentStudentId, category, message, priority }),
    });
    serviceForm.reset();
    const ticketsRes = await api(`/api/parent/students/${currentStudentId}/tickets`);
    renderTickets(ticketsRes.data);
    showToast('Request created and routed to Student Services.');
  } catch (err) {
    showToast(err.message);
  }
});

// ---------------- boot ----------------
if (authToken && currentUser) {
  setSignedInUI();
  loadParentData();
}

// ---------------- academic progress (real attendance, split by term) ----------------
let academicProgressData = null;
async function loadAcademicProgress(studentId) {
  try {
    const res = await api(`/api/parent/students/${studentId}/academic-progress`);
    academicProgressData = res.data;
    renderAcademicProgress('thisTerm');
  } catch (err) {
    showToast(err.message);
  }
}

function renderAcademicProgress(term) {
  const list = document.getElementById('progressList');
  const title = document.getElementById('progressCardTitle');
  title.textContent = `Attendance by subject — ${term === 'thisTerm' ? 'this term' : 'last term'}`;
  if (!academicProgressData) return;

  const rows = academicProgressData[term] || [];
  if (!rows.length) {
    list.innerHTML = `<div style="color:var(--ink-faint);font-size:13px;">No attendance history yet for ${term === 'thisTerm' ? 'this' : 'last'} term.</div>`;
    return;
  }
  list.innerHTML = rows.map(m => `
    <div class="cat-row">
      <span class="name">${m.moduleName}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${m.attendancePct}%;background:${m.riskLevel === 'red' ? 'var(--brick)' : m.riskLevel === 'amber' ? 'var(--marigold)' : 'var(--teal)'}"></div></div>
      <span class="score">${m.attendancePct}%</span>
    </div>`).join('');
}

document.querySelectorAll('#progressToggle button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#progressToggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAcademicProgress(btn.dataset.term);
}));

// ---------------- lecturers & advisors removed on request ----------------

document.querySelectorAll('.pill-filters .pill').forEach(pill => {
  if (pill.closest('#attendance')) return; // already wired above with real filtering
  pill.addEventListener('click', () => {
    pill.parentElement.querySelectorAll('.pill').forEach(item => item.classList.remove('active'));
    pill.classList.add('active');
  });
});
