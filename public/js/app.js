/* Parent portal — wired to the real backend.
   Lecturers & Advisors intentionally keeps its illustrative data per
   explicit instruction. Settings toggles are client-only preferences (no
   backend concept exists for them). Everything else on this page is real:
   fetched from the API, or shows a genuine "no info yet" empty state. */

/* Loading screen: splash fades out as soon as the first term of data has
   rendered (with a short minimum so it never flashes), with a fallback timer
   so a slow/errored first load can't strand the page behind the overlay. */
const loadStart = Date.now();
function hideLoader(){
  const wait = Math.max(0, 300 - (Date.now() - loadStart));
  setTimeout(() => {
    document.getElementById('loadingScreen')?.classList.add('loading-hide');
    document.body.classList.remove('is-loading');
  }, wait);
}
window.setTimeout(hideLoader, 1500);

// ================================================================
// AUTH GUARD — this page requires a signed-in parent
// ================================================================
let authToken = localStorage.getItem('balx_token') || null;
let currentUser = JSON.parse(localStorage.getItem('balx_user') || 'null');
let currentStudentId = localStorage.getItem('balx_student') || null;
let children = [];

if (!authToken || !currentUser) {
  window.location.href = '/';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

document.getElementById('signOutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('balx_token');
  localStorage.removeItem('balx_user');
  localStorage.removeItem('balx_student');
  window.location.href = '/';
});

/* ============================================================================
   PAGE NAVIGATION (unchanged from the design — purely client-side UI, no data)
   ============================================================================ */
const navItems = Array.from(document.querySelectorAll('#sideNav .nav-item'));
const overviewNav = navItems.find(item => item.dataset.target === 'overview');
const overviewSubOrder = ['quick-actions', 'updates', 'contacts'];
const overviewSubTargets = new Set(overviewSubOrder);
const overviewSub = document.createElement('div');
overviewSub.className = 'nav-sub';
overviewSubOrder.forEach(target => {
  const item = navItems.find(navItem => navItem.dataset.target === target);
  if (item) overviewSub.appendChild(item);
});
overviewNav?.after(overviewSub);
const pageForTarget = {
  overview:'page-overview', attendance:'page-attendance', fees:'page-fees',
  alerts:'page-alerts', 'student-services':'page-support',
  'quick-actions':'page-overview', updates:'page-overview', contacts:'page-overview', settings:'page-settings'
};
const pageParts = [
  ['page-overview', document.getElementById('alertWidget'), document.getElementById('overview'), document.getElementById('statsGrid')?.closest('.section'), document.getElementById('urgentNoticeStack'),
    document.getElementById('quick-actions'), document.getElementById('updates'), document.getElementById('contacts')],
  ['page-attendance', document.getElementById('attendance')], ['page-fees', document.getElementById('fees')],
  ['page-alerts', document.getElementById('alerts')],
  ['page-support', document.getElementById('student-services'), document.getElementById('messages')],
  ['page-settings', document.getElementById('settings')]
].map(([page, ...elements]) => ({page, elements:elements.filter(Boolean)}));

pageParts.forEach(({elements}) => elements.forEach(element => element.classList.add('page-part')));

let currentPage = null;
let currentAnchor = null;
function setActiveNav(){
  navItems.forEach(item => {
    const target = item.dataset.target;
    const isOverviewSub = overviewSubTargets.has(target);
    const samePage = pageForTarget[target] === currentPage && !isOverviewSub;
    const sameAnchor = (target === currentAnchor);
    item.classList.toggle('active', currentAnchor ? sameAnchor : samePage);
  });
  overviewSub.classList.toggle('open', currentPage === 'page-overview' || currentAnchor !== null);
}

let navVersion = 0;
function syncHash(page, anchor){
  const target = anchor || Object.keys(pageForTarget).find(key => pageForTarget[key] === page) || 'overview';
  if (location.hash.slice(1) !== target) history.replaceState(null, '', '#' + target);
}
function scrollToDestination(page, anchor){
  const el = (page === 'page-overview' && anchor) ? document.getElementById(anchor) : null;
  if (el){ el.scrollIntoView({behavior:'smooth', block:'start'}); }
  else { window.scrollTo({top:0, behavior:'smooth'}); }
}
function goToPage(page, updateHash = true, anchor = null){
  if (page === currentPage && anchor === currentAnchor){ if (updateHash) syncHash(page, anchor); return; }
  if (page === currentPage){
    currentAnchor = anchor; setActiveNav();
    if (updateHash) syncHash(page, anchor);
    scrollToDestination(page, anchor);
    return;
  }
  currentPage = page; currentAnchor = anchor;
  const myNavVersion = ++navVersion;
  pageParts.forEach(({page: pageId, elements}) => elements.forEach(element => element.classList.toggle('page-active', pageId === page)));
  document.querySelectorAll('.page-layout').forEach(layout => {
    layout.classList.toggle('page-group-hidden', !layout.querySelector('.page-active'));
  });
  setActiveNav();
  if (updateHash) syncHash(page, anchor);
  requestAnimationFrame(() => {
    if (myNavVersion !== navVersion) return;
    document.querySelectorAll('.page-active .card, .page-active .qa-card').forEach((element, index) => {
      element.classList.add('in-view');
      element.style.transitionDelay = (index % 4) * 60 + 'ms';
    });
    scrollToDestination(page, anchor);
  });
}
window.addEventListener('hashchange', () => {
  const target = location.hash.slice(1);
  goToPage(pageForTarget[target] || 'page-overview', false, overviewSubTargets.has(target) ? target : null);
});
navItems.forEach(item => item.addEventListener('click', event => {
  event.preventDefault();
  goToPage(pageForTarget[item.dataset.target] || 'page-overview', true, overviewSubTargets.has(item.dataset.target) ? item.dataset.target : null);
}));

const overviewScrollSections = ['quick-actions', 'updates', 'contacts']
  .map(key => ({key, el: document.getElementById(key)}))
  .filter(section => section.el);
const SCROLL_SPY_OFFSET = 150;
function updateOverviewScrollSpy(){
  if (currentPage !== 'page-overview') return;
  let active = null;
  overviewScrollSections.forEach(section => {
    if (section.el.getBoundingClientRect().top - SCROLL_SPY_OFFSET <= 0) active = section.key;
  });
  const atBottom = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 2;
  if (atBottom && overviewScrollSections.length){ active = overviewScrollSections[overviewScrollSections.length - 1].key; }
  if (active !== currentAnchor){ currentAnchor = active; setActiveNav(); syncHash('page-overview', active); }
}
let scrollSpyTicking = false;
window.addEventListener('scroll', () => {
  if (scrollSpyTicking) return;
  scrollSpyTicking = true;
  window.requestAnimationFrame(() => { updateOverviewScrollSpy(); scrollSpyTicking = false; });
}, {passive:true});

const revealIO = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting){ entry.target.classList.add('in-view'); revealIO.unobserve(entry.target); }
}), {threshold:.12, rootMargin:'0px 0px -6% 0px'});
function observeReveal(){
  document.querySelectorAll('.card:not(.in-view), .qa-card:not(.in-view)').forEach((element, index) => {
    element.style.transitionDelay = (index % 4) * 60 + 'ms';
    revealIO.observe(element);
  });
}

document.querySelectorAll('.view-toggle button').forEach(button => button.addEventListener('click', () => {
  button.parentElement.querySelectorAll('button').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
}));

const toast = document.getElementById('toast');
let toastTimer;
function showToast(message){
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));
document.querySelectorAll('.qa-card[data-nav-target]').forEach(card => card.addEventListener('click', () => {
  document.querySelector('.nav-item[data-target="' + card.dataset.navTarget + '"]')?.click();
}));

// Overview stat cards expand in place to show a detail breakdown
document.querySelectorAll('.stat-card[data-stat]').forEach(card => {
  function toggle(){
    const expanded = card.classList.toggle('expanded');
    card.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', event => {
    if (event.target.closest('.stat-detail-link')) return;
    if (event.key === 'Enter' || event.key === ' '){ event.preventDefault(); toggle(); }
  });
});
document.addEventListener('click', event => {
  const link = event.target.closest('.stat-detail-link[data-nav-target]');
  if (!link) return;
  event.stopPropagation();
  document.querySelector('.nav-item[data-target="' + link.dataset.navTarget + '"]')?.click();
});

/* Lecturer email drawer — kept exactly as designed, illustrative data. */
const lecturerDrawer = document.getElementById('lecturerDrawer');
const lecturerDrawerOverlay = document.getElementById('lecturerDrawerOverlay');
const lecturerDrawerBody = document.getElementById('lecturerDrawerBody');
const lecturerDrawerClose = document.getElementById('lecturerDrawerClose');
function openLecturerDrawer(card){
  const name = card.querySelector('.staff-name').textContent;
  const role = card.querySelector('.staff-role').textContent;
  const hours = card.querySelector('.staff-stat').textContent;
  const avatarEl = card.querySelector('.staff-avatar');
  const email = card.dataset.email || '';
  const module = card.dataset.module || role;
  lecturerDrawerBody.innerHTML = `
    <div class="lecturer-drawer-avatar" style="${avatarEl.getAttribute('style')}">${avatarEl.textContent}</div>
    <div id="lecturerDrawerName" class="lecturer-drawer-name">${name}</div>
    <div class="lecturer-drawer-role">${role}</div>
    <div class="lecturer-drawer-section">
      <div class="lecturer-drawer-row"><span class="k">Module</span><span class="v">${module}</span></div>
      <div class="lecturer-drawer-row"><span class="k">Office hours</span><span class="v">${hours}</span></div>
      <div class="lecturer-drawer-row"><span class="k">Email</span><span class="v">${email}</span></div>
    </div>
    <button class="lecturer-drawer-email-btn" type="button" onclick="window.location.href='mailto:${email}'">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="m4 6 8 7 8-7"/></svg>
      Email ${name.split(' ').slice(-1)[0]}
    </button>`;
  lecturerDrawer.classList.add('open');
  lecturerDrawerOverlay.classList.add('open');
}
function closeLecturerDrawer(){ lecturerDrawer.classList.remove('open'); lecturerDrawerOverlay.classList.remove('open'); }
document.querySelectorAll('.staff-card .staff-msg-btn').forEach(button => {
  button.addEventListener('click', () => openLecturerDrawer(button.closest('.staff-card')));
});
lecturerDrawerClose?.addEventListener('click', closeLecturerDrawer);
lecturerDrawerOverlay?.addEventListener('click', closeLecturerDrawer);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLecturerDrawer(); });

/* ============================================================================
   REAL DATA LOADING
   ============================================================================ */
async function loadParentData(){
  const res = await api('/api/parent/children');
  children = res.data;
  if (!children.length){ showToast('No children are linked to this account yet.'); return; }

  const switcherWrap = document.getElementById('childSwitcherWrap');
  const switcher = document.getElementById('childSwitcher');
  switcher.innerHTML = children.map(c => `<option value="${c.student_id}">${c.name}</option>`).join('');
  switcherWrap.hidden = children.length <= 1;

  currentStudentId = children.some(c => c.student_id === currentStudentId) ? currentStudentId : children[0].student_id;
  switcher.value = currentStudentId;
  await loadStudentData(currentStudentId);
}
document.getElementById('childSwitcher').addEventListener('change', e => {
  currentStudentId = e.target.value;
  loadStudentData(currentStudentId);
});

async function loadStudentData(studentId){
  localStorage.setItem('balx_student', studentId);
  try {
    const [overviewRes, attendanceRes, ticketsRes, feesRes] = await Promise.all([
      api(`/api/parent/students/${studentId}/overview`),
      api(`/api/parent/students/${studentId}/attendance`),
      api(`/api/parent/students/${studentId}/tickets`),
      api(`/api/parent/students/${studentId}/fees`),
    ]);

    renderHero(overviewRes.data);
    renderStatCards(overviewRes.data, attendanceRes.data, feesRes.data);
    renderAttendance(attendanceRes.data);
    renderFees(feesRes.data);
    renderAlerts(overviewRes.data.notices);
    renderAlertWidget(overviewRes.data.notices);
    renderUrgentStack(overviewRes.data.notices, studentId);
    renderTickets(ticketsRes.data);
    renderQuickActions(overviewRes.data.student.name.split(' ')[0]);
    renderRecentUpdates(overviewRes.data.notices, feesRes.data, ticketsRes.data);
    renderContactsHeading(overviewRes.data.student.name.split(' ')[0]);

    observeReveal();
    hideLoader();
  } catch (err) {
    showToast(err.message);
    hideLoader();
  }
}

function renderHero(data){
  const { student, attendanceOverall } = data;
  const firstName = student.name.split(' ')[0];
  const today = new Date();
  document.getElementById('topbarDate').textContent = today.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('topbarHeading').textContent = `How ${firstName} is progressing`;
  document.getElementById('heroName').textContent = `${student.name} · ${student.grade}`;
  document.getElementById('heroSubtitle').textContent = attendanceOverall.riskLevel === 'green'
    ? `${firstName}'s attendance is healthy across all tracked modules.`
    : `"${attendanceOverall.worstModule}" needs the most attention right now — attendance there is ${attendanceOverall.pct}%.`;
  document.getElementById('heroQuote').textContent = `"Stay connected to the Islington experience while ${firstName} develops the skills and confidence for an industry-ready future."`;

  const pct = attendanceOverall.pct ?? 0;
  document.getElementById('attendanceRing').style.setProperty('--pct', pct);
  document.getElementById('ringAttendanceValue').textContent = attendanceOverall.pct != null ? `${attendanceOverall.pct}%` : '—';
}

function renderStatCards(overviewData, attendanceRows, feesRows){
  const { attendanceOverall, notices } = overviewData;

  const dueItems = feesRows.filter(f => f.status === 'due' || f.status === 'overdue');
  const totalDue = dueItems.reduce((sum, f) => sum + Number(f.amount), 0);
  const feesCard = document.querySelector('[data-stat="fees"]');
  feesCard.querySelector('.stat-value').textContent = totalDue > 0 ? `NPR ${totalDue.toLocaleString()}` : 'NPR 0';
  feesCard.querySelector('.stat-label').textContent = totalDue > 0 ? 'Balance due' : 'No balance due right now';
  const nextDue = dueItems.slice().sort((a,b) => new Date(a.due_date) - new Date(b.due_date))[0];
  feesCard.querySelector('.stat-trend').textContent = nextDue ? new Date(nextDue.due_date).toLocaleDateString() : 'All clear';
  const feesDetail = feesCard.querySelector('.stat-detail');
  feesDetail.innerHTML = dueItems.length
    ? dueItems.map(f => `<div class="stat-detail-row"><span class="k">${f.description}</span><span class="v">NPR ${Number(f.amount).toLocaleString()}</span></div>`).join('')
      + `<div class="stat-detail-note">Settle before the due date to avoid a late fee.</div><button class="stat-detail-link" type="button" data-nav-target="fees">View fees &amp; payments</button>`
    : `<div class="stat-detail-note">No info yet — nothing is currently due.</div><button class="stat-detail-link" type="button" data-nav-target="fees">View fees &amp; payments</button>`;

  const attCard = document.querySelector('[data-stat="attendance"]');
  attCard.querySelector('.stat-value').textContent = attendanceOverall.pct != null ? `${attendanceOverall.pct}%` : '—';
  attCard.querySelector('.stat-label').textContent = 'Lowest-module attendance this term';
  const present = attendanceRows.filter(r => r.status === 'present').length;
  const late = attendanceRows.filter(r => r.status === 'late').length;
  const absent = attendanceRows.filter(r => r.status === 'absent').length;
  attCard.querySelector('.stat-trend').textContent = attendanceOverall.riskLevel === 'green' ? 'On track' : attendanceOverall.riskLevel === 'red' ? 'Needs attention' : 'Keep an eye';
  attCard.querySelector('.stat-detail').innerHTML = `
    <div class="stat-detail-row"><span class="k">Present</span><span class="v">${present} sessions</span></div>
    <div class="stat-detail-row"><span class="k">Absent</span><span class="v">${absent} sessions</span></div>
    <div class="stat-detail-row"><span class="k">Late</span><span class="v">${late} sessions</span></div>
    <div class="stat-detail-note">${attendanceOverall.riskLevel === 'green' ? 'Everything is currently on track.' : `"${attendanceOverall.worstModule}" is the module most in need of attention.`}</div>
    <button class="stat-detail-link" type="button" data-nav-target="attendance">View full attendance log</button>`;

  const updatesCard = document.querySelector('[data-stat="updates"]');
  updatesCard.querySelector('.stat-value').textContent = notices.length;
  updatesCard.querySelector('.stat-label').textContent = notices.length === 1 ? 'Active update' : 'Active updates';
  updatesCard.querySelector('.stat-trend').textContent = notices.length ? `${notices.filter(n => n.is_urgent).length} urgent` : 'None yet';
  updatesCard.querySelector('.stat-detail').innerHTML = notices.length
    ? notices.slice(0, 4).map(n => `<div class="stat-detail-row"><span class="k">${n.title}</span><span class="v">${new Date(n.created_at).toLocaleDateString()}</span></div>`).join('')
      + `<button class="stat-detail-link" type="button" data-nav-target="alerts">View all updates</button>`
    : `<div class="stat-detail-note">No info yet — no updates have been posted.</div>`;
}

function renderAttendance(rows){
  const tbody = document.getElementById('attnTableBody');
  const emptyRowTemplate = document.getElementById('attnEmptyRow').outerHTML;
  const rowsHtml = rows.map(r => {
    const label = r.status === 'present' ? 'Present' : r.status === 'late' ? 'Late' : 'Absent';
    const tagClass = r.status === 'present' ? 'ok' : r.status === 'late' ? 'due-soon' : 'overdue';
    const note = r.status === 'absent' ? 'Flagged for follow-up' : '—';
    return `<tr data-status="${r.status}">
      <td><div class="student-name">${r.moduleName}</div></td>
      <td>${new Date(r.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td>
      <td><span class="tag ${tagClass}">${label}</span></td>
      <td>${r.instructor || ''}</td>
      <td>${note}</td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rowsHtml + emptyRowTemplate;
  const liveEmptyRow = document.getElementById('attnEmptyRow');
  if (!rows.length) liveEmptyRow.style.display = '';

  const present = rows.filter(r => r.status === 'present').length;
  const absent = rows.filter(r => r.status === 'absent').length;
  const late = rows.filter(r => r.status === 'late').length;
  const total = rows.length;
  document.getElementById('attnCountPresent').textContent = present;
  document.getElementById('attnCountAbsent').textContent = absent;
  document.getElementById('attnCountLate').textContent = late;
  document.getElementById('attnCountRate').textContent = total ? Math.round((present / total) * 100) + '%' : '—';

  const now = new Date();
  const thisMonthRows = rows.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const streakNum = document.getElementById('daysPresentStat');
  const streakLbl = document.querySelector('#overview .streak .lbl');
  if (thisMonthRows.length) {
    const presentThisMonth = new Set(
      thisMonthRows.filter(r => r.status === 'present' || r.status === 'late').map(r => r.date)
    ).size;
    streakNum.textContent = presentThisMonth;
    streakLbl.innerHTML = 'days present<br>this month';
  } else {
    const presentAll = new Set(
      rows.filter(r => r.status === 'present' || r.status === 'late').map(r => r.date)
    ).size;
    streakNum.textContent = presentAll || '—';
    streakLbl.innerHTML = 'days present';
  }

  const attnFilters = document.getElementById('attnFilters');
  const attnRows = Array.from(tbody.querySelectorAll('tr[data-status]'));
  attnFilters.onclick = event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    attnFilters.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    let visible = 0;
    attnRows.forEach(row => {
      const match = filter === 'all' || row.dataset.status === filter;
      row.classList.toggle('row-hidden', !match);
      if (match) visible++;
    });
    liveEmptyRow.style.display = visible ? 'none' : '';
  };
}

function renderFees(rows){
  const tbody = document.getElementById('feesTableBody');
  const emptyRowTemplate = document.getElementById('feesEmptyRow').outerHTML;
  const rowsHtml = rows.map(f => {
    const tagClass = f.status === 'paid' ? 'ok' : f.status === 'overdue' ? 'overdue' : 'due-soon';
    const label = f.status === 'paid' ? 'Paid' : f.status === 'overdue' ? 'Overdue' : 'Due';
    return `<tr data-status="${f.status}">
      <td><div class="student-name">${f.description}</div></td>
      <td>NPR ${Number(f.amount).toLocaleString()}</td>
      <td>${new Date(f.due_date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td>
      <td><span class="tag ${tagClass}">${label}</span></td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rowsHtml + emptyRowTemplate;
  const liveEmptyRow = document.getElementById('feesEmptyRow');
  if (!rows.length) liveEmptyRow.style.display = '';

  const feesRows = Array.from(tbody.querySelectorAll('tr[data-status]'));
  const feesFilters = document.getElementById('feesFilters');
  const feesTableCount = document.getElementById('feesTableCount');
  feesTableCount.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'} this term`;
  feesFilters.onclick = event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    feesFilters.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    let visible = 0;
    feesRows.forEach(row => {
      const match = filter === 'all' || row.dataset.status === filter;
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    liveEmptyRow.style.display = visible ? 'none' : '';
    feesTableCount.textContent = filter === 'all'
      ? `${visible} item${visible === 1 ? '' : 's'} this term`
      : `${visible} item${visible === 1 ? '' : 's'} · ${button.textContent.trim()}`;
  };

  const paid = rows.filter(f => f.status === 'paid');
  const totalPaid = paid.reduce((s, f) => s + Number(f.amount), 0);
  const totalDue = rows.filter(f => f.status !== 'paid').reduce((s, f) => s + Number(f.amount), 0);
  const total = totalPaid + totalDue;
  const pct = total > 0 ? Math.round((totalPaid / total) * 100) : 0;
  const planPctEl = document.querySelector('.plan-simple-pct');
  const planFillEl = document.querySelector('.plan-track-simple-fill');
  const planSubEl = document.querySelector('.plan-simple-sub');
  if (planPctEl) planPctEl.textContent = `${pct}%`;
  if (planFillEl) { planFillEl.dataset.w = pct; planFillEl.style.width = pct + '%'; }
  if (planSubEl) planSubEl.innerHTML = `<strong>NPR ${totalPaid.toLocaleString()}</strong> paid · <strong>NPR ${totalDue.toLocaleString()}</strong> left to pay this term`;

  const overdue = rows.filter(f => f.status === 'overdue').reduce((s, f) => s + Number(f.amount), 0);
  const due = rows.filter(f => f.status === 'due').reduce((s, f) => s + Number(f.amount), 0);
  const nextItem = rows.filter(f => f.status === 'due').sort((a,b) => new Date(a.due_date) - new Date(b.due_date))[0];
  const statEls = document.querySelectorAll('.plan-stat');
  if (statEls[0]) statEls[0].querySelector('.v').textContent = `NPR ${total.toLocaleString()}`;
  if (statEls[1]) { statEls[1].querySelector('.v').textContent = `NPR ${totalPaid.toLocaleString()}`; statEls[1].querySelector('.sub').textContent = `${paid.length} payment${paid.length===1?'':'s'} made`; }
  if (statEls[2]) {
    statEls[2].querySelector('.v').textContent = `NPR ${(due + overdue).toLocaleString()}`;
    statEls[2].querySelector('.sub').textContent = overdue > 0 ? 'Includes an overdue item' : 'Due this term';
  }
  if (statEls[3]) {
    statEls[3].querySelector('.v').textContent = nextItem ? `NPR ${Number(nextItem.amount).toLocaleString()}` : '—';
    statEls[3].querySelector('.sub').textContent = nextItem ? `Due ${new Date(nextItem.due_date).toLocaleDateString()}` : 'No info yet';
  }

  // The "When you'll hear from us" reminder timeline used fabricated,
  // specific send dates we have no real system to back — removed rather
  // than show made-up data.
  document.getElementById('feeReminderCard')?.remove();
}

function renderAlerts(notices){
  const list = document.getElementById('alertsList');
  const emptyRow = document.getElementById('alertsEmptyRow');
  const metaEl = document.querySelector('#alerts .meta');
  if (metaEl) metaEl.textContent = notices.length ? `${notices.length} need your attention` : 'No info yet';

  if (!notices.length){
    list.innerHTML = '';
    emptyRow.style.display = '';
    list.after(emptyRow);
    return;
  }

  const categoryFor = n => n.category === 'attendance_alert' ? 'attendance' : n.category === 'fee' ? 'fees' : 'academic';
  const now = Date.now();
  list.innerHTML = notices.map(n => {
    const category = categoryFor(n);
    const days = Math.floor((now - new Date(n.created_at).getTime()) / 86400000);
    const priority = n.is_urgent ? 3 : 1;
    const level = n.is_urgent ? 'high' : 'low';
    return `<div class="card alert-card" role="listitem" data-category="${category}" data-priority="${priority}" data-days="${days}" tabindex="0">
      <div class="alert-card-top">
        <div class="alert-icon ${level}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
        <span class="tag cat-${category}">${category === 'attendance_alert' ? 'attendance' : category}</span>
      </div>
      <div class="alert-title">${n.title}</div>
      <div class="alert-desc">${n.body}</div>
      <div class="alert-time">${days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days + ' days ago'}</div>
    </div>`;
  }).join('');
  list.appendChild(emptyRow);
  emptyRow.style.display = 'none';

  const alertCards = Array.from(list.querySelectorAll('.alert-card[data-category]'));
  const alertsFilters = document.getElementById('alertsFilters');
  alertsFilters.onclick = event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    alertsFilters.querySelectorAll('.pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed','false'); });
    button.classList.add('active'); button.setAttribute('aria-pressed','true');
    const filter = button.dataset.filter;
    let visible = 0;
    alertCards.forEach(card => {
      const match = filter === 'all' || card.dataset.category === filter;
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    emptyRow.style.display = visible ? 'none' : '';
  };
}

/* Top-of-overview alert widget — real notices only.
   When a notice exists show it (urgent/critical = red) with a "View more"
   link that jumps to the Alerts page; otherwise show the "no alert
   messages" empty state. */
function renderAlertWidget(notices){
  const widget = document.getElementById('alertWidget');
  if (!widget) return;
  const now = Date.now();
  const when = ts => {
    const days = Math.floor((now - new Date(ts).getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return days + ' days ago';
  };
  if (!notices.length){
    widget.innerHTML = `
      <div class="alert-widget-card no-alerts" role="status">
        <div class="alert-widget-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></div>
        <div class="alert-widget-body">
          <div class="alert-widget-title">No alert messages</div>
          <div class="alert-widget-copy">You're all caught up — nothing needs your attention right now.</div>
        </div>
      </div>`;
    return;
  }
  const items = notices.slice(0, 3).map(n => `
    <div class="alert-widget-item">
      <span class="dot ${n.is_urgent ? 'dot-crit' : ''}"></span>
      <span class="t">${n.title}</span>
      <span class="w">${when(n.created_at)}</span>
    </div>`).join('');
  const urgentCount = notices.filter(n => n.is_urgent).length;
  widget.innerHTML = `
    <div class="alert-widget-card" role="status">
      <div class="alert-widget-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
      <div class="alert-widget-body">
        <div class="alert-widget-title">Alert message${notices.length === 1 ? '' : 's'}</div>
        <div class="alert-widget-copy">${notices.length} message${notices.length === 1 ? '' : 's'} for your attention${urgentCount ? ` · ${urgentCount} ${urgentCount === 1 ? 'is' : 'are'} critical` : ''}</div>
        <div class="alert-widget-list">${items}</div>
      </div>
      <button class="alert-widget-more text-btn" type="button" data-alert-view>View more</button>
    </div>`;
  widget.querySelector('[data-alert-view]')?.addEventListener('click', () => goToPage('page-alerts'));
}

/* Urgent Messages banner stack — real, persistent per-notice "mark as read". */
async function renderUrgentStack(notices, studentId){
  const stack = document.getElementById('urgentNoticeStack');
  const unread = notices.filter(n => n.is_urgent && !n.isRead);
  if (!unread.length){ stack.innerHTML = ''; return; }
  stack.innerHTML = unread.map(n => `
    <div class="notice-banner" role="status" data-notice-id="${n.id}">
      <div class="notice-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l10 18H2z"/><path d="M12 9v5M12 17h.01"/></svg></div>
      <div class="notice-content"><div class="notice-title">Urgent · ${n.title}</div><div class="notice-copy">${n.body}</div></div>
      <div class="notice-actions"><button class="text-btn" type="button" data-view-notice="${n.id}">View Notice</button></div>
    </div>`).join('');
  stack.querySelectorAll('[data-view-notice]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.viewNotice;
    button.closest('.notice-banner')?.remove();
    try { await api(`/api/parent/students/${studentId}/notices/${id}/read`, { method: 'POST' }); } catch (err) { showToast(err.message); }
  }));
}

function renderQuickActions(firstName){
  const map = {
    'Settle ': `Settle ${firstName}'s college balance`,
    'See ': `See ${firstName}'s full lecture history`,
    'Reach out to ': `Reach out to ${firstName}'s faculty directly`,
  };
  document.querySelectorAll('#qaGrid .qd').forEach(el => {
    for (const prefix of Object.keys(map)) {
      if (el.textContent.startsWith(prefix)) { el.textContent = map[prefix]; return; }
    }
  });
}

function renderContactsHeading(firstName){
  const heading = document.querySelector('#contacts .section-head h2');
  if (heading) heading.textContent = `${firstName}'s lecturers & advisors`;
}

/* Recent Updates — a REAL activity feed built from real events: notices,
   fee payments, and staff replies to tickets. Empty state if none exist. */
function renderRecentUpdates(notices, fees, tickets){
  const card = document.querySelector('#updates .card');
  if (!card) return;
  const events = [];
  notices.forEach(n => events.push({ time: new Date(n.created_at).getTime(), text: n.title, initials: n.is_urgent ? '!' : 'N', grad: n.is_urgent ? 'linear-gradient(135deg,#C43B52,#8E2639)' : 'linear-gradient(135deg,#2A91B0,#176278)' }));
  fees.filter(f => f.status === 'paid' && f.paid_at).forEach(f => events.push({ time: new Date(f.paid_at).getTime(), text: `Payment confirmed: <b>${f.description}</b>`, initials: 'NPR', grad: 'linear-gradient(135deg,#151A47,#090D29)' }));
  tickets.filter(t => t.staff_reply && t.staff_reply_at).forEach(t => events.push({ time: new Date(t.staff_reply_at).getTime(), text: `Staff replied to your request: <b>${t.category}</b>`, initials: 'SS', grad: 'linear-gradient(135deg,#70BE44,#438B25)' }));

  events.sort((a, b) => b.time - a.time);
  if (!events.length){
    card.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;padding:8px 0;">No info yet — no recent updates.</div>';
    return;
  }
  card.innerHTML = events.slice(0, 8).map(e => `
    <div class="activity-row">
      <div class="act-avatar" style="background:${e.grad}">${e.initials}</div>
      <div><div class="act-text">${e.text}</div><div class="act-stamp">${new Date(e.time).toLocaleString()}</div></div>
    </div>`).join('');
}

/* Tickets / Message Student Services */
function renderTickets(rows){
  const list = document.getElementById('ticketList');
  const openCount = rows.filter(t => t.status !== 'resolved').length;
  document.getElementById('ticketCount').textContent = `${openCount} open`;
  if (!rows.length){
    list.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;">No requests yet.</div>';
    return;
  }
  list.innerHTML = rows.map(t => {
    const tagClass = t.status === 'resolved' ? 'ok' : t.status === 'in_progress' ? 'due-soon' : 'pending';
    const tagLabel = t.status === 'resolved' ? 'Resolved' : t.status === 'in_progress' ? 'In review' : 'Open';
    const clearBtn = t.status === 'resolved' ? `<button class="text-btn" type="button" data-clear-ticket="${t.id}" style="margin-top:8px;">Clear Request</button>` : '';
    const replyHtml = t.staff_reply ? `<div class="ticket-reply" style="margin-top:8px;padding:9px 11px;background:var(--teal-tint);border-radius:9px;font-size:12px;"><b>Reply:</b> ${t.staff_reply}</div>` : '';
    return `<div class="ticket">
      <div class="ticket-top"><span class="tag ${tagClass}">${tagLabel}</span><span class="ticket-id">#SS-${1000 + t.id}</span></div>
      <div class="ticket-title">${t.category}</div>
      <div class="ticket-meta">${t.assigned_to ? 'Assigned to ' + t.assigned_to : 'Awaiting assignment'} · Updated ${new Date(t.updated_at || t.created_at).toLocaleDateString()}</div>
      ${replyHtml}${clearBtn}
    </div>`;
  }).join('');
  list.querySelectorAll('[data-clear-ticket]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/parent/tickets/${btn.dataset.clearTicket}/clear`, { method: 'PATCH' });
      const ticketsRes = await api(`/api/parent/students/${currentStudentId}/tickets`);
      renderTickets(ticketsRes.data);
      showToast('Request cleared.');
    } catch (err) { showToast(err.message); }
  }));
}

document.getElementById('serviceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const category = document.getElementById('serviceCategory').value;
  const priorityRaw = document.getElementById('servicePriority').value;
  const message = document.getElementById('serviceMessage').value.trim();
  if (!category || !message){ showToast('Choose a category and add a short message.'); return; }
  const priority = priorityRaw.startsWith('Urgent') ? 'urgent' : 'standard';
  try {
    await api('/api/parent/tickets', { method: 'POST', body: JSON.stringify({ studentId: currentStudentId, category, message, priority }) });
    document.getElementById('serviceForm').reset();
    const ticketsRes = await api(`/api/parent/students/${currentStudentId}/tickets`);
    renderTickets(ticketsRes.data);
    showToast('Request created and routed to Student Services.');
  } catch (err) { showToast(err.message); }
});

/* ---------- boot ---------- */
if (authToken && currentUser) {
  loadParentData();
}
