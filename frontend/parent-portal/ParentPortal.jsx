import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ============================================================================
   DATA
   All the content that was hard-coded into <table>/<div> markup in the
   original HTML now lives as plain data, and the JSX below maps over it.
   ============================================================================ */

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "calendar" },
  { id: "attendance", label: "Attendance", icon: "clipboard", badge: 2 },
  { id: "fees", label: "Fees & Payments", icon: "coin", badge: 1 },
  { id: "grades", label: "Grades & Progress", icon: "check" },
  { id: "appointments", label: "Appointments", icon: "clipboard" },
  { id: "alerts", label: "Alerts", icon: "warning", badge: 3 },
  { id: "student-services", label: "Support", icon: "shield", badge: 2 },
  { id: "quick-actions", label: "Quick Actions", icon: "bolt", sub: true },
  { id: "updates", label: "Recent Updates", icon: "clock", sub: true },
  { id: "contacts", label: "Lecturers & Advisors", icon: "people", sub: true },
  { id: "settings", label: "Settings", icon: "gear" },
];

const SUB_TARGETS = new Set(["quick-actions", "grades", "updates", "contacts"]);

const STAT_CARDS = [
  { bg: "var(--azure-tint)", fg: "var(--azure)", icon: "clipboard", trend: "▲ 2.1%", trendClass: "trend-up", value: "94%", label: "Lecture attendance this term" },
  { bg: "var(--brick-tint)", fg: "var(--brick)", icon: "coin", trend: "8 days left", trendClass: "trend-down", value: "NPR 650k", label: "College balance due Sept 20" },
  { bg: "var(--teal-tint)", fg: "var(--teal-deep)", icon: "check", trend: "▲ 3%", trendClass: "trend-up", value: "88%", label: "Current module average" },
  { bg: "var(--marigold-tint)", fg: "#8a5f1e", icon: "warning", trend: "▲ 1 new", trendClass: "trend-down", value: "3", label: "Active updates for Aarav" },
];

const ATTENDANCE_ROWS = [
  { module: "Web Application Development", date: "Sept 11, 2026", status: "Late (12 min)", cls: "due-soon", lecturer: "Dr. R. Marlow", note: "—", state: "Late" },
  { module: "Database Systems", date: "Sept 11, 2026", status: "Present", cls: "ok", lecturer: "Dr. N. Alvarez", note: "—", state: "Present" },
  { module: "Professional Practice", date: "Sept 10, 2026", status: "Absent", cls: "overdue", lecturer: "Ms. D. Cole", note: "Flagged for follow-up", state: "Absent" },
  { module: "Web Application Development", date: "Sept 10, 2026", status: "Present", cls: "ok", lecturer: "Dr. R. Marlow", note: "—", state: "Present" },
  { module: "Database Systems", date: "Sept 9, 2026", status: "Present", cls: "ok", lecturer: "Dr. N. Alvarez", note: "—", state: "Present" },
  { module: "Professional Practice", date: "Sept 9, 2026", status: "Absent", cls: "overdue", lecturer: "Ms. D. Cole", note: "Second missed lab this month", state: "Absent" },
];

const FEES_ROWS = [
  { item: "Tuition Installment 2", amount: "NPR 240,000", due: "Sept 20, 2026", status: "Due", cls: "due-soon", action: "Pay Now", outline: false, state: "Due" },
  { item: "Computing Lab Fee", amount: "NPR 18,000", due: "Sept 20, 2026", status: "Due", cls: "due-soon", action: "Pay Now", outline: false, state: "Due" },
  { item: "Library Fine", amount: "NPR 1,200", due: "Sept 5, 2026", status: "Overdue", cls: "overdue", action: "Pay Now", outline: false, state: "Overdue" },
  { item: "Tuition Installment 1", amount: "NPR 240,000", due: "Aug 15, 2026", status: "Paid", cls: "ok", action: "Receipt", outline: true, state: "Paid" },
  { item: "Student Activity Fee", amount: "NPR 7,500", due: "Aug 15, 2026", status: "Paid", cls: "ok", action: "Receipt", outline: true, state: "Paid" },
];

const APPOINTMENTS = [
  { time: "3:00", meridiem: "FRI", name: "Academic advising check-in", type: "Dr. R. Marlow · Computing Faculty", tag: "In-person", cls: "ok" },
  { time: "10:00", meridiem: "MON", name: "Academic Advising Check-in", type: "Ms. D. Cole", tag: "Video", cls: "due-soon" },
];

const ALERTS = [
  { level: "high", icon: "warning", title: "Repeated module absence", desc: "Aarav missed Professional Practice for the second time this month.", time: "Today" },
  { level: "med", icon: "info", title: "Fee payment due", desc: "Tuition installment 2 and the lab fee are due Sept 20.", time: "2 days ago" },
  { level: "low", icon: "bell", title: "Academic advising check-in", desc: "Aarav's academic advising meeting is scheduled for Friday at 3:00 PM.", time: "3 days ago" },
];

const QUICK_ACTIONS = [
  { bg: "var(--azure-tint)", fg: "var(--azure)", icon: "coin", title: "Pay fees now", desc: "Settle Aarav's college balance", toast: "Redirecting to secure payment..." },
  { bg: "var(--marigold-tint)", fg: "#8a5f1e", icon: "report", title: "View attendance report", desc: "See Aarav's full lecture history", toast: "Opening full attendance report..." },
  { bg: "var(--brick-tint)", fg: "var(--brick)", icon: "mail", title: "Message a lecturer", desc: "Reach out to Aarav's faculty directly", toast: "Opening lecturer messages..." },
  { bg: "var(--teal-tint)", fg: "var(--teal-deep)", icon: "schedule", title: "Schedule a meeting", desc: "Book time with an academic advisor", toast: "Opening advisor calendar..." },
];

const GRADE_SUBJECTS = [
  { name: "Web Applications", score: 82 },
  { name: "Database Systems", score: 91 },
  { name: "Professional Practice", score: 85 },
  { name: "Studio Art", score: 94 },
  { name: "Intro Psychology", score: 89 },
];

const CHART_DATA = [
  { label: "Wk 1", student: 78, cohortAvg: 74 },
  { label: "Wk 2", student: 82, cohortAvg: 76 },
  { label: "Wk 3", student: 85, cohortAvg: 78 },
  { label: "Wk 4", student: 88, cohortAvg: 80 },
  { label: "Wk 5", student: 90, cohortAvg: 81 },
  { label: "Wk 6", student: 91, cohortAvg: 83 },
];

const ACTIVITY_FEED = [
  { initials: "RM", gradient: "linear-gradient(135deg,#4A4DA0,#25285F)", html: <><b>Dr. Marlow</b> recorded Aarav as late to Web Application Development</>, stamp: "8 minutes ago" },
  { initials: "DC", gradient: "linear-gradient(135deg,#70BE44,#438B25)", html: <>Professional Practice assessment graded: <b>85%</b></>, stamp: "41 minutes ago" },
  { initials: "NPR", gradient: "linear-gradient(135deg,#151A47,#090D29)", html: <>Semester fee payment confirmed</>, stamp: "1 hour ago" },
  { initials: "DC", gradient: "linear-gradient(135deg,#C43B52,#8E2639)", html: <><b>Ms. Cole</b> flagged a missed Professional Practice session</>, stamp: "2 hours ago" },
  { initials: "NA", gradient: "linear-gradient(135deg,#2A91B0,#176278)", html: <>Midterm report card is now available</>, stamp: "3 hours ago" },
];

const STAFF = [
  { initials: "RM", gradient: "linear-gradient(135deg,#4A4DA0,#25285F)", name: "Dr. Rina Marlow", role: "Computing Faculty", hours: "Office hours Tue/Thu 2–4 PM" },
  { initials: "DC", gradient: "linear-gradient(135deg,#70BE44,#438B25)", name: "Ms. Dana Cole", role: "Professional Practice", hours: "Office hours Mon/Wed 10–12 PM" },
  { initials: "NA", gradient: "linear-gradient(135deg,#2A91B0,#176278)", name: "Dr. Noah Alvarez", role: "Database Systems", hours: "Office hours Fri 1–3 PM" },
];

const CLEARANCE = [
  { name: "Library account", meta: "No outstanding items", status: "Clear", good: true },
  { name: "Finance office", meta: "NPR 650,000 due Sept 20", status: "Review", good: false },
  { name: "Student records", meta: "Documents are up to date", status: "Clear", good: true },
];

const DEFAULT_TICKETS = [
  { id: "#SS-1048", tag: "In review", cls: "due-soon", title: "Professional Practice absence follow-up", meta: "Assigned to Attendance Team · Updated today" },
  { id: "#SS-1031", tag: "Resolved", cls: "ok", title: "Midterm report card access", meta: "Closed Sept 9 · Reply available" },
];

const SETTINGS_ROWS = [
  { title: "Email me about attendance issues", desc: "Alert when Aarav is marked absent or late", on: true },
  { title: "Weekly grade summary", desc: "Roundup of grades and assignments each Friday", on: true },
  { title: "Fee due-date reminders", desc: "Ping a few days before any payment is due", on: true },
  { title: "Messages from lecturers", desc: "Notify me when a faculty member sends a message", on: false },
  { title: "SMS for urgent notices", desc: "Send time-sensitive school updates to your verified number", on: true },
];

/* ============================================================================
   ICONS — small inline SVGs, kept 1:1 with the originals so nothing about
   the visual language changes.
   ============================================================================ */

function Icon({ name, size = 17 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (name) {
    case "calendar":
      return <svg {...common} strokeWidth={1.8}><path d="M4 12l8-8 8 8M6 10v10h12V10" /></svg>;
    case "clipboard":
      return <svg {...common} strokeWidth={1.8}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>;
    case "coin":
      return <svg {...common} strokeWidth={1.8}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
    case "check":
      return <svg {...common} strokeWidth={1.8}><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></svg>;
    case "warning":
      return <svg {...common} strokeWidth={1.8}><path d="M12 2l10 18H2z" /><path d="M12 9v5M12 17h.01" /></svg>;
    case "shield":
      return <svg {...common} strokeWidth={1.8}><path d="M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H6v-1a6 6 0 0 1 12 0v1h-3v6h1a3 3 0 0 0 3-3v-4a7 7 0 0 0-7-7z" /><path d="M9 21h6" /></svg>;
    case "bolt":
      return <svg {...common} strokeWidth={1.8}><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></svg>;
    case "clock":
      return <svg {...common} strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case "people":
      return <svg {...common} strokeWidth={1.8}><circle cx="12" cy="8" r="3.2" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" /></svg>;
    case "gear":
      return <svg {...common} strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3H9a1.65 1.65 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8V9a1.65 1.65 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z" /></svg>;
    case "bell":
      return <svg {...common} strokeWidth={1.8}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    case "login":
      return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>;
    case "info":
      return <svg {...common} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>;
    case "report":
      return <svg {...common} strokeWidth={2}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case "mail":
      return <svg {...common} strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "schedule":
      return <svg {...common} strokeWidth={2}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4" /></svg>;
    default:
      return null;
  }
}

/* ============================================================================
   SMALL REUSABLE PIECES
   ============================================================================ */

function Tag({ cls, children }) {
  return <span className={`tag ${cls}`}>{children}</span>;
}

function PillFilters({ options, value, onChange }) {
  return (
    <div className="pill-filters">
      {options.map((opt) => (
        <button key={opt} type="button" className={`pill${value === opt ? " active" : ""}`} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onToggle }) {
  return <div className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} tabIndex={0} onClick={onToggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())} />;
}

/* Animated horizontal bar (grades-by-subject). Animates its width in from 0
   the first time the Grades page becomes visible. */
function GradeBar({ name, score, animate }) {
  return (
    <div className="cat-row">
      <span className="name">{name}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ background: "var(--teal)", width: animate ? `${score}%` : "0%" }} />
      </div>
      <span className="score">{score}</span>
    </div>
  );
}

/* Animated grouped bar chart, redrawn from the original inline-SVG builder
   as a declarative React component. */
function PerformanceChart({ animate }) {
  const W = 540, H = 220, padL = 26, padB = 26, padT = 10, padR = 6;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxVal = Math.max(...CHART_DATA.map((d) => Math.max(d.student, d.cohortAvg))) * 1.15;
  const groupW = chartW / CHART_DATA.length;
  const barW = 15;
  const yFor = (v) => padT + chartH - (v / maxVal) * chartH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="220" id="perfChart">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const gy = padT + chartH * f;
        return <line key={f} x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="#E9E4D3" strokeWidth="1" />;
      })}
      {CHART_DATA.map((d, i) => {
        const center = padL + groupW * i + groupW / 2;
        const bars = [
          { value: d.student, color: "#4A4DA0", offset: -barW / 2 - 3 },
          { value: d.cohortAvg, color: "#70BE44", offset: 3 },
        ];
        return (
          <g key={d.label}>
            {bars.map((bar, bi) => {
              const fullY = yFor(bar.value);
              const fullHeight = padT + chartH - fullY;
              const y = animate ? fullY : padT + chartH;
              const height = animate ? fullHeight : 0;
              return (
                <rect
                  key={bi}
                  className="bar-col"
                  x={center + bar.offset}
                  width={barW}
                  rx={4}
                  fill={bar.color}
                  y={y}
                  height={height}
                  style={{ transition: `y .8s var(--ease) ${i * 70}ms, height .8s var(--ease) ${i * 70}ms` }}
                >
                  <title>{`${d.label}: ${bar.value}`}</title>
                </rect>
              );
            })}
            <text x={center} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#8A9389" fontFamily="Inter, sans-serif">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* Wraps page content so it gets the same fade/slide entrance the original
   IntersectionObserver gave elements — replayed on every page switch via
   the `pageKey` remount trick. */
function PageReveal({ pageKey, children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, [pageKey]);
  return <div className={`page-reveal${ready ? " in-view" : ""}`}>{children}</div>;
}

/* ============================================================================
   MAIN APP
   ============================================================================ */

export default function ParentPortal() {
  const [page, setPage] = useState("overview");
  const [anchor, setAnchor] = useState(null);

  const [attendanceFilter, setAttendanceFilter] = useState("All");
  const [feesFilter, setFeesFilter] = useState("All");
  const [gradesView, setGradesView] = useState("This term");

  const [settings, setSettings] = useState(SETTINGS_ROWS.map((r) => r.on));

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const [noticeVisible, setNoticeVisible] = useState(true);

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginStep, setLoginStep] = useState("phone"); // 'phone' | 'otp'
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [otpStatus, setOtpStatus] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const phoneInputRef = useRef(null);
  const otpInputRef = useRef(null);

  const [tickets, setTickets] = useState(DEFAULT_TICKETS);
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketPriority, setTicketPriority] = useState("Standard · Reply in 1 business day");
  const [ticketMessage, setTicketMessage] = useState("");

  /* -- navigation --------------------------------------------------------- */

  const navigate = useCallback((targetId) => {
    setPage(targetId);
    setAnchor(SUB_TARGETS.has(targetId) ? targetId : null);
    if (location.hash.slice(1) !== targetId) history.replaceState(null, "", "#" + targetId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const target = location.hash.slice(1);
      if (NAV_ITEMS.some((n) => n.id === target)) navigate(target);
    };
    window.addEventListener("hashchange", onHashChange);
    const initial = location.hash.slice(1);
    if (NAV_ITEMS.some((n) => n.id === initial)) navigate(initial);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOverviewGroupOpen = page === "overview" || anchor !== null;

  /* -- login / OTP flow ---------------------------------------------------- */

  const openLogin = () => {
    setLoginOpen(true);
    setTimeout(() => phoneInputRef.current?.focus(), 0);
  };
  const closeLogin = () => setLoginOpen(false);

  const sendOtp = () => {
    if (phone.trim().length < 7) {
      setLoginStatus("Enter a valid phone number to continue.");
      return;
    }
    setLoginStatus("");
    setLoginStep("otp");
    setTimeout(() => otpInputRef.current?.focus(), 0);
  };

  const changePhone = () => {
    setLoginStep("phone");
    setOtpStatus("");
  };

  const verifyOtp = () => {
    if (otp.trim() !== "2040") {
      setOtpStatus("That code did not match. Try the demo code above.");
      return;
    }
    setLoginOpen(false);
    setSignedIn(true);
    showToast("You are securely signed in for this demo.");
  };

  /* -- support ticket form -------------------------------------------------- */

  const submitTicket = (e) => {
    e.preventDefault();
    if (!ticketCategory || !ticketMessage.trim()) {
      showToast("Choose a category and add a short message.");
      return;
    }
    const ticketNumber = "#SS-" + (1050 + tickets.length);
    const urgent = ticketPriority.startsWith("Urgent");
    setTickets((prev) => [
      {
        id: ticketNumber,
        tag: urgent ? "Priority" : "New",
        cls: urgent ? "overdue" : "due-soon",
        title: ticketCategory,
        meta: `Routed to ${ticketCategory === "Attendance concern" ? "Attendance Team" : "Student Services"} · Just now`,
      },
      ...prev,
    ]);
    setTicketCategory("");
    setTicketPriority("Standard · Reply in 1 business day");
    setTicketMessage("");
    showToast(`Request ${ticketNumber} created and routed to the right team.`);
  };

  const openCount = tickets.filter((t) => t.tag !== "Resolved").length;

  const attendanceRows = useMemo(
    () => (attendanceFilter === "All" ? ATTENDANCE_ROWS : ATTENDANCE_ROWS.filter((r) => r.state === attendanceFilter)),
    [attendanceFilter]
  );
  const feesRows = useMemo(() => (feesFilter === "All" ? FEES_ROWS : FEES_ROWS.filter((r) => r.state === feesFilter)), [feesFilter]);

  /* -- render pages --------------------------------------------------------- */

  function renderPage() {
    switch (page) {
      case "overview":
        return (
          <>
            <section className="hero" id="overview">
              <div className="hero-greeting">
                <div className="display">Aarav Sharma · BSc (Hons) Computing · Year 2</div>
                <p>Aarav is building strong momentum this term. Attendance is healthy, one fee payment is due before Sept 20, and an academic advising check-in is coming up Friday.</p>
                <div className="hero-quote">"Stay connected to the Islington experience while Aarav develops the skills and confidence for an industry-ready future."</div>
              </div>
              <div className="ring-stat">
                <div className="ring" style={{ "--pct": 94 }}><span className="ring-value">94%</span></div>
                <div className="ring-label">Attendance<br />this term</div>
              </div>
              <div className="ring-stat">
                <div className="ring" style={{ "--pct": 88 }}><span className="ring-value">88%</span></div>
                <div className="ring-label">Overall<br />average grade</div>
              </div>
              <div className="streak">
                <div className="num">18</div>
                <div className="lbl">days present<br />this month</div>
              </div>
            </section>

            <section className="section">
              <div className="grid grid-cols-1 xs-grid-cols-2 lg-grid-cols-4 gap-6">
                {STAT_CARDS.map((s, i) => (
                  <div className="card stat-card" key={i} style={{ "--s-bg": s.bg, "--s-fg": s.fg }}>
                    <div className="stat-top">
                      <div className="stat-icon"><Icon name={s.icon} /></div>
                      <span className={`stat-trend ${s.trendClass}`}>{s.trend}</span>
                    </div>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        );

      case "attendance":
        return (
          <section className="section" id="attendance">
            <div className="section-head">
              <div>
                <h2>Lecture attendance</h2>
                <div className="meta">Last updated today at 8:10 AM · Student Services sync</div>
              </div>
              <PillFilters options={["All", "Present", "Absent", "Late"]} value={attendanceFilter} onChange={setAttendanceFilter} />
            </div>
            <div className="card">
              <div className="table-scroll">
                <table className="req-table">
                  <thead>
                    <tr><th>Module</th><th>Date</th><th>Status</th><th>Lecturer</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {attendanceRows.map((r, i) => (
                      <tr key={i}>
                        <td><div className="student-name">{r.module}</div></td>
                        <td>{r.date}</td>
                        <td><Tag cls={r.cls}>{r.status}</Tag></td>
                        <td>{r.lecturer}</td>
                        <td>{r.note}</td>
                      </tr>
                    ))}
                    {attendanceRows.length === 0 && (
                      <tr><td colSpan={5} style={{ color: "var(--ink-faint)", textAlign: "center", padding: "22px" }}>No records match this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );

      case "fees":
        return (
          <section className="section" id="fees">
            <div className="section-head">
              <div>
                <h2>Fees & payments</h2>
                <div className="meta">Balance due: NPR 650,000</div>
              </div>
              <PillFilters options={["All", "Due", "Overdue", "Paid"]} value={feesFilter} onChange={setFeesFilter} />
            </div>
            <div className="card">
              <div className="table-scroll">
                <table className="req-table">
                  <thead>
                    <tr><th>Item</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {feesRows.map((r, i) => (
                      <tr key={i}>
                        <td><div className="student-name">{r.item}</div></td>
                        <td>{r.amount}</td>
                        <td>{r.due}</td>
                        <td><Tag cls={r.cls}>{r.status}</Tag></td>
                        <td>
                          <button className={`pay-btn${r.outline ? " outline" : ""}`} onClick={() => showToast(r.outline ? `Receipt for ${r.item} opened.` : `Redirecting to pay ${r.item}...`)}>
                            {r.action}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {feesRows.length === 0 && (
                      <tr><td colSpan={5} style={{ color: "var(--ink-faint)", textAlign: "center", padding: "22px" }}>No records match this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );

      case "appointments":
        return (
          <section className="section" id="appointments">
            <div className="section-head"><h2>Upcoming meetings</h2><div className="meta">{APPOINTMENTS.length} scheduled</div></div>
            <div className="card">
              {APPOINTMENTS.map((a, i) => (
                <div className="appt-row" key={i}>
                  <div className="appt-time"><div className="t">{a.time}</div><div className="m">{a.meridiem}</div></div>
                  <div className="appt-rail" />
                  <div><div className="appt-name">{a.name}</div><div className="appt-type">{a.type}</div></div>
                  <Tag cls={a.cls}>{a.tag}</Tag>
                </div>
              ))}
            </div>
          </section>
        );

      case "alerts":
        return (
          <section className="section" id="alerts">
            <div className="section-head"><h2>Updates for Aarav</h2><div className="meta">{ALERTS.length} need your attention</div></div>
            <div className="card">
              {ALERTS.map((a, i) => (
                <div className="alert-row" key={i}>
                  <div className={`alert-icon ${a.level}`}><Icon name={a.icon} size={15} /></div>
                  <div><div className="alert-title">{a.title}</div><div className="alert-desc">{a.desc}</div><div className="alert-time">{a.time}</div></div>
                </div>
              ))}
            </div>
          </section>
        );

      case "student-services":
        return (
          <>
            <section className="section" id="student-services">
              <div className="section-head"><div><h2>Support & clearance</h2><div className="meta">Everything you need before contacting Student Services</div></div></div>
              <div className="grid grid-cols-1 md-grid-cols gap-8">
                <div className="card">
                  <div className="card-head"><h3>Attendance risk check</h3><Tag cls="overdue">Needs attention</Tag></div>
                  <div className="risk-card">
                    <div className="risk-icon"><Icon name="warning" size={19} /></div>
                    <div>
                      <div className="risk-title">Two missed Professional Practice sessions</div>
                      <div className="risk-copy">Aarav's attendance is still 94%, but repeated absences may affect module completion. We recommend checking in with Student Services this week.</div>
                      <div className="risk-actions">
                        <button className="primary-btn" onClick={() => navigate("student-services")}>Ask Student Services</button>
                        <button className="secondary-btn" onClick={() => showToast("Suggested action saved")}>Save suggested action</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Student clearance</h3><Tag cls="pending">1 pending</Tag></div>
                  <div className="clearance-list">
                    {CLEARANCE.map((c, i) => (
                      <div className="clearance-row" key={i}>
                        <div><div className="clearance-name">{c.name}</div><div className="clearance-meta">{c.meta}</div></div>
                        <Tag cls={c.good ? "ok" : "pending"}><span className={`status-dot ${c.good ? "good" : "pending"}`} />{c.status}</Tag>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="section" id="messages" style={{ marginBottom: 0 }}>
              <div className="section-head">
                <div><h2>Message Student Services</h2><div className="meta">Ask a question and keep the reply in one place</div></div>
                <Tag cls="ok">Replies in 1 business day</Tag>
              </div>
              <div className="grid grid-cols-1 md-grid-cols gap-8">
                <div className="card">
                  <form className="service-form" onSubmit={submitTicket}>
                    <label className="form-label">
                      What do you need help with?
                      <select value={ticketCategory} onChange={(e) => setTicketCategory(e.target.value)} required>
                        <option value="">Choose a category</option>
                        <option>Attendance concern</option>
                        <option>Fees or clearance</option>
                        <option>Academic support</option>
                        <option>Urgent notice</option>
                        <option>Something else</option>
                      </select>
                    </label>
                    <label className="form-label">
                      Priority
                      <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)} required>
                        <option>Standard · Reply in 1 business day</option>
                        <option>Urgent · Contact me today</option>
                      </select>
                    </label>
                    <label className="form-label">
                      Your message
                      <textarea value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} required placeholder="Tell Student Services what would help..." />
                    </label>
                    <button className="primary-btn" type="submit">Create support request</button>
                  </form>
                </div>
                <div className="card">
                  <div className="card-head"><h3>My requests</h3><span className="meta">{openCount} open</span></div>
                  <div className="ticket-list">
                    {tickets.map((t, i) => (
                      <div className="ticket" key={i}>
                        <div className="ticket-top"><Tag cls={t.cls}>{t.tag}</Tag><span className="ticket-id">{t.id}</span></div>
                        <div className="ticket-title">{t.title}</div>
                        <div className="ticket-meta">{t.meta}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        );

      case "quick-actions":
        return (
          <section className="section" id="quick-actions">
            <div className="section-head"><h2>Quick actions</h2></div>
            <div className="grid grid-cols-1 xs-grid-cols-2 lg-grid-cols-4 gap-6">
              {QUICK_ACTIONS.map((q, i) => (
                <button className="qa-card" key={i} style={{ "--q-bg": q.bg, "--q-fg": q.fg }} onClick={() => showToast(q.toast)}>
                  <div className="qa-icon"><Icon name={q.icon} size={18} /></div>
                  <div className="qt">{q.title}</div>
                  <div className="qd">{q.desc}</div>
                </button>
              ))}
            </div>
          </section>
        );

      case "grades":
        return (
          <section className="section" id="grades">
            <div className="section-head">
              <h2>Academic progress</h2>
              <div className="view-toggle">
                {["This term", "Last term"].map((v) => (
                  <button key={v} className={gradesView === v ? "active" : ""} onClick={() => setGradesView(v)}>{v}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 lg-grid-cols-2 gap-8">
              <div className="card">
                <div className="card-head">
                  <h3>Grade trend by week</h3>
                  <div className="chart-legend">
                    <div className="legend-item"><span className="legend-dot" style={{ background: "var(--teal)" }} />Aarav's average</div>
                    <div className="legend-item"><span className="legend-dot" style={{ background: "var(--marigold)" }} />Cohort average</div>
                  </div>
                </div>
                <PerformanceChart animate={true} />
              </div>
              <div className="card">
                <div className="card-head"><h3>Grades by subject</h3><div className="meta">Current term</div></div>
                {GRADE_SUBJECTS.map((g) => (
                  <GradeBar key={g.name} name={g.name} score={g.score} animate={true} />
                ))}
              </div>
            </div>
          </section>
        );

      case "updates":
        return (
          <section className="section" id="updates">
            <div className="section-head"><h2>Recent updates</h2></div>
            <div className="card">
              {ACTIVITY_FEED.map((a, i) => (
                <div className="activity-row" key={i}>
                  <div className="act-avatar" style={{ background: a.gradient }}>{a.initials}</div>
                  <div><div className="act-text">{a.html}</div><div className="act-stamp">{a.stamp}</div></div>
                </div>
              ))}
            </div>
          </section>
        );

      case "contacts":
        return (
          <section className="section" id="contacts">
            <div className="section-head"><h2>Aarav's lecturers & advisors</h2><div className="meta">{STAFF.length} faculty contacts this term</div></div>
            <div className="grid grid-cols-1 sm-grid-cols-2 lg-grid-cols-3 gap-5">
              {STAFF.map((s, i) => (
                <div className="card staff-card" key={i}>
                  <div className="staff-avatar" style={{ background: s.gradient }}>{s.initials}</div>
                  <div className="staff-name">{s.name}</div>
                  <div className="staff-role">{s.role}</div>
                  <div className="staff-stat">{s.hours}</div>
                  <div><button className="staff-msg-btn" onClick={() => showToast(`Opening a message to ${s.name}...`)}>Message</button></div>
                </div>
              ))}
            </div>
          </section>
        );

      case "settings":
        return (
          <section className="section" id="settings">
            <div className="section-head"><h2>Notifications & preferences</h2></div>
            <div className="card">
              {SETTINGS_ROWS.map((row, i) => (
                <div className="setting-row" key={i}>
                  <div><div className="setting-title">{row.title}</div><div className="setting-desc">{row.desc}</div></div>
                  <Switch on={settings[i]} onToggle={() => setSettings((prev) => prev.map((v, idx) => (idx === i ? !v : v)))} />
                </div>
              ))}
            </div>
          </section>
        );

      default:
        return null;
    }
  }

  /* -- render ----------------------------------------------------------------- */

  return (
    <div className="portal-root">
      <style>{CSS}</style>

      <div className="app grid grid-cols-1 sm-grid-cols-sidebar">
        {/* ============ SIDEBAR ============ */}
        <aside className="sidebar">
          <div className="brand">
            <svg className="brand-logo" width="128" height="34" viewBox="0 0 220 58" fill="none">
              <text x="0" y="40" fontFamily="Fraunces, serif" fontSize="30" fontWeight="600" fill="#fff">Islington</text>
            </svg>
          </div>

          <div className="nav-label">Aarav's Degree Journey</div>
          <nav className="nav">
            {NAV_ITEMS.filter((n) => !n.sub).map((item) => (
              <React.Fragment key={item.id}>
                <a
                  className={`nav-item${(anchor ? anchor === item.id : page === item.id) ? " active" : ""}`}
                  href={`#${item.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(item.id); }}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </a>
                {item.id === "overview" && (
                  <div className={`nav-sub${isOverviewGroupOpen ? " open" : ""}`}>
                    {NAV_ITEMS.filter((n) => n.sub).map((sub) => (
                      <a
                        key={sub.id}
                        className={`nav-item${anchor === sub.id ? " active" : ""}`}
                        href={`#${sub.id}`}
                        onClick={(e) => { e.preventDefault(); navigate(sub.id); }}
                      >
                        <Icon name={sub.icon} size={14} />
                        {sub.label}
                      </a>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-foot">Student Services<br />Islington College · Kathmandu</div>
        </aside>

        {/* ============ MAIN ============ */}
        <main className="main">
          <div className="topbar">
            <div className="topbar-left">
              <div className="eyebrow">Saturday, September 12</div>
              <h1>How Aarav is progressing</h1>
            </div>
            <div className="topbar-right">
              <button className="bell-btn" aria-label="Notifications" onClick={() => showToast("3 unread notifications")}>
                <Icon name="bell" size={17} />
                <span className="bell-dot">3</span>
              </button>
              <button className="login-btn" type="button" onClick={openLogin}>
                {signedIn ? <>✓ Signed in</> : <><Icon name="login" /> Log In</>}
              </button>
            </div>
          </div>

          {noticeVisible && (
            <div className="notice-banner" role="status" aria-label="Urgent school notice">
              <div className="notice-icon"><Icon name="warning" size={18} /></div>
              <div className="notice-content">
                <div className="notice-title">Urgent notice · Student Services office hours changed</div>
                <div className="notice-copy">The office will close at 3:00 PM on Monday for staff training. Online support remains available.</div>
              </div>
              <div className="notice-actions">
                <button className="text-btn" onClick={() => setNoticeVisible(false)}>Mark as read</button>
                <button className="text-btn" onClick={() => showToast("Notice details opened")}>View details</button>
              </div>
            </div>
          )}

          <PageReveal pageKey={page}>{renderPage()}</PageReveal>

          <div className="review-strip">
            <div>
              <div className="display">Academic advising check-in</div>
              <p>Friday, 3:00 PM · Computing Faculty · Review Aarav's term progress</p>
            </div>
            <div className="countdown">
              <div className="cd-box"><div className="cd-num">94%</div><div className="cd-lbl">attendance</div></div>
              <div className="cd-box"><div className="cd-num">NPR 650k</div><div className="cd-lbl">fees due</div></div>
              <div className="cd-box"><div className="cd-num">88%</div><div className="cd-lbl">avg. grade</div></div>
            </div>
          </div>
        </main>
      </div>

      {/* ============ LOGIN MODAL ============ */}
      <div className={`modal-backdrop${loginOpen ? " open" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && closeLogin()}>
        <div className="modal">
          <div className="modal-head">
            <div>
              <h2>Welcome back</h2>
              <div className="modal-copy">Use your verified phone number to securely access Aarav's updates.</div>
            </div>
            <button className="close-btn" type="button" aria-label="Close login" onClick={closeLogin}>×</button>
          </div>

          {loginStep === "phone" ? (
            <div className="otp-step">
              <label className="form-label">
                Parent phone number
                <input ref={phoneInputRef} type="tel" placeholder="+1 555 010 2040" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <button className="primary-btn" type="button" onClick={sendOtp}>Send verification code</button>
              <div className="modal-status" aria-live="polite">{loginStatus}</div>
            </div>
          ) : (
            <div className="otp-step">
              <div className="demo-hint">Demo mode: use <strong>2040</strong> as the verification code.</div>
              <label className="form-label">
                4-digit verification code
                <input ref={otpInputRef} className="otp-input" inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="one-time-code" required value={otp} onChange={(e) => setOtp(e.target.value)} />
              </label>
              <button className="primary-btn" type="button" onClick={verifyOtp}>Verify and continue</button>
              <button className="text-btn" type="button" onClick={changePhone}>Use a different number</button>
              <div className="modal-status" aria-live="polite">{otpStatus}</div>
            </div>
          )}
        </div>
      </div>

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

/* ============================================================================
   STYLES
   Same visual system as the original file (design tokens, cards, tables,
   nav, modal, toast) — selectors that used to be flipped by vanilla JS
   (.active, .open, .on, .show) are now driven by React state/className.
   ============================================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700;800&display=swap');

.portal-root{
  --bg:#F5F6FA; --paper:#FBFBFD; --surface:#FFFFFF; --tab:#E8E9F5;
  --ink:#24345C; --ink-soft:#5D6A88; --ink-faint:#8792A9; --line:#DEE4F0;
  --teal:#3D5AA9; --teal-deep:#1E3764; --teal-tint:#EDF2FF;
  --marigold:#5972C7; --marigold-tint:#E9EEFF;
  --brick:#C43B52; --brick-tint:#F9E5EA;
  --azure:#2A91B0; --azure-tint:#E4F4F8;
  --radius-card:18px; --radius-tab:10px;
  --shadow-card:0 1px 2px rgba(34,48,39,.06), 0 8px 20px -12px rgba(34,48,39,.15);
  --shadow-lift:0 14px 34px -14px rgba(34,48,39,.28);
  --ease:cubic-bezier(.2,.7,.3,1);
  background:var(--bg); color:var(--ink); font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.5; min-height:100vh;
}
.portal-root *{box-sizing:border-box}
.portal-root h1,.portal-root h2,.portal-root h3,.portal-root .display{font-family:'Fraunces',serif;font-weight:500;letter-spacing:-.01em;color:var(--ink);margin:0}
.portal-root button{font-family:inherit}.portal-root a{color:inherit;text-decoration:none}

.app{display:grid;grid-template-columns:1fr;min-height:100vh}
@media (min-width:721px){.app{grid-template-columns:250px 1fr}}

.sidebar{background:var(--teal-deep);color:#EAF1EC;display:flex;flex-direction:row;align-items:center;gap:2px;padding:8px 4px;position:fixed;bottom:0;left:0;right:0;z-index:30;border-top:1px solid rgba(255,255,255,.1)}
@media (min-width:721px){.sidebar{position:sticky;top:0;height:100vh;flex-direction:column;align-items:stretch;padding:28px 0 20px;border-top:0}}
.brand{display:none;align-items:center;gap:11px;padding:0 22px 24px;border-bottom:1px solid rgba(255,255,255,.16);margin-bottom:14px}
@media (min-width:721px){.brand{display:flex}}
.brand-logo{display:block}
.nav-label{display:none;padding:16px 22px 8px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#7FA08D;font-weight:700}
@media (min-width:721px){.nav-label{display:block}}
.nav{display:flex;flex-direction:row;justify-content:space-around;width:100%;padding:0;gap:2px;overflow-x:auto}
@media (min-width:721px){.nav{flex-direction:column;gap:2px;padding:0 12px;justify-content:flex-start;overflow:visible}}
.nav-item{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:left;padding:7px 4px;border-radius:var(--radius-tab);color:#CBDACF;font-size:9.5px;font-weight:500;border:none;background:transparent;position:relative;transition:background .22s var(--ease),color .22s var(--ease),transform .22s var(--ease);cursor:pointer}
@media (min-width:721px){.nav-item{flex-direction:row;align-items:center;gap:12px;padding:10px 12px;font-size:14px;width:100%}}
.nav-item svg{flex:0 0 18px;opacity:.85;transition:opacity .22s var(--ease),transform .3s var(--ease)}
.nav-item:hover{background:rgba(255,255,255,.07);color:#fff;transform:translateX(0)}
@media (min-width:721px){.nav-item:hover{transform:translateX(2px)}}
.nav-item:hover svg{opacity:1;transform:scale(1.08)}
.nav-item.active{background:var(--marigold);color:var(--teal-deep);font-weight:700}
.nav-item.active svg{opacity:1}
.nav-badge{margin-left:0;position:absolute;top:2px;right:8px;font-size:10.5px;font-weight:700;background:rgba(190,80,57,.9);color:#fff;padding:1.5px 7px;border-radius:20px}
@media (min-width:721px){.nav-badge{margin-left:auto;position:static}}
.nav-item.active .nav-badge{background:var(--brick)}

.nav-sub{display:none;flex-direction:column;gap:1px;margin:0 8px 0 30px;padding-left:12px;border-left:1px solid rgba(255,255,255,.14);max-height:0;opacity:0;overflow:hidden;transition:max-height .38s var(--ease),opacity .28s var(--ease),margin .38s var(--ease)}
@media (min-width:721px){.nav-sub{display:flex}}
.nav-sub.open{max-height:260px;opacity:1;margin:2px 8px 8px 30px}
.nav-sub .nav-item{padding:7px 10px;font-size:12.5px;color:#AFC4B7}
.nav-sub .nav-item svg{width:14px;height:14px;flex:0 0 14px}
.nav-sub .nav-item.active{background:rgba(226,164,78,.16);color:#F4E3C6;font-weight:600}
.nav-sub .nav-item.active svg{color:var(--marigold);opacity:1}

.sidebar-foot{display:none;padding:16px 22px 0;margin-top:auto;border-top:1px solid rgba(255,255,255,.12);font-size:12px;color:#9FB6A6;line-height:1.5}
@media (min-width:721px){.sidebar-foot{display:block}}

.main{max-width:1480px;padding:22px 18px 96px;width:100%}
@media (min-width:721px){.main{padding:28px 26px 90px}}
@media (min-width:901px){.main{padding:38px 54px 96px}}

.topbar{display:flex;flex-direction:column;align-items:flex-start;gap:24px;margin-bottom:34px;flex-wrap:wrap}
@media (min-width:721px){.topbar{flex-direction:row;align-items:center;justify-content:space-between}}
.topbar-left .eyebrow{font-size:13px;color:var(--ink-soft)}
.topbar-left h1{font-size:27px;margin-top:3px}
.topbar-right{display:flex;align-items:center;gap:14px}
.bell-btn{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--ink-soft);cursor:pointer;transition:transform .25s var(--ease),box-shadow .25s var(--ease),border-color .25s var(--ease)}
.bell-btn:hover{transform:translateY(-2px);box-shadow:var(--shadow-lift);border-color:var(--marigold)}
.bell-dot{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--brick);color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)}
.login-btn{display:flex;align-items:center;gap:9px;background:var(--teal);color:#fff;border:none;border-radius:999px;padding:11px 22px 11px 20px;font-size:13.5px;font-weight:700;cursor:pointer;transition:transform .25s var(--ease),box-shadow .25s var(--ease),background .25s var(--ease)}
.login-btn:hover{background:var(--teal-deep);transform:translateY(-2px);box-shadow:var(--shadow-lift)}

.hero{background:var(--teal);background-image:radial-gradient(circle at 88% -10%,rgba(255,255,255,.10),transparent 55%);border-radius:24px;padding:32px 36px;color:#EAF1EC;display:grid;grid-template-columns:1fr;gap:30px;align-items:center;margin-bottom:34px;animation:rise .5s var(--ease) both}
@media (min-width:901px){.hero{grid-template-columns:1.3fr auto auto auto}}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.hero-greeting .display{font-size:23px;color:#fff}
.hero-greeting p{margin:9px 0 0;font-size:13.5px;color:#C7DBCC;max-width:44ch}
.hero-quote{margin-top:16px;font-family:'Fraunces',serif;font-style:italic;font-size:13.5px;color:#DCE9DF;border-left:2px solid var(--marigold);padding-left:12px}
.ring-stat{display:flex;flex-direction:column;align-items:center;gap:10px}
.ring{width:92px;height:92px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--marigold) calc(var(--pct) * 1%),rgba(255,255,255,.18) 0);position:relative}
.ring::before{content:"";position:absolute;inset:8px;border-radius:50%;background:var(--teal-deep)}
.ring-value{position:relative;font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:#fff}
.ring-label{font-size:11.5px;color:#C7DBCC;text-align:center}
.streak{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:16px 18px;text-align:center;min-width:108px;justify-self:start}
.streak .num{font-family:'Fraunces',serif;font-size:28px;color:var(--marigold);line-height:1}
.streak .lbl{font-size:11.5px;color:#C7DBCC;margin-top:6px}

.section{margin-bottom:56px}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:18px;margin-bottom:20px;flex-wrap:wrap}
.section-head h2{font-size:20px}
.section-head .meta{font-size:12.5px;color:var(--ink-faint)}
.view-toggle{display:flex;background:var(--tab);border-radius:999px;padding:4px;gap:2px}
.view-toggle button{border:none;background:transparent;padding:8px 15px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--ink-soft);cursor:pointer;transition:background .25s var(--ease),color .25s var(--ease)}
.view-toggle button.active{background:var(--teal);color:#fff}

.page-reveal{opacity:0;transform:translateY(10px);transition:opacity .42s var(--ease),transform .42s var(--ease)}
.page-reveal.in-view{opacity:1;transform:none}

.grid{display:grid;align-items:start}
.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}
.gap-5{gap:1.25rem}.gap-6{gap:1.5rem}.gap-8{gap:2rem}
@media (min-width:481px){.xs-grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:721px){.sm-grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:901px){.md-grid-cols{grid-template-columns:1fr}}
@media (min-width:901px){.md-grid-cols{grid-template-columns:1.05fr .95fr}}
@media (min-width:1181px){.lg-grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.lg-grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.lg-grid-cols-2{grid-template-columns:1.2fr 1fr}}

.card{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:28px 30px;box-shadow:var(--shadow-card);transition:transform .3s var(--ease),box-shadow .3s var(--ease),border-color .3s var(--ease)}
.card:hover{transform:translateY(-5px);border-color:var(--marigold);box-shadow:var(--shadow-lift)}
.card-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px;gap:10px}
.card-head h3{font-size:16.5px}
.card-head .meta{font-size:12.5px;color:var(--ink-faint)}

.stat-card{padding:22px 24px}
.stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--s-bg);color:var(--s-fg);transition:transform .3s var(--ease)}
.card:hover .stat-icon{transform:scale(1.1) rotate(-4deg)}
.stat-trend{font-size:11.5px;font-weight:700}
.trend-up{color:var(--teal)}.trend-down{color:var(--brick)}
.stat-value{font-family:'Fraunces',serif;font-size:28px;font-weight:600}
.stat-label{color:var(--ink-soft);font-size:12.5px;margin-top:3px}

.table-scroll{overflow-x:auto}
.req-table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:640px}
.req-table th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-faint);font-weight:700;padding:10px 14px;border-bottom:1px solid var(--line)}
.req-table td{padding:14px;border-bottom:1px dashed var(--line);vertical-align:middle}
.req-table tbody tr{transition:background .2s var(--ease)}
.req-table tbody tr:hover{background:var(--teal-tint)}
.req-table tbody tr:last-child td{border-bottom:none}
.student-name{font-weight:600}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
.tag.ok{background:var(--teal-tint);color:var(--teal-deep)}
.tag.due-soon{background:var(--azure-tint);color:var(--azure)}
.tag.overdue{background:var(--brick-tint);color:var(--brick)}
.tag.pending{background:var(--marigold-tint);color:#8a5f1e}
.pill-filters{display:flex;gap:6px;flex-wrap:wrap}
.pill{font-size:11.5px;font-weight:600;padding:6px 13px;border-radius:999px;border:1px solid var(--line);color:var(--ink-soft);background:var(--surface);cursor:pointer;transition:all .2s var(--ease)}
.pill:hover{border-color:var(--teal);color:var(--teal-deep)}
.pill.active{background:var(--teal);color:#fff;border-color:var(--teal)}

.pay-btn{font-size:11.5px;font-weight:700;padding:8px 15px;border-radius:999px;border:1px solid var(--teal);background:var(--teal);color:#fff;cursor:pointer;transition:all .2s var(--ease);white-space:nowrap}
.pay-btn:hover{background:var(--teal-deep);border-color:var(--teal-deep)}
.pay-btn.outline{background:transparent;color:var(--teal-deep)}
.pay-btn.outline:hover{background:var(--teal-tint)}

.appt-row{display:grid;grid-template-columns:56px 22px 1fr auto;align-items:center;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line);transition:transform .3s var(--ease),background .3s var(--ease)}
.appt-row:last-child{border-bottom:none}
.appt-row:hover{transform:translateY(-3px);background:var(--paper)}
.appt-time{text-align:center}
.appt-time .t{font-family:'Fraunces',serif;font-size:14px;font-weight:600}
.appt-time .m{font-size:9.5px;color:var(--ink-faint);text-transform:uppercase}
.appt-rail{width:2px;height:100%;background:var(--line);position:relative;justify-self:center}
.appt-rail::before{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--marigold);box-shadow:0 0 0 3px var(--marigold-tint)}
.appt-name{font-weight:600;font-size:13.5px}
.appt-type{font-size:12px;color:var(--ink-faint);margin-top:1px}

.alert-row{display:flex;gap:12px;padding:12px 0;border-bottom:1px dashed var(--line);transition:transform .3s var(--ease),background .3s var(--ease)}
.alert-row:last-child{border-bottom:none}
.alert-row:hover{transform:translateY(-3px);background:var(--paper)}
.alert-icon{width:34px;height:34px;border-radius:9px;flex:0 0 auto;display:flex;align-items:center;justify-content:center}
.alert-icon.high{background:var(--brick-tint);color:var(--brick)}
.alert-icon.med{background:var(--marigold-tint);color:#8a5f1e}
.alert-icon.low{background:var(--azure-tint);color:var(--azure)}
.alert-title{font-size:13px;font-weight:600}
.alert-desc{font-size:12px;color:var(--ink-soft);margin-top:2px}
.alert-time{font-size:11px;color:var(--ink-faint);margin-top:4px}

.qa-card{position:relative;display:flex;flex-direction:column;gap:10px;text-align:left;cursor:pointer;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:22px;transition:transform .3s var(--ease),box-shadow .3s var(--ease),border-color .3s var(--ease)}
.qa-card:hover{transform:translateY(-5px);border-color:var(--marigold);box-shadow:var(--shadow-lift)}
.qa-icon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--q-bg);color:var(--q-fg);transition:transform .3s var(--ease)}
.qa-card:hover .qa-icon{transform:scale(1.12) rotate(6deg)}
.qa-card .qt{font-size:14px;font-weight:700;font-family:'Fraunces',serif}
.qa-card .qd{font-size:12px;color:var(--ink-faint)}

.cat-row{display:grid;grid-template-columns:96px 1fr 30px;align-items:center;gap:12px;font-size:13px;margin-bottom:13px}
@media (min-width:481px){.cat-row{grid-template-columns:128px 1fr 36px}}
.cat-row .name{color:var(--ink-soft);font-weight:500}
.bar-track{height:8px;background:var(--tab);border-radius:6px;overflow:hidden}
.bar-fill{height:100%;border-radius:6px;transition:width 1s var(--ease)}
.cat-row .score{text-align:right;font-weight:700;font-family:'Fraunces',serif}
.chart-legend{display:flex;gap:16px}
.legend-item{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-soft)}
.legend-dot{width:9px;height:9px;border-radius:3px}
.bar-col:hover{filter:brightness(1.08)}

.activity-row{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line);transition:transform .3s var(--ease),background .3s var(--ease)}
.activity-row:last-child{border-bottom:none}
.activity-row:hover{transform:translateY(-3px);background:var(--paper)}
.act-avatar{width:32px;height:32px;border-radius:9px;flex:0 0 auto;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.act-text{font-size:13px;line-height:1.5}
.act-text b{font-weight:700}
.act-stamp{font-size:11px;color:var(--ink-faint);margin-top:3px}

.staff-card{text-align:center;padding:24px 18px}
.staff-avatar{width:56px;height:56px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-weight:700;font-size:18px;color:#fff}
.staff-name{font-weight:700;font-size:14px}
.staff-role{font-size:12px;color:var(--ink-faint);margin-top:2px}
.staff-stat{margin-top:12px;font-size:11.5px;color:var(--ink-soft);background:var(--teal-tint);border-radius:999px;padding:5px 12px;display:inline-block}
.staff-msg-btn{margin-top:12px;font-size:12px;font-weight:700;color:#fff;background:var(--teal);border:none;border-radius:999px;padding:8px 18px;cursor:pointer;transition:background .2s var(--ease)}
.staff-msg-btn:hover{background:var(--teal-deep)}

.setting-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px dashed var(--line);gap:16px}
.setting-row:last-child{border-bottom:none}
.setting-title{font-size:13.5px;font-weight:600}
.setting-desc{font-size:12px;color:var(--ink-faint);margin-top:2px}

.notice-banner{display:flex;align-items:flex-start;gap:13px;background:var(--brick-tint);color:var(--ink);border:1px solid #E9B8AA;border-left:4px solid var(--brick);border-radius:14px;padding:17px 20px;margin-bottom:34px;box-shadow:var(--shadow-card)}
.notice-icon{color:var(--brick);flex:0 0 auto;margin-top:2px}
.notice-content{flex:1}
.notice-title{font-size:13.5px;font-weight:700}
.notice-copy{color:var(--ink-soft);font-size:12.5px;margin-top:3px}
.notice-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.text-btn{border:0;background:transparent;color:var(--teal-deep);font-size:12px;font-weight:700;cursor:pointer;padding:6px 0}
.text-btn:hover{color:var(--brick)}

.risk-card{display:flex;align-items:flex-start;gap:15px}
.risk-icon{width:42px;height:42px;border-radius:11px;background:var(--brick-tint);color:var(--brick);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.risk-title{font-size:14px;font-weight:700}
.risk-copy{color:var(--ink-soft);font-size:12.5px;margin-top:4px}
.risk-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
.primary-btn,.secondary-btn{border-radius:999px;padding:9px 15px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s var(--ease)}
.primary-btn{border:1px solid var(--teal);background:var(--teal);color:#fff}
.primary-btn:hover{background:var(--teal-deep);border-color:var(--teal-deep)}
.secondary-btn{border:1px solid var(--line);background:var(--surface);color:var(--teal-deep)}
.secondary-btn:hover{border-color:var(--teal);background:var(--teal-tint)}
.clearance-list{display:grid;gap:10px}
.clearance-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}
.clearance-row:last-child{border-bottom:none}
.clearance-name{font-size:13px;font-weight:600}
.clearance-meta{font-size:11.5px;color:var(--ink-faint);margin-top:2px}
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.status-dot.good{background:var(--teal)}
.status-dot.pending{background:var(--marigold)}

.service-form{display:grid;gap:16px}
.form-label{display:grid;gap:7px;color:var(--ink-soft);font-size:12px;font-weight:700}
.form-label select,.form-label textarea,.form-label input{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);padding:11px 12px;font:inherit;font-size:13px;outline:none}
.form-label textarea{resize:vertical;min-height:108px}
.form-label select:focus,.form-label textarea:focus,.form-label input:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-tint)}
.ticket-list{display:grid;gap:13px}
.ticket{border:1px solid var(--line);border-radius:12px;padding:14px 15px;background:var(--paper)}
.ticket-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ticket-id{font-size:11px;color:var(--ink-faint);font-weight:700}
.ticket-title{font-size:13px;font-weight:700;margin-top:6px}
.ticket-meta{font-size:11.5px;color:var(--ink-soft);margin-top:4px}

.modal-backdrop{position:fixed;inset:0;z-index:50;background:rgba(31,68,56,.42);display:none;align-items:center;justify-content:center;padding:18px}
.modal-backdrop.open{display:flex}
.modal{width:min(100%,430px);background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:25px;box-shadow:0 24px 70px rgba(31,68,56,.25)}
.modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:18px}
.modal-head h2{font-size:22px}
.modal-copy{color:var(--ink-soft);font-size:12.5px;margin-top:5px}
.close-btn{width:30px;height:30px;border:1px solid var(--line);border-radius:50%;background:var(--surface);color:var(--ink-soft);cursor:pointer;font-size:18px;line-height:1}
.otp-step{display:grid;gap:13px}
.otp-input{letter-spacing:.3em;text-align:center;font-size:20px!important;font-weight:700}
.demo-hint{background:var(--teal-tint);color:var(--teal-deep);border-radius:9px;padding:9px 11px;font-size:11.5px}
.modal-status{min-height:18px;color:var(--brick);font-size:12px}

.switch{position:relative;width:42px;height:24px;border-radius:999px;background:var(--tab);flex:0 0 auto;cursor:pointer;transition:background .25s var(--ease)}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .25s var(--ease)}
.switch.on{background:var(--teal)}
.switch.on::after{transform:translateX(18px)}

.toast{position:fixed;right:22px;bottom:22px;z-index:60;background:var(--ink);color:#fff;border-radius:10px;padding:12px 15px;font-size:12.5px;box-shadow:var(--shadow-lift);opacity:0;transform:translateY(12px);pointer-events:none;transition:all .25s var(--ease)}
.toast.show{opacity:1;transform:none}

.review-strip{background:var(--ink);color:#EDEEE7;border-radius:var(--radius-card);padding:26px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px}
.review-strip .display{color:#fff;font-size:19px}
.review-strip p{margin:5px 0 0;font-size:13px;color:#B9C2B6}
.countdown{display:flex;gap:10px}
.cd-box{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:11px 16px;text-align:center;min-width:64px}
.cd-num{font-family:'Fraunces',serif;font-size:20px;color:var(--marigold)}
.cd-lbl{font-size:10.5px;color:#B9C2B6;margin-top:2px}

@media (prefers-reduced-motion:reduce){
  .hero{animation:none}
  .page-reveal{transition:none;opacity:1;transform:none}
  .nav-sub{transition:none}
  .bar-fill,.bar-col{transition:none!important}
}
`;
