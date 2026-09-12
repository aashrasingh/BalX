/* Parent portal interactions and demo workflows. */
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

const bars = document.querySelectorAll('.bar-fill');
const barIO = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting){ entry.target.style.width = entry.target.getAttribute('data-w') + '%'; barIO.unobserve(entry.target); }
}), {threshold:.3});
bars.forEach(bar => barIO.observe(bar));

document.querySelectorAll('.pill-filters .pill').forEach(pill => pill.addEventListener('click', () => {
  pill.parentElement.querySelectorAll('.pill').forEach(item => item.classList.remove('active'));
  pill.classList.add('active');
}));
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

const loginModal = document.getElementById('loginModal');
const phoneStep = document.getElementById('phoneStep');
const otpStep = document.getElementById('otpStep');
const loginStatus = document.getElementById('loginStatus');
const otpStatus = document.getElementById('otpStatus');
document.querySelector('.login-btn').addEventListener('click', () => { loginModal.classList.add('open'); document.getElementById('parentPhone').focus(); });
document.querySelector('[data-close-login]').addEventListener('click', () => loginModal.classList.remove('open'));
loginModal.addEventListener('click', event => { if (event.target === loginModal) loginModal.classList.remove('open'); });
document.getElementById('sendOtp').addEventListener('click', () => {
  const phone = document.getElementById('parentPhone').value.trim();
  if (phone.length < 7){ loginStatus.textContent = 'Enter a valid phone number to continue.'; return; }
  loginStatus.textContent = '';
  phoneStep.hidden = true;
  otpStep.hidden = false;
  document.getElementById('otpCode').focus();
});
document.getElementById('changePhone').addEventListener('click', () => { otpStep.hidden = true; phoneStep.hidden = false; otpStatus.textContent = ''; });
document.getElementById('verifyOtp').addEventListener('click', () => {
  if (document.getElementById('otpCode').value.trim() !== '2040'){ otpStatus.textContent = 'That code did not match. Try the demo code above.'; return; }
  loginModal.classList.remove('open');
  document.querySelector('.login-btn').innerHTML = '<span aria-hidden="true">✓</span> Signed in';
  showToast('You are securely signed in for this demo.');
});

const serviceForm = document.getElementById('serviceForm');
serviceForm.addEventListener('submit', event => {
  event.preventDefault();
  const category = document.getElementById('serviceCategory').value;
  const priority = document.getElementById('servicePriority').value;
  const message = document.getElementById('serviceMessage').value.trim();
  if (!category || !message){ showToast('Choose a category and add a short message.'); return; }
  const ticketNumber = '#SS-' + (1050 + document.querySelectorAll('#ticketList .ticket').length);
  const urgent = priority.startsWith('Urgent');
  const ticket = document.createElement('div');
  ticket.className = 'ticket';
  ticket.innerHTML = '<div class="ticket-top"><span class="tag ' + (urgent ? 'overdue' : 'due-soon') + '">' + (urgent ? 'Priority' : 'New') + '</span><span class="ticket-id">' + ticketNumber + '</span></div><div class="ticket-title">' + category + '</div><div class="ticket-meta">Routed to ' + (category === 'Attendance concern' ? 'Attendance Team' : 'Student Services') + ' · Just now</div>';
  document.getElementById('ticketList').prepend(ticket);
  document.getElementById('ticketCount').textContent = (document.querySelectorAll('#ticketList .ticket').length - 1) + ' open';
  serviceForm.reset();
  showToast('Request ' + ticketNumber + ' created and routed to the right team.');
});

const chartData = [
  {label:'Wk 1', student:78, cohortAvg:74}, {label:'Wk 2', student:82, cohortAvg:76}, {label:'Wk 3', student:85, cohortAvg:78},
  {label:'Wk 4', student:88, cohortAvg:80}, {label:'Wk 5', student:90, cohortAvg:81}, {label:'Wk 6', student:91, cohortAvg:83}
];
const svgNS = 'http://www.w3.org/2000/svg';
const chartEl = document.getElementById('perfChart');
const W=540,H=220,padL=26,padB=26,padT=10,padR=6;
const chartW=W-padL-padR, chartH=H-padT-padB;
const maxVal = Math.max(...chartData.map(data => Math.max(data.student, data.cohortAvg))) * 1.15;
const groupW = chartW / chartData.length, barW = 15;
function y(value){ return padT + chartH - (value / maxVal) * chartH; }
[0,.25,.5,.75,1].forEach(fraction => {
  const gridY = padT + chartH * fraction;
  const line = document.createElementNS(svgNS, 'line');
  line.setAttribute('x1', padL); line.setAttribute('x2', W-padR); line.setAttribute('y1', gridY); line.setAttribute('y2', gridY); line.setAttribute('stroke', '#E9E4D3'); line.setAttribute('stroke-width', '1'); chartEl.appendChild(line);
});
chartData.forEach((data, index) => {
  const center = padL + groupW * index + groupW / 2;
  [{value:data.student,color:'#4A4DA0',offset:-barW/2-3},{value:data.cohortAvg,color:'#70BE44',offset:3}].forEach(bar => {
    const rect = document.createElementNS(svgNS, 'rect');
    const fullY = y(bar.value), fullHeight = padT + chartH - fullY;
    rect.setAttribute('x', center + bar.offset); rect.setAttribute('width', barW); rect.setAttribute('rx', 4); rect.setAttribute('fill', bar.color); rect.setAttribute('class', 'bar-col'); rect.setAttribute('y', padT + chartH); rect.setAttribute('height', 0); chartEl.appendChild(rect);
    const title = document.createElementNS(svgNS, 'title'); title.textContent = data.label + ': ' + bar.value; rect.appendChild(title);
  });
  const label = document.createElementNS(svgNS, 'text'); label.setAttribute('x', center); label.setAttribute('y', H-6); label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '10.5'); label.setAttribute('fill', '#8A9389'); label.setAttribute('font-family', 'Inter, sans-serif'); label.textContent = data.label; chartEl.appendChild(label);
});
const chartIO = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting){
    let index = 0;
    chartData.forEach((data, week) => [data.student, data.cohortAvg].forEach(value => {
      const rect = chartEl.querySelectorAll('rect')[index];
      const fullY = y(value), fullHeight = padT + chartH - fullY;
      rect.style.transition = `y .8s var(--ease) ${week*70}ms, height .8s var(--ease) ${week*70}ms`;
      rect.setAttribute('y', fullY); rect.setAttribute('height', fullHeight); index++;
    }));
    chartIO.disconnect();
  }
}), {threshold:.2});
chartIO.observe(chartEl);
