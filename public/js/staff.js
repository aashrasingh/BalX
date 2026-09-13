/* Staff portal — wired to the real backend. Every number, name, message,
   appointment, and alert on this page is either real data from the API or
   an honest "no info yet" empty state. Nothing here is fabricated. */

window.setTimeout(() => {
  document.getElementById('siteLoader')?.remove();
}, 500);

// ================================================================
// AUTH GUARD
// ================================================================
let authToken = localStorage.getItem('balx_staff_token') || null;
let currentUser = JSON.parse(localStorage.getItem('balx_staff_user') || 'null');
if (!authToken || !currentUser) { window.location.href = '/'; }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/* ============================================================================
   PAGE NAVIGATION
   ============================================================================ */
const navItems = Array.from(document.querySelectorAll('#sideNav .nav-item'));
let currentPage = 'page-overview';
let currentAnchor = null;
function setActiveNav(){
  navItems.forEach(item => {
    const samePage = item.dataset.page === currentPage && !item.dataset.anchor;
    const sameAnchor = item.dataset.anchor && item.dataset.anchor === currentAnchor;
    item.classList.toggle('active', currentAnchor ? sameAnchor : samePage);
  });
}
function goToPage(pageId, anchorId){
  currentPage = pageId;
  currentAnchor = anchorId || null;
  document.querySelectorAll('.page-view').forEach(view => { view.hidden = view.id !== pageId; });
  setActiveNav();
  requestAnimationFrame(() => {
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ behavior:'smooth', block:'start' });
    else window.scrollTo({ top:0, behavior:'smooth' });
    observeReveal();
  });
}
window.goToPage = goToPage; // referenced by inline onclick="" in the HTML
navItems.forEach(item => item.addEventListener('click', event => {
  event.preventDefault();
  goToPage(item.dataset.page, item.dataset.anchor || null);
}));
document.querySelectorAll('.stat-card[data-nav]').forEach(card => card.addEventListener('click', () => goToPage(card.dataset.nav)));

const revealIO = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting){ entry.target.classList.add('in-view'); revealIO.unobserve(entry.target); }
}), {threshold:.12, rootMargin:'0px 0px -6% 0px'});
function observeReveal(){
  document.querySelectorAll('.card:not(.in-view), .qa-card:not(.in-view)').forEach((el, i) => {
    el.style.transitionDelay = (i % 4) * 60 + 'ms';
    revealIO.observe(el);
  });
}

const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg){
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
document.getElementById('signOutBtn')?.addEventListener('click', signOut);
function signOut(){
  localStorage.removeItem('balx_staff_token');
  localStorage.removeItem('balx_staff_user');
  window.location.href = '/';
}
document.querySelector('.profile-pill')?.addEventListener('click', signOut);

/* ============================================================================
   STATE
   ============================================================================ */
let allStudents = [];
let allTickets = [];
let allAppointments = [];
let allFlagged = [];

/* ============================================================================
   BOOT
   ============================================================================ */
async function boot(){
  try {
    const [statsRes, studentsRes, ticketsRes, apptsRes, flaggedRes, activityRes, leaderboardRes] = await Promise.all([
      api('/api/staff/stats'),
      api('/api/staff/students'),
      api('/api/staff/tickets'),
      api('/api/staff/appointments'),
      api('/api/staff/attendance-summary?risk=amber,red'),
      api('/api/staff/activity'),
      api('/api/staff/fee-leaderboard'),
    ]);
    allStudents = studentsRes.data;
    allTickets = ticketsRes.data;
    allAppointments = apptsRes.data;
    allFlagged = flaggedRes.data.slice().sort((a,b) => a.attendance_percentage - b.attendance_percentage);

    renderHero(statsRes.data);
    renderStatCards(statsRes.data);
    renderActivity(activityRes.data);
    renderDirectory(statsRes.data);
    renderMessages();
    renderAppointments();
    renderAlerts();
    renderFeeLeaderboard(leaderboardRes.data);

    observeReveal();
    goToPage('page-overview');
  } catch (err) {
    showToast(err.message);
  }
}

function initials(name){ return (name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }
function gradFor(seed){
  const grads = ['linear-gradient(135deg,#3B6E91,#294E68)','linear-gradient(135deg,#70BE44,#438B25)','linear-gradient(135deg,#2A91B0,#176278)','linear-gradient(135deg,#BE5039,#8C3A28)','linear-gradient(135deg,#E2A44E,#A6753A)','linear-gradient(135deg,#34614F,#1F4438)'];
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % grads.length;
  return grads[h];
}

/* ---------------- Hero + stat cards ---------------- */
function renderHero(stats){
  document.querySelector('.topbar-left h1').textContent = `Welcome, ${currentUser.name}`;
  document.querySelector('.profile-pill .avatar').textContent = initials(currentUser.name);
  document.querySelector('.profile-pill .pn').textContent = currentUser.name;
  document.querySelector('.profile-pill .pr').textContent = 'Student Affairs';

  document.querySelector('#overview .hero-greeting p').textContent =
    `${stats.openTickets} open request${stats.openTickets===1?'':'s'} and ${stats.activeAlerts} student alert${stats.activeAlerts===1?'':'s'} need a follow-up right now.`;

  const rings = document.querySelectorAll('#overview .ring-stat');
  if (rings[0]) {
    rings[0].querySelector('.ring').style.setProperty('--pct', stats.resolutionRate ?? 0);
    rings[0].querySelector('.ring-value').textContent = stats.resolutionRate != null ? `${stats.resolutionRate}%` : '—';
    rings[0].querySelector('.ring-label').innerHTML = 'Resolution rate<br>all requests';
  }
  if (rings[1]) {
    rings[1].querySelector('.ring').style.setProperty('--pct', stats.goodStandingRate ?? 0);
    rings[1].querySelector('.ring-value').textContent = stats.goodStandingRate != null ? `${stats.goodStandingRate}%` : '—';
    rings[1].querySelector('.ring-label').innerHTML = 'Students in<br>good standing';
  }
  const streak = document.querySelector('#overview .streak');
  if (streak) {
    streak.querySelector('.num').textContent = stats.resolvedToday;
    streak.querySelector('.lbl').innerHTML = 'requests resolved<br>today';
  }
}

function renderStatCards(stats){
  const cards = document.querySelectorAll('#statsGrid .stat-card');
  if (cards[0]) { cards[0].querySelector('.stat-value').textContent = stats.openTickets; cards[0].querySelector('.stat-trend').textContent = `${stats.totalTickets} total`; }
  if (cards[1]) { cards[1].querySelector('.stat-value').textContent = stats.upcomingAppointments; cards[1].querySelector('.stat-trend').textContent = stats.upcomingAppointments ? 'Scheduled' : 'None yet'; }
  if (cards[2]) { cards[2].querySelector('.stat-value').textContent = stats.activeAlerts; cards[2].querySelector('.stat-trend').textContent = `${stats.byRisk.red} red · ${stats.byRisk.amber} amber`; }
}

/* ---------------- Staff activity (real events only) ---------------- */
function renderActivity(events){
  const card = document.getElementById('activityScroll');
  if (!events.length){
    card.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;padding:8px 0;">No info yet — no staff activity recorded.</div>';
    return;
  }
  card.innerHTML = events.map(e => `
    <div class="activity-item">
      <div class="activity-row">
        <div class="act-avatar" style="background:${gradFor(e.text)}">${initials(currentUser.name)}</div>
        <div><div class="act-text">${e.text}</div><div class="act-stamp">${new Date(e.time).toLocaleString()}</div></div>
      </div>
    </div>`).join('');
}

/* ---------------- Staff directory (real accounts) ---------------- */
function renderDirectory(stats){
  document.querySelector('#directory .meta').textContent = `${stats.staffAccounts} account${stats.staffAccounts===1?'':'s'} on duty`;
  const grid = document.querySelector('#directory .grid-3');
  grid.innerHTML = `<div class="card staff-card">
    <div class="staff-avatar" style="background:${gradFor('staff')}">SS</div>
    <div class="staff-name">Student Services</div>
    <div class="staff-role">Student Affairs Office</div>
    <div class="staff-stat">${stats.totalTickets} case${stats.totalTickets===1?'':'s'} this term</div>
  </div>`;
}

/* ---------------- Attendance Log lookup ---------------- */
const attendanceSearchInput = document.getElementById('attendanceSearch');
const attendanceResultEl = document.getElementById('attendanceResult');
let attnSearchDebounce;
attendanceSearchInput?.addEventListener('input', e => {
  clearTimeout(attnSearchDebounce);
  const q = e.target.value;
  attnSearchDebounce = setTimeout(() => runAttendanceSearch(q), 250);
});
async function runAttendanceSearch(query){
  const q = query.trim();
  if (!q){ attendanceResultEl.innerHTML = '<div class="attendance-empty">Start typing a student\'s name above to pull up their full attendance record.</div>'; return; }
  try {
    const searchRes = await api(`/api/staff/students/search?name=${encodeURIComponent(q)}`);
    const match = searchRes.data[0];
    if (!match){ attendanceResultEl.innerHTML = `<div class="attendance-empty">No student found matching "${query}".</div>`; return; }
    const attRes = await api(`/api/staff/students/${match.student_id}/attendance`);
    renderAttendanceGrid(match, attRes.data.attendance);
  } catch (err) { attendanceResultEl.innerHTML = `<div class="attendance-empty">${err.message}</div>`; }
}
function renderAttendanceGrid(student, records){
  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const moduleInstructor = new Map();
  records.forEach(r => { if (!moduleInstructor.has(r.moduleName)) moduleInstructor.set(r.moduleName, r.instructor); });
  const modulesList = [...moduleInstructor.keys()];
  const dates = [...new Set(records.map(r => r.date))];
  const byDateModule = {};
  records.forEach(r => { byDateModule[`${r.date}|${r.moduleName}`] = r; });
  const headHtml = `<tr><th>Date</th>${modulesList.map(m => `<th><div class="grid-subject">${m}</div><div class="grid-instructor">${moduleInstructor.get(m)}</div></th>`).join('')}</tr>`;
  const bodyHtml = dates.map(d => {
    const cells = modulesList.map(m => {
      const r = byDateModule[`${d}|${m}`];
      if (!r) return `<td class="grid-cell empty">—</td>`;
      const label = r.status === 'present' ? 'Present' : r.status === 'late' ? 'Late' : 'Absent';
      if (r.status === 'present') return `<td class="grid-cell present"><div class="grid-cell-inner"><div class="grid-status">${label}</div></div></td>`;
      const reason = !r.punch_in_time ? 'No punch-in recorded' : r.status === 'late' ? 'Punched in 10-14 minutes after the scheduled start' : 'Punch-in fell outside the valid window';
      return `<td class="grid-cell ${r.status} clickable" data-subject="${m}" data-date="${d}" data-status="${label}" data-reason="${reason}"><div class="grid-cell-inner"><div class="grid-status">${label}</div></div></td>`;
    }).join('');
    return `<tr><td class="grid-date">${d}</td>${cells}</tr>`;
  }).join('');
  attendanceResultEl.innerHTML = `
    <div class="attendance-log-head-row">
      <div class="attendance-student-head">
        <div class="mini-avatar" style="width:44px;height:44px;border-radius:12px;font-size:14px;background:${gradFor(student.name)}">${initials(student.name)}</div>
        <div><div class="student-name" style="font-size:16px;">${student.name}</div><div class="student-id">${student.student_id} · ${student.grade}</div></div>
      </div>
      <div class="attendance-summary"><span class="chip">${present} present</span><span class="chip late">${late} late</span><span class="chip warn">${absent} absent</span></div>
    </div>
    <div class="attendance-grid-scroll"><table class="req-table attendance-grid-table"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
}
document.addEventListener('click', event => {
  const cell = event.target.closest('.grid-cell.clickable');
  const already = cell && cell.querySelector('.cell-popover');
  document.querySelector('.cell-popover')?.remove();
  if (!cell || already) return;
  const pop = document.createElement('div');
  pop.className = `cell-popover ${cell.classList.contains('late') ? 'late' : 'absent'}`;
  pop.innerHTML = `<div class="cell-popover-title">${cell.dataset.subject} · ${cell.dataset.date}</div><div class="cell-popover-status">${cell.dataset.status}</div><div class="cell-popover-reason">${cell.dataset.reason}</div>`;
  cell.appendChild(pop);
  event.stopPropagation();
});

/* ---------------- Fee Log: leaderboard + search ---------------- */
function renderFeeLeaderboard(rows){
  const el = document.getElementById('feeLeaderboard');
  if (!rows.length){ el.innerHTML = '<div class="attn-empty">No info yet — no fee records exist.</div>'; return; }
  el.innerHTML = rows.map((r, i) => `
    <div class="fee-leader-row" data-student="${r.studentId}" style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px dashed var(--line);cursor:pointer;">
      <div style="width:22px;text-align:center;color:var(--ink-faint);font-weight:700;">${i+1}</div>
      <div class="mini-avatar" style="background:${gradFor(r.studentName)}">${initials(r.studentName)}</div>
      <div style="flex:1;"><div class="student-name">${r.studentName}</div><div class="student-id">${r.studentId} · ${r.grade}</div></div>
      <div style="text-align:right;"><div style="font-weight:700;">Rs ${Number(r.outstanding).toLocaleString('en-IN')}</div>${r.overdueCount ? `<span class="tag overdue">${r.overdueCount} overdue</span>` : (Number(r.outstanding) === 0 ? '<span class="tag ok">Clear</span>' : '<span class="tag due-soon">Due</span>')}</div>
    </div>`).join('');
  el.querySelectorAll('[data-student]').forEach(row => row.addEventListener('click', () => openFeeDetailModal(row.dataset.student)));
}

/* Fee detail modal — opened from a leaderboard row. Real per-student fee record. */
async function openFeeDetailModal(studentId){
  const student = allStudents.find(s => s.student_id === studentId);
  const feesRes = await api(`/api/parent/students/${studentId}/fees`).catch(() => ({ data: [] }));
  const fees = feesRes.data || [];
  document.getElementById('feeDetailTitle').textContent = student ? `${student.name}'s fee record` : 'Student fee record';
  const total = fees.reduce((s,f) => s + Number(f.amount), 0);
  const paid = fees.filter(f => f.status === 'paid').reduce((s,f) => s + Number(f.amount), 0);
  const rows = fees.map(f => `<tr><td>${f.description}</td><td>Rs ${Number(f.amount).toLocaleString('en-IN')}</td><td>${new Date(f.due_date).toLocaleDateString()}</td><td><span class="tag ${f.status==='paid'?'ok':f.status==='overdue'?'overdue':'due-soon'}">${f.status}</span></td></tr>`).join('');
  document.getElementById('feeDetailBody').innerHTML = `
    <div class="attendance-student-head" style="margin-bottom:16px;">
      <div class="mini-avatar" style="width:44px;height:44px;border-radius:12px;background:${gradFor(student?.name || studentId)}">${initials(student?.name || studentId)}</div>
      <div><div class="student-name" style="font-size:16px;">${student?.name || studentId}</div><div class="student-id">Total Rs ${total.toLocaleString('en-IN')} · Rs ${paid.toLocaleString('en-IN')} paid</div></div>
    </div>
    <table class="req-table"><thead><tr><th>Item</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);">No fees on record.</td></tr>'}</tbody></table>`;
  document.getElementById('feeDetailBackdrop').classList.add('open');
  document.getElementById('feeDetailModal').classList.add('open');
}
document.getElementById('feeDetailClose').addEventListener('click', closeFeeDetailModal);
document.getElementById('feeDetailBackdrop').addEventListener('click', closeFeeDetailModal);
function closeFeeDetailModal(){
  document.getElementById('feeDetailBackdrop').classList.remove('open');
  document.getElementById('feeDetailModal').classList.remove('open');
}

/* ---------------- Parent Messages (real tickets, day-grouped) ---------------- */
function dayBucket(dateStr){
  const d = new Date(dateStr); const today = new Date();
  const diffDays = Math.floor((today - d) / 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7 && diffDays > 0) return d.toLocaleDateString(undefined, { weekday:'long' });
  return d.toLocaleDateString();
}
function renderMessages(){
  const container = document.getElementById('messagesTable');
  document.querySelector('#parent-messages .meta').textContent = allTickets.length
    ? `${allTickets.filter(t => t.status !== 'resolved').length} awaiting a reply`
    : 'No info yet';

  if (!allTickets.length){
    container.innerHTML = '<div class="attn-empty">No message yet.</div>';
    return;
  }
  const groups = new Map();
  for (const t of allTickets) {
    const bucket = dayBucket(t.created_at);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(t);
  }
  container.innerHTML = [...groups.entries()].map(([label, items]) => `
    <section class="appt-day ${label === 'Today' ? 'appt-day-today' : ''}">
      <div class="appt-day-head"><h3>${label}</h3><span class="appt-day-count">${items.length} message${items.length===1?'':'s'}</span></div>
      <div class="card">${items.map(t => renderMessageItem(t)).join('')}</div>
    </section>`).join('');

  container.querySelectorAll('[data-reply]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMessageDetail(Number(btn.dataset.reply));
  }));
  container.querySelectorAll('[data-open-message]').forEach(el => el.addEventListener('click', () => openMessageDetail(Number(el.dataset.openMessage))));

  const filters = document.getElementById('messagesFilters');
  filters.onclick = e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filters.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    container.querySelectorAll('.msg-item').forEach(item => {
      const match = filter === 'all' || (filter === 'needs-reply' ? item.dataset.needsReply === 'true' : item.dataset.topic === filter);
      item.style.display = match ? '' : 'none';
    });
  };
}
function renderMessageItem(t){
  const needsReply = t.status !== 'resolved';
  const topic = t.category?.toLowerCase().includes('attend') ? 'attendance' : t.category?.toLowerCase().includes('fee') ? 'fees' : 'academic';
  const priorityTag = t.priority === 'urgent' ? '<span class="tag urgent">Urgent</span>' : '<span class="tag normal">Normal</span>';
  return `<div class="msg-item" data-topic="${topic}" data-needs-reply="${needsReply}">
    <div class="msg-row" data-open-message="${t.id}" style="cursor:pointer;">
      <div class="msg-avatar" style="background:${gradFor(t.parentName)}">${initials(t.parentName)}</div>
      <div>
        <div class="msg-parent">${t.parentName} <span class="msg-student">— parent of ${t.studentName}</span></div>
        <div class="msg-subject">${t.message}</div>
      </div>
      <div class="msg-tags">${priorityTag}<span class="tag ${topic==='attendance'?'pending':topic==='fees'?'due-soon':'ok'}">${t.category}</span></div>
      <div class="msg-meta">
        <span class="msg-time">${new Date(t.created_at).toLocaleString()}</span>
        ${needsReply ? `<button class="act-btn" data-reply="${t.id}">Reply</button>` : `<button class="act-btn outline" disabled>Done ✓</button>`}
      </div>
    </div>
    ${t.staff_reply ? `<div class="msg-more"><b>Your reply:</b> ${t.staff_reply}</div>` : ''}
  </div>`;
}
async function refreshTicketsData(){
  const res = await api('/api/staff/tickets');
  allTickets = res.data;
  renderMessages();
  const statsRes = await api('/api/staff/stats');
  renderStatCards(statsRes.data);
  renderHero(statsRes.data);
}

/* Message detail modal */
let mdmCurrentId = null;
function openMessageDetail(id){
  const t = allTickets.find(x => x.id === id);
  if (!t) return;
  mdmCurrentId = id;
  document.getElementById('mdmSubject').textContent = t.category;
  document.getElementById('mdmParent').textContent = `${t.parentName} — parent of ${t.studentName}`;
  document.getElementById('mdmTime').textContent = new Date(t.created_at).toLocaleString();
  document.getElementById('mdmTags').innerHTML = `<span class="tag ${t.priority==='urgent'?'urgent':'normal'}">${t.priority}</span><span class="tag ok">${t.status}</span>`;
  document.getElementById('mdmText').textContent = t.message;
  // Pre-fill with the existing reply (if any) so staff can review/edit it —
  // this is a real inline field, not a browser prompt() popup, since a
  // native prompt() doesn't behave reliably once this is actually deployed.
  document.getElementById('mdmReplyText').value = t.staff_reply || '';
  const markDoneBtn = document.getElementById('mdmMarkDone');
  markDoneBtn.disabled = t.status === 'resolved';
  markDoneBtn.textContent = t.status === 'resolved' ? 'Done ✓' : 'Mark done';
  document.getElementById('messageDetailBackdrop').classList.add('open');
  document.getElementById('messageDetailModal').classList.add('open');
}
document.getElementById('messageDetailClose').addEventListener('click', closeMessageDetail);
document.getElementById('messageDetailBackdrop').addEventListener('click', closeMessageDetail);
function closeMessageDetail(){
  document.getElementById('messageDetailBackdrop').classList.remove('open');
  document.getElementById('messageDetailModal').classList.remove('open');
}
document.getElementById('mdmMarkDone').addEventListener('click', async () => {
  if (!mdmCurrentId) return;
  await api(`/api/staff/tickets/${mdmCurrentId}`, { method:'PATCH', body: JSON.stringify({ status:'resolved' }) });
  showToast('Marked done.');
  closeMessageDetail();
  await refreshTicketsData();
});
document.getElementById('mdmReply').addEventListener('click', async () => {
  const reply = document.getElementById('mdmReplyText').value.trim();
  if (!reply || !mdmCurrentId){ showToast('Type a reply first.'); return; }
  try {
    await api(`/api/staff/tickets/${mdmCurrentId}`, { method:'PATCH', body: JSON.stringify({ reply }) });
    showToast('Reply sent — the parent will see it on their portal.');
    closeMessageDetail();
    await refreshTicketsData();
  } catch (err) { showToast(err.message); }
});

/* ---------------- Compose message modal (creates a real targeted notice) ---------------- */
function setupPersonCombo(inputId, hiddenId, suggestId){
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  const suggest = document.getElementById(suggestId);
  let debounce;
  input.addEventListener('input', () => {
    hidden.value = '';
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q){ suggest.hidden = true; return; }
    debounce = setTimeout(async () => {
      const res = await api(`/api/staff/students/search?name=${encodeURIComponent(q)}`);
      if (!res.data.length){ suggest.hidden = true; return; }
      suggest.hidden = false;
      suggest.innerHTML = res.data.map(s => `<div class="fee-suggest-row" data-student="${s.student_id}" data-name="${s.name}" style="padding:9px 12px;cursor:pointer;">${s.name} <span style="color:var(--ink-faint);font-size:11px;">${s.student_id}</span></div>`).join('');
      suggest.querySelectorAll('[data-student]').forEach(row => row.addEventListener('click', () => {
        input.value = row.dataset.name;
        hidden.value = row.dataset.student;
        suggest.hidden = true;
      }));
    }, 200);
  });
}
setupPersonCombo('composeParentInput', 'composeParent', 'composeParentSuggest');
setupPersonCombo('apptParentInput', 'apptParent', 'apptParentSuggest');

function openComposeModal(prefillName, prefillSubject){
  document.getElementById('composeParentInput').value = prefillName || '';
  document.getElementById('composeParent').value = '';
  document.getElementById('composeSubject').value = prefillSubject || '';
  document.getElementById('composeMessage').value = '';
  document.getElementById('composeBackdrop').classList.add('open');
  document.getElementById('composeModal').classList.add('open');
}
window.openComposeModal = openComposeModal;
function closeComposeModal(){
  document.getElementById('composeBackdrop').classList.remove('open');
  document.getElementById('composeModal').classList.remove('open');
}
document.getElementById('composeClose').addEventListener('click', closeComposeModal);
document.getElementById('composeCancel').addEventListener('click', closeComposeModal);
document.getElementById('composeBackdrop').addEventListener('click', closeComposeModal);
document.getElementById('composeSend').addEventListener('click', async () => {
  const studentId = document.getElementById('composeParent').value;
  const subject = document.getElementById('composeSubject').value.trim();
  const message = document.getElementById('composeMessage').value.trim();
  if (!studentId){ showToast('Pick a student from the suggestions list.'); return; }
  if (!subject || !message){ showToast('Add a subject and a message.'); return; }
  try {
    await api('/api/staff/notices', { method:'POST', body: JSON.stringify({ title: subject, body: message, studentId, isUrgent: false, category: 'general' }) });
    showToast('Message sent.');
    closeComposeModal();
  } catch (err) { showToast(err.message); }
});

/* ---------------- Appointments (real, day-grouped) ---------------- */
function renderAppointments(){
  const container = document.querySelector('#page-appointments .appt-timeline');
  if (!allAppointments.length){
    container.innerHTML = '<div class="attn-empty">No info yet — no appointments scheduled.</div>';
    return;
  }
  const groups = new Map();
  for (const a of allAppointments) {
    const bucket = dayBucket(a.appt_date);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(a);
  }
  container.innerHTML = [...groups.entries()].map(([label, items]) => `
    <section class="appt-day ${label === 'Today' ? 'appt-day-today' : ''}">
      <div class="appt-day-head"><h3>${label}</h3><span class="appt-day-count">${items.length} appointment${items.length===1?'':'s'}</span></div>
      <div class="card">${items.map(a => `
        <div class="appt-item">
          <div class="appt-row">
            <div class="appt-time"><div class="t">${a.appt_time ? a.appt_time.slice(0,5) : '—'}</div><div class="m">${a.appt_time ? '' : 'TBD'}</div></div>
            <div class="appt-rail"></div>
            <div><div class="appt-name">${a.parent_name}</div><div class="appt-type">${a.type}${a.studentName ? ' · ' + a.studentName : ''}</div></div>
            <span class="tag ${a.type === 'Video' ? 'due-soon' : 'ok'}">${a.type}</span>
            ${a.status !== 'completed' ? `<button class="row-action" data-complete-appt="${a.id}" title="Mark completed">✓</button>` : '<span class="tag ok">Done</span>'}
          </div>
          ${a.notes ? `<div class="appt-more"><b>Notes:</b> ${a.notes}</div>` : ''}
        </div>`).join('')}</div>
    </section>`).join('');
  container.querySelectorAll('[data-complete-appt]').forEach(btn => btn.addEventListener('click', async () => {
    await api(`/api/staff/appointments/${btn.dataset.completeAppt}`, { method:'PATCH', body: JSON.stringify({ status:'completed' }) });
    const res = await api('/api/staff/appointments');
    allAppointments = res.data;
    renderAppointments();
    showToast('Marked completed.');
  }));
}
function openApptModal(){
  document.getElementById('apptParentInput').value = '';
  document.getElementById('apptParent').value = '';
  document.getElementById('apptType').value = 'In-person';
  document.getElementById('apptDate').value = '';
  document.getElementById('apptTime').value = '';
  document.getElementById('apptNotes').value = '';
  document.getElementById('apptBackdrop').classList.add('open');
  document.getElementById('apptModal').classList.add('open');
}
window.openApptModal = openApptModal;
function closeApptModal(){
  document.getElementById('apptBackdrop').classList.remove('open');
  document.getElementById('apptModal').classList.remove('open');
}
document.getElementById('apptClose').addEventListener('click', closeApptModal);
document.getElementById('apptCancel').addEventListener('click', closeApptModal);
document.getElementById('apptBackdrop').addEventListener('click', closeApptModal);
document.getElementById('apptSave').addEventListener('click', async () => {
  const studentId = document.getElementById('apptParent').value || null;
  const parentInputVal = document.getElementById('apptParentInput').value.trim();
  const type = document.getElementById('apptType').value;
  const apptDate = document.getElementById('apptDate').value;
  const apptTime = document.getElementById('apptTime').value;
  const notes = document.getElementById('apptNotes').value.trim();
  if (!parentInputVal || !apptDate){ showToast('Add a name and a date.'); return; }
  try {
    await api('/api/staff/appointments', { method:'POST', body: JSON.stringify({ studentId, parentName: parentInputVal, type, apptDate, apptTime, notes }) });
    showToast('Appointment saved.');
    closeApptModal();
    const [apptsRes, statsRes] = await Promise.all([api('/api/staff/appointments'), api('/api/staff/stats')]);
    allAppointments = apptsRes.data;
    renderAppointments();
    renderStatCards(statsRes.data);
    renderHero(statsRes.data);
  } catch (err) { showToast(err.message); }
});

/* ---------------- Alerts (real — attendance risk + urgent open requests) ---------------- */
function renderAlerts(){
  const container = document.querySelector('.alert-groups');
  const attendanceAlerts = allFlagged;
  const urgentRequests = allTickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved');

  const groups = [];
  if (attendanceAlerts.length) groups.push({ name:'Attendance', items: attendanceAlerts.map(a => ({
    severity: a.risk_level === 'red' ? 'crit' : 'warn',
    title: `${a.studentName} — ${a.moduleName}`,
    desc: `Attendance dropped to ${a.risk_level.toUpperCase()} (${a.attendance_percentage}%).`,
    time: a.last_synced_at,
  })) });
  if (urgentRequests.length) groups.push({ name:'Requests', items: urgentRequests.map(t => ({
    severity: 'warn',
    title: `Urgent request — ${t.category}`,
    desc: `${t.parentName} (parent of ${t.studentName}): ${t.message}`,
    time: t.created_at,
    ticketId: t.id,
  })) });

  if (!groups.length){
    container.innerHTML = '<div class="attn-empty">No info yet — no active alerts.</div>';
    return;
  }
  container.innerHTML = groups.map(g => `
    <section class="alert-group">
      <div class="alert-cat-head"><h3>${g.name}</h3><span class="alert-group-count">${g.items.length} alert${g.items.length===1?'':'s'}</span></div>
      <div class="card">${g.items.map(item => `
        <div class="alert-item">
          <div class="alert-row">
            <div class="alert-icon ${item.severity}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
            <div><div class="alert-title">${item.title}<span class="sev-tag ${item.severity}">${item.severity === 'crit' ? 'Critical' : 'Warning'}</span></div><div class="alert-desc">${item.desc}</div><div class="alert-time">${new Date(item.time).toLocaleString()}</div></div>
            ${item.ticketId ? `<button class="act-btn outline" data-open-alert-message="${item.ticketId}">View request</button>` : ''}
          </div>
        </div>`).join('')}</div>
    </section>`).join('');
  container.querySelectorAll('[data-open-alert-message]').forEach(btn => btn.addEventListener('click', () => {
    goToPage('page-messages');
    openMessageDetail(Number(btn.dataset.openAlertMessage));
  }));
}

/* ---------------- boot ---------------- */
if (authToken && currentUser) { boot(); }
