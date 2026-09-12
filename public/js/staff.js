/* Staff portal — wired to the real backend. Parent Messages, Appointments,
   Quick Actions (besides the sync button), Performance chart, Staff
   Activity, and Staff Directory are kept as static illustrative content
   (out of scope for this build). */

// ---------------- decorative UI (scroll-spy, reveal, bars, toggles) ----------------
const navItems = Array.from(document.querySelectorAll('#sideNav .nav-item'));
const sections = navItems.map(n => document.getElementById(n.dataset.target)).filter(Boolean);
function setActive(id){ navItems.forEach(n => n.classList.toggle('active', n.dataset.target === id)); }
navItems.forEach(item => item.addEventListener('click', () => setActive(item.dataset.target)));
const spy = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
}, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
sections.forEach(sec => spy.observe(sec));
setActive('overview');

const revealEls = document.querySelectorAll('.card, .qa-card, .site-footer');
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting){ entry.target.classList.add('in-view'); revealIO.unobserve(entry.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
revealEls.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 60 + 'ms'; revealIO.observe(el); });

const bars = document.querySelectorAll('.bar-fill');
const barIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting){ entry.target.style.width = entry.target.getAttribute('data-w') + '%'; barIO.unobserve(entry.target); } });
}, { threshold: 0.3 });
bars.forEach(b => barIO.observe(b));

document.querySelectorAll('.view-toggle button').forEach(btn => btn.addEventListener('click', () => {
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}));

const toast = document.getElementById('toast');
let toastTimer;
function showToast(message){
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ---------------- auth: this page requires a signed-in staff account ----------------
let authToken = localStorage.getItem('balx_staff_token') || null;
let currentUser = JSON.parse(localStorage.getItem('balx_staff_user') || 'null');
let lastTickets = [];

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

const staffLoginBtn = document.getElementById('staffLoginBtn');
const staffProfilePill = document.getElementById('staffProfilePill');

function signOut() {
  localStorage.removeItem('balx_staff_token');
  localStorage.removeItem('balx_staff_user');
  window.location.href = '/';
}

staffLoginBtn.addEventListener('click', signOut);
staffProfilePill.addEventListener('click', signOut);
staffProfilePill.style.cursor = 'pointer';
staffProfilePill.title = 'Sign out';

// No valid session? Send them back to the main login gate.
if (!authToken || !currentUser) {
  window.location.href = '/';
}

function setSignedInUI() {
  staffLoginBtn.hidden = true;
  staffProfilePill.hidden = false;
  document.getElementById('staffAvatar').textContent = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('staffName').textContent = currentUser.name;
  document.getElementById('staffGreeting').textContent = 'Welcome SSD';
}

// ---------------- dashboard stats (live, real data only) ----------------
// Every number shown below comes from GET /api/staff/stats, which the backend
// computes straight from the actual tables — nothing here is hardcoded.
let liveStats = null;

async function loadStats() {
  try {
    const res = await api('/api/staff/stats');
    liveStats = res.data;
    const s = res.data;
    const total = s.totalTickets || 0;
    const open = s.openTickets || 0;
    const resolved = s.resolvedTickets || 0;
    const resRate = total ? Math.round((resolved / total) * 100) : 0;
    const onTrack = (s.totalStudents || 0) - (s.byRisk?.red || 0);
    const trackRate = s.totalStudents ? Math.round((onTrack / s.totalStudents) * 100) : 0;

    // Stat cards
    document.getElementById('statOpenRequests').textContent = open;
    document.getElementById('statResolvedRequests').textContent = resolved;
    document.getElementById('statTotalStudents').textContent = s.totalStudents ?? 0;
    document.getElementById('statActiveAlerts').textContent = s.activeAlerts ?? 0;
    document.getElementById('statOpenTrend').textContent = `▲ ${open} open`;
    document.getElementById('statResolvedTrend').textContent = `▲ ${resRate}% rate`;
    document.getElementById('statStudentsTrend').textContent = `▲ ${s.byRisk?.green ?? 0} green`;
    document.getElementById('statAlertsTrend').textContent = `${s.byRisk?.amber ?? 0} amber · ${s.byRisk?.red ?? 0} red`;

    // Hero rings + streak
    setRing('resolvedRing', 'resolvedRingValue', resRate);
    setRing('studentsRing', 'studentsRingValue', trackRate);
    document.getElementById('openCasesNum').textContent = open;
    document.getElementById('heroSummary').textContent =
      `${open} open request${open === 1 ? '' : 's'} and ${s.activeAlerts ?? 0} student alert${(s.activeAlerts ?? 0) === 1 ? '' : 's'} right now, across ${s.totalStudents ?? 0} student${(s.totalStudents ?? 0) === 1 ? '' : 's'}.`;

    // Section meta lines
    document.getElementById('requestsMeta').textContent = `${total} request${total === 1 ? '' : 's'} on record · ${open} open`;
    document.getElementById('parentMessagesMeta').textContent = `${total} from parents · ${open} awaiting a reply`;
    document.getElementById('directoryMeta').textContent = `${s.staffAccounts ?? 0} advisor${(s.staffAccounts ?? 0) === 1 ? '' : 's'} on duty`;

    // Sidebar badges
    document.getElementById('badgeRequests').textContent = open;
    document.getElementById('badgeMessages').textContent = total;
    document.getElementById('badgeAlerts').textContent = s.activeAlerts ?? 0;

    // Closing strip
    document.getElementById('cdOpenCases').textContent = open;
    document.getElementById('cdParentMsgs').textContent = total;
    document.getElementById('cdStaffOnDuty').textContent = s.staffAccounts ?? 0;

    // Attendance risk bars (Performance section)
    const totalStudents = s.totalStudents || 1;
    setBar('barGreen', 'scoreGreen', s.byRisk?.green ?? 0, totalStudents);
    setBar('barAmber', 'scoreAmber', s.byRisk?.amber ?? 0, totalStudents);
    setBar('barRed', 'scoreRed', s.byRisk?.red ?? 0, totalStudents);

    // Staff directory from real accounts
    renderStaffDirectory(s.staffAccounts ?? 0, s.parentAccounts ?? 0);
  } catch (err) {
    showToast(err.message);
  }
}

function setRing(ringId, valueId, pct) {
  const ring = document.getElementById(ringId);
  const value = document.getElementById(valueId);
  if (!ring || !value) return;
  const clamped = Math.max(0, Math.min(100, pct));
  ring.style.setProperty('--pct', clamped);
  value.textContent = `${clamped}%`;
}

function setBar(barId, scoreId, count, total) {
  const bar = document.getElementById(barId);
  const score = document.getElementById(scoreId);
  if (!bar || !score) return;
  const pct = total ? Math.round((count / total) * 100) : 0;
  bar.setAttribute('data-w', String(pct));
  score.textContent = `${count} (${pct}%)`;
  bar.style.width = `${pct}%`;
}

// ---------------- data loading ----------------
async function loadStaffData() {
  await Promise.all([loadStats(), loadTickets(), loadAlerts()]);
}

async function loadTickets() {
  try {
    const res = await api('/api/staff/tickets');
    lastTickets = res.data;
    renderTickets(lastTickets, document.querySelector('#requestsFilters .pill.active')?.dataset.filter || 'all');
    renderParentMessages(lastTickets, document.querySelector('#parentMessagesFilters .pill.active')?.dataset.filter || 'all');
  } catch (err) { showToast(err.message); }
}

function renderTickets(rows, filter) {
  const tbody = document.getElementById('ticketsTableBody');
  const filtered = filter === 'all' ? rows
    : filter === 'urgent' ? rows.filter(t => t.priority === 'urgent')
    : rows.filter(t => t.status === filter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:24px;">No requests match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const initials = t.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const tagClass = t.status === 'resolved' ? 'ok' : t.status === 'in_progress' ? 'due-soon' : (t.priority === 'urgent' ? 'overdue' : 'pending');
    const tagLabel = t.status === 'resolved' ? 'Resolved' : t.status === 'in_progress' ? 'In progress' : (t.priority === 'urgent' ? 'Urgent' : 'Open');
    const isResolved = t.status === 'resolved';
    // The clear icon only ever works once a request is resolved — the
    // server enforces this too, so this is a UX nicety, not the real gate.
    const clearIcon = isResolved
      ? `<button class="row-action" data-clear-ticket="${t.id}" title="Clear this resolved request" aria-label="Clear request">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        </button>`
      : `<button class="row-action" disabled title="Resolve this request before it can be cleared" aria-label="Cannot clear until resolved" style="opacity:.35;cursor:not-allowed;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        </button>`;
    return `<tr>
      <td><div class="student-cell"><div class="mini-avatar" style="background:linear-gradient(135deg,#3B6E91,#294E68)">${initials}</div><div><div class="student-name">${t.studentName}</div><div class="student-id">${t.student_id} · ${t.category}</div></div></div></td>
      <td>${t.message}</td>
      <td><span class="priority-dot"><span style="background:${t.priority === 'urgent' ? 'var(--brick)' : 'var(--azure)'}"></span>${t.priority === 'urgent' ? 'High' : 'Standard'}</span></td>
      <td><span class="tag ${tagClass}">${tagLabel}</span></td>
      <td>${t.assigned_to || 'Unassigned'}</td>
      <td>
        <select class="status-select" data-ticket-id="${t.id}">
          <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In progress</option>
          <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </td>
      <td>${clearIcon}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/staff/tickets/${select.dataset.ticketId}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
        showToast('Ticket updated.');
        await loadTickets();
      } catch (err) { showToast(err.message); }
    });
  });

  tbody.querySelectorAll('[data-clear-ticket]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/staff/tickets/${btn.dataset.clearTicket}`, { method: 'PATCH', body: JSON.stringify({ cleared: true }) });
        showToast('Request cleared.');
        await loadTickets();
      } catch (err) { showToast(err.message); }
    });
  });
}

document.querySelectorAll('#requestsFilters .pill').forEach(pill => pill.addEventListener('click', () => {
  document.querySelectorAll('#requestsFilters .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  renderTickets(lastTickets, pill.dataset.filter || 'all');
}));

// ---------------- Parent Messages (same real tickets, inbox-style view) ----------------
// This is the SAME data as Student Requests — every row here is a real
// message a parent actually submitted through "Message Student Services"
// on the parent portal. Nothing here is invented; if no parent has written
// in yet, the table says so honestly instead of showing example rows.
function renderParentMessages(rows, filter) {
  const tbody = document.getElementById('parentMessagesBody');
  const filtered = filter === 'all' ? rows
    : filter === 'replied' ? rows.filter(t => !!t.staff_reply)
    : rows.filter(t => !t.staff_reply); // "open" / awaiting a reply

  document.getElementById('parentMessagesMeta').textContent =
    rows.length ? `${rows.length} message${rows.length === 1 ? '' : 's'} · ${rows.filter(t => !t.staff_reply).length} awaiting a reply` : 'No messages yet';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">No message yet.</td></tr>`;
    return;
  }
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">No messages match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const hasReply = !!t.staff_reply;
    const replyPreview = hasReply ? `<div class="ticket-reply" style="margin-top:6px;">${t.staff_reply}</div>` : '';
    return `<tr>
      <td><div class="student-name">${t.parentName || 'Unknown parent'}</div></td>
      <td>${t.studentName}</td>
      <td>${t.message}${replyPreview}</td>
      <td><span class="tag ${t.category === 'Attendance concern' ? 'pending' : t.category?.toLowerCase().includes('fee') ? 'due-soon' : 'ok'}">${t.category}</span></td>
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td>
        <button class="pay-btn" data-reply-ticket="${t.id}">${hasReply ? 'Edit reply' : 'Reply'}</button>
        ${t.status !== 'resolved' ? `<button class="pay-btn outline" data-mark-done="${t.id}">Mark done</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-reply-ticket]').forEach(btn => btn.addEventListener('click', async () => {
    const ticket = lastTickets.find(t => t.id === Number(btn.dataset.replyTicket));
    const reply = prompt('Type your reply to this parent:', ticket?.staff_reply || '');
    if (reply === null || !reply.trim()) return; // cancelled or empty
    try {
      await api(`/api/staff/tickets/${btn.dataset.replyTicket}`, { method: 'PATCH', body: JSON.stringify({ reply: reply.trim() }) });
      showToast('Reply sent.');
      await loadTickets();
    } catch (err) { showToast(err.message); }
  }));

  tbody.querySelectorAll('[data-mark-done]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/staff/tickets/${btn.dataset.markDone}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
      showToast('Marked done.');
      await loadTickets();
    } catch (err) { showToast(err.message); }
  }));
}

document.querySelectorAll('#parentMessagesFilters .pill').forEach(pill => pill.addEventListener('click', () => {
  document.querySelectorAll('#parentMessagesFilters .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  renderParentMessages(lastTickets, pill.dataset.filter || 'all');
}));

let lastAlerts = [];
let alertsShownCount = 10;
const ALERTS_PAGE_SIZE = 10;

async function loadAlerts() {
  try {
    const res = await api('/api/staff/attendance-summary?risk=amber,red');
    // Worst attendance first — lowest percentage at the top, so the
    // students who need attention most are never buried on page 2.
    lastAlerts = res.data.slice().sort((a, b) => a.attendance_percentage - b.attendance_percentage);
    alertsShownCount = ALERTS_PAGE_SIZE;
    renderAlerts();
  } catch (err) { showToast(err.message); }
}

function renderAlerts() {
  const list = document.getElementById('studentAlertsList');
  const seeMoreBtn = document.getElementById('seeMoreAlerts');
  document.getElementById('alertsMeta').textContent = `${lastAlerts.length} need review`;

  if (!lastAlerts.length) {
    list.innerHTML = `<div class="alert-row"><div><div class="alert-title">No attendance concerns right now</div><div class="alert-desc">Everything is within normal range.</div></div></div>`;
    seeMoreBtn.hidden = true;
    return;
  }

  const visible = lastAlerts.slice(0, alertsShownCount);
  list.innerHTML = visible.map(r => {
    const severity = r.risk_level === 'red' ? 'high' : 'med';
    return `<div class="alert-row">
      <div class="alert-icon ${severity}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
      <div><div class="alert-title">${r.studentName} — ${r.moduleName}</div><div class="alert-desc">Attendance dropped to ${r.risk_level.toUpperCase()} (${r.attendance_percentage}%).</div><div class="alert-time">Synced ${new Date(r.last_synced_at).toLocaleString()}</div></div>
    </div>`;
  }).join('');

  seeMoreBtn.hidden = alertsShownCount >= lastAlerts.length;
}

document.getElementById('seeMoreAlerts').addEventListener('click', () => {
  alertsShownCount += ALERTS_PAGE_SIZE;
  renderAlerts();
});

document.getElementById('runSyncBtn').addEventListener('click', async () => {
  if (!authToken) { showToast('Please log in first.'); return; }
  try {
    const res = await api('/api/staff/sync-attendance', { method: 'POST' });
    showToast(res.message);
    await loadAlerts();
  } catch (err) { showToast(err.message); }
});

// ---------------- attendance log lookup (real data) ----------------
const attendanceSearchInput = document.getElementById('attendanceSearch');
const attendanceResultEl = document.getElementById('attendanceResult');
let searchDebounce;

attendanceSearchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value;
  searchDebounce = setTimeout(() => runAttendanceSearch(q), 250);
});

async function runAttendanceSearch(query) {
  if (!authToken) {
    attendanceResultEl.innerHTML = '<div class="attendance-empty">Please log in as staff to search attendance records.</div>';
    return;
  }
  const q = query.trim();
  if (!q) {
    attendanceResultEl.innerHTML = '<div class="attendance-empty">Start typing a student\'s name above to pull up their full attendance record.</div>';
    return;
  }
  try {
    const searchRes = await api(`/api/staff/students/search?name=${encodeURIComponent(q)}`);
    const match = searchRes.data[0];
    if (!match) {
      attendanceResultEl.innerHTML = `<div class="attendance-empty">No student found matching "${query}". Check the spelling or try their full name.</div>`;
      return;
    }
    const attRes = await api(`/api/staff/students/${match.student_id}/attendance`);
    renderAttendanceGrid(match, attRes.data.attendance);
  } catch (err) {
    attendanceResultEl.innerHTML = `<div class="attendance-empty">${err.message}</div>`;
  }
}

function renderAttendanceGrid(student, records) {
  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent').length;

  const moduleInstructor = new Map();
  records.forEach(r => { if (!moduleInstructor.has(r.moduleName)) moduleInstructor.set(r.moduleName, r.instructor); });
  const modules = [...moduleInstructor.keys()];
  const dates = [...new Set(records.map(r => r.date))]; // already sorted desc by the API

  const byDateModule = {};
  records.forEach(r => { byDateModule[`${r.date}|${r.moduleName}`] = r; });

  const headHtml = `<tr><th>Date</th>${modules.map(m => `<th><div class="grid-subject">${m}</div><div class="grid-instructor">${moduleInstructor.get(m)}</div></th>`).join('')}</tr>`;

  const bodyHtml = dates.map(d => {
    const cells = modules.map(m => {
      const r = byDateModule[`${d}|${m}`];
      if (!r) return `<td class="grid-cell empty">—</td>`;
      const label = r.status === 'present' ? 'Present' : r.status === 'late' ? 'Late' : 'Absent';
      if (r.status === 'present') {
        return `<td class="grid-cell present"><div class="grid-cell-inner"><div class="grid-status">${label}</div></div></td>`;
      }
      const reason = !r.punch_in_time
        ? 'No punch-in recorded'
        : r.status === 'late'
          ? 'Punched in 10-14 minutes after the scheduled start'
          : 'Punch-in fell outside the valid window (too early, or 15+ minutes late)';
      const esc = (s) => String(s).replace(/"/g, '&quot;');
      return `<td class="grid-cell ${r.status} clickable" data-subject="${esc(m)}" data-date="${esc(d)}" data-status="${esc(label)}" data-reason="${esc(reason)}">
        <div class="grid-cell-inner"><div class="grid-status">${label}</div></div>
      </td>`;
    }).join('');
    return `<tr><td class="grid-date">${d}</td>${cells}</tr>`;
  }).join('');

  const initials = student.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  attendanceResultEl.innerHTML = `
    <div class="attendance-log-head-row">
      <div class="attendance-student-head">
        <div class="mini-avatar" style="width:44px;height:44px;border-radius:12px;font-size:14px;background:linear-gradient(135deg,#3B6E91,#294E68)">${initials}</div>
        <div><div class="student-name" style="font-size:16px;">${student.name}</div><div class="student-id">${student.student_id} · ${student.grade}, Section ${student.section}</div></div>
      </div>
      <div class="attendance-summary">
        <span class="chip">${present} present</span>
        <span class="chip late">${late} late</span>
        <span class="chip warn">${absent} absent</span>
      </div>
    </div>
    <div class="attendance-grid-scroll">
      <table class="req-table attendance-grid-table"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
    </div>
    <div class="attendance-legend">
      <span class="lg-item"><span class="lg-dot" style="background:var(--teal-tint);border:1px solid var(--teal)"></span>Present</span>
      <span class="lg-item"><span class="lg-dot" style="background:var(--marigold-tint);border:1px solid var(--marigold)"></span>Late</span>
      <span class="lg-item"><span class="lg-dot" style="background:var(--brick-tint);border:1px solid var(--brick)"></span>Absent</span>
    </div>`;
}

function closeAttendancePopover(){ document.querySelector('.cell-popover')?.remove(); }
document.addEventListener('click', (e) => {
  const cell = e.target.closest('.grid-cell.clickable');
  const wasOpenOnThisCell = cell && cell.querySelector('.cell-popover');
  closeAttendancePopover();
  if (!cell || wasOpenOnThisCell) return;
  const pop = document.createElement('div');
  pop.className = `cell-popover ${cell.classList.contains('late') ? 'late' : 'absent'}`;
  pop.innerHTML = `<div class="cell-popover-title">${cell.dataset.subject} · ${cell.dataset.date}</div><div class="cell-popover-status">${cell.dataset.status}</div><div class="cell-popover-reason">${cell.dataset.reason}</div>`;
  cell.appendChild(pop);
  e.stopPropagation();
});

// ---------------- notice composer ----------------
document.getElementById('noticeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('noticeStatus');
  if (!authToken) { status.textContent = 'Please log in first.'; return; }
  const title = document.getElementById('noticeTitle').value.trim();
  const body = document.getElementById('noticeBody').value.trim();
  const studentId = document.getElementById('noticeStudentId').value.trim() || null;
  const isUrgent = document.getElementById('noticeUrgent').checked;
  if (!title || !body) { status.textContent = 'Title and message are required.'; return; }
  try {
    await api('/api/staff/notices', { method: 'POST', body: JSON.stringify({ title, body, studentId, isUrgent }) });
    status.textContent = '';
    e.target.reset();
    showToast(studentId ? `Notice sent to ${studentId}.` : 'Notice broadcast to all parents.');
  } catch (err) { status.textContent = err.message; }
});

// ---------------- table filter pills (any remaining visual-only sections) ----------------
document.querySelectorAll('.pill-filters .pill').forEach(p => {
  if (p.closest('#requestsFilters') || p.closest('#parentMessagesFilters')) return; // already wired above with real filtering
  p.addEventListener('click', () => {
    p.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
  });
});

// ---------------- staff directory (real accounts from the stats endpoint) ----------------
function renderStaffDirectory(staffAccounts, parentAccounts) {
  const grid = document.getElementById('staffDirectoryGrid');
  if (!grid) return;
  const grad = ['linear-gradient(135deg,#3B6E91,#294E68)', 'linear-gradient(135deg,#E2A44E,#A6753A)', 'linear-gradient(135deg,#34614F,#1F4438)'];
  const cards = Array.from(grid.children);
  cards.forEach((card, i) => {
    if (i === 0) return; // the placeholder card stays as "Student Services"
    card.remove();
  });
  // There's exactly one real SSD account in the seed; show any extras from stats if present.
  for (let i = 1; i < (staffAccounts || 1); i++) {
    const div = document.createElement('div');
    div.className = 'card staff-card';
    div.innerHTML = `<div class="staff-avatar" style="background:${grad[i % grad.length]}">·</div><div class="staff-name">SSD staff</div><div class="staff-role">Student Affairs</div><div class="staff-stat">assigned</div>`;
    grid.appendChild(div);
  }
}

// ---------------- boot ----------------
if (authToken && currentUser) {
  setSignedInUI();
  loadStaffData();
}

// ---------------- static SVG bar chart (Performance section is out of scope) ----------------
const chartData = [
  { label:'Wk 1', handled:62, resolved:48 }, { label:'Wk 2', handled:71, resolved:55 }, { label:'Wk 3', handled:66, resolved:60 },
  { label:'Wk 4', handled:84, resolved:70 }, { label:'Wk 5', handled:78, resolved:74 }, { label:'Wk 6', handled:91, resolved:82 },
];
const svgNS = 'http://www.w3.org/2000/svg';
const chartEl = document.getElementById('perfChart');
if (chartEl) {
  const W=540,H=220,padL=26,padB=26,padT=10,padR=6;
  const chartW=W-padL-padR, chartH=H-padT-padB;
  const maxVal = Math.max(...chartData.map(d=>Math.max(d.handled,d.resolved)))*1.15;
  const groupW = chartW/chartData.length;
  const barW = 15;
  function y(v){ return padT + chartH - (v/maxVal)*chartH; }
  [0,0.25,0.5,0.75,1].forEach(f=>{
    const gy = padT + chartH*f;
    const line = document.createElementNS(svgNS,'line');
    line.setAttribute('x1',padL); line.setAttribute('x2',W-padR);
    line.setAttribute('y1',gy); line.setAttribute('y2',gy);
    line.setAttribute('stroke','#E9E4D3'); line.setAttribute('stroke-width','1');
    chartEl.appendChild(line);
  });
  chartData.forEach((d,i)=>{
    const cx = padL + groupW*i + groupW/2;
    [{val:d.handled,color:'#34614F',dx:-barW/2-3},{val:d.resolved,color:'#E2A44E',dx:3}].forEach(b=>{
      const rect = document.createElementNS(svgNS,'rect');
      const fullY = y(b.val), fullH = padT+chartH-fullY;
      rect.setAttribute('x', cx+b.dx); rect.setAttribute('width', barW); rect.setAttribute('rx', 4);
      rect.setAttribute('fill', b.color); rect.setAttribute('class','bar-col');
      rect.setAttribute('y', padT+chartH); rect.setAttribute('height', 0);
      chartEl.appendChild(rect);
      const title = document.createElementNS(svgNS,'title'); title.textContent = d.label + ': ' + b.val; rect.appendChild(title);
    });
    const label = document.createElementNS(svgNS,'text');
    label.setAttribute('x',cx); label.setAttribute('y',H-6); label.setAttribute('text-anchor','middle');
    label.setAttribute('font-size','10.5'); label.setAttribute('fill','#8A9389'); label.setAttribute('font-family','Inter, sans-serif');
    label.textContent = d.label;
    chartEl.appendChild(label);
  });
  const chartIO = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if (entry.isIntersecting){
        let idx=0;
        chartData.forEach((d,i)=>{
          [d.handled,d.resolved].forEach(val=>{
            const rect = chartEl.querySelectorAll('rect')[idx];
            const fullY = y(val), fullH = padT+chartH-fullY;
            rect.style.transition = `y .8s var(--ease) ${i*70}ms, height .8s var(--ease) ${i*70}ms`;
            rect.setAttribute('y', fullY); rect.setAttribute('height', fullH);
            idx++;
          });
        });
        chartIO.disconnect();
      }
    });
  }, { threshold:0.2 });
  chartIO.observe(chartEl);
}
