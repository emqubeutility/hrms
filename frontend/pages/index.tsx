import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { getEmployees, request } from '../lib/api';
import { UserType } from '../lib/user-types';
import { DashboardSummary, NotificationItem, getDashboard, getNotifications } from '../lib/dashboard-api';
import { fmtDays } from '../lib/leave-api';

/*
 * Dashboard (matches ui-mockups/hrms-dashboard-v2.html).
 * Live: employees, leave, attendance, approvals, headcount chart, department split, recent activity,
 * platform and database health. Employees see their own figures in the same layout.
 * Sample: nothing at present except Payroll Engine status (payroll is not built).
 */

type IconProps = { className?: string };
const Svg = ({ className, children }: IconProps & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);
const UsersIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a7 7 0 0 1 14 0v1" /><path d="M16 4.1a4 4 0 0 1 0 7.8M18 14.2A7 7 0 0 1 22 21" /></Svg>;
const UserPlusIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a7 7 0 0 1 14 0v1M19 8v6M16 11h6" /></Svg>;
const CalendarIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
const CalendarCheckIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" /></Svg>;
const ClockIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
const DocIcon = (p: IconProps) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Svg>;
const WalletIcon = (p: IconProps) => <Svg {...p}><rect x="2.5" y="6" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M16 15h2" /><path d="M5 6V5a2 2 0 0 1 2-2h9" /></Svg>;
const BarsIcon = (p: IconProps) => <Svg {...p}><path d="M5 20V11M12 20V4M19 20v-6" /></Svg>;
const ChartIcon = (p: IconProps) => <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>;
const BoltIcon = (p: IconProps) => <Svg {...p}><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></Svg>;
const PieIcon = (p: IconProps) => <Svg {...p}><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M15 3.3A9 9 0 0 1 20.7 9H15z" /></Svg>;
const ArrowIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
const CheckIcon = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
const ChevronDown = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

const SampleTag = () => (
  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400" title="Sample data until this module is built">
    Sample
  </span>
);

function Sparkline({ d, stroke, fill }: { d: string; stroke: string; fill: string }) {
  return (
    <svg className="pointer-events-none absolute bottom-0 right-0 h-[46%] w-[38%] opacity-80" viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L120 60 L0 60Z`} fill={fill} opacity=".1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function Metric({
  label, value, trend, down, icon: Icon, tone, spark, sample,
}: {
  label: string; value: React.ReactNode; trend?: string; down?: boolean; icon: (p: IconProps) => React.JSX.Element;
  tone: 'blue' | 'green' | 'indigo' | 'orange'; spark: { d: string; stroke: string; fill: string }; sample?: boolean;
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="relative flex h-[118px] min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-gray-200 bg-white px-[18px] py-4 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className={`relative z-10 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      {sample && (
        <span className="absolute right-3 top-3 z-10">
          <SampleTag />
        </span>
      )}
      <div className="relative z-10 min-w-0">
        <p className="whitespace-nowrap text-[13px] font-medium text-gray-500">{label}</p>
        <p className="mt-0.5 whitespace-nowrap text-2xl font-bold tracking-tight text-gray-900">
          {value}
          {trend && <span className={`ml-1.5 align-middle text-xs font-semibold ${down ? 'text-red-600' : 'text-green-600'}`}>{down ? '↓' : '↑'} {trend}</span>}
        </p>
      </div>
      <Sparkline {...spark} />
    </div>
  );
}

function Panel({ title, icon: Icon, right, children, className = '' }: { title: string; icon?: (p: IconProps) => React.JSX.Element; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-gray-200 bg-white px-6 py-[22px] shadow-sm ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-blue-600" />}
          <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function greeting(h: number) {
  return h < 12 ? 'Good Morning!' : h < 17 ? 'Good Afternoon!' : 'Good Evening!';
}

type Health = 'checking' | 'ok' | 'down';

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [apiHealth, setApiHealth] = useState<Health>('checking');
  const [dbHealth, setDbHealth] = useState<Health>('checking');
  const [now, setNow] = useState<Date | null>(null);
  const [notice, setNotice] = useState('');
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [dashFailed, setDashFailed] = useState(false);
  const [activity, setActivity] = useState<NotificationItem[]>([]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    getEmployees({ pageSize: 1 })
      .then((res) => setEmployeeCount(res.pagination?.totalItems ?? 0))
      .catch((err) => {
        setEmployeeCount(null);
        if (/unauthori[sz]ed|401/i.test(err.message ?? '')) logout();
      });
    getDashboard().then((r) => setDash(r.data)).catch(() => setDashFailed(true));
    getNotifications().then((r) => setActivity(r.data)).catch(() => {});
    request('/health').then(() => setApiHealth('ok')).catch(() => setApiHealth('down'));
    request('/health/ready').then(() => setDbHealth('ok')).catch(() => setDbHealth('down'));
  }, [isAuthenticated, isLoading, router, logout]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  const name = user?.username ?? 'there';
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const isSystemAdmin = user?.userTypeId === UserType.SystemAdmin;
  const team = dash?.team ?? null;
  const mine = dash?.mine ?? null;
  const charts = dash?.charts ?? null;
  const isHr = dash?.role === 'HR';
  const expected = team ? team.total - team.offToday : 0;
  const allOff = !!team && team.total > 0 && expected <= 0;
  const pct = team && expected > 0 ? Math.min(100, Math.round(((team.present + team.onLeave) / expected) * 1000) / 10) : null;
  const myBalance = mine ? mine.balances.reduce((s, b) => s + b.balance, 0) : 0;

  // Headcount chart: six month-end points drawn on the same 720x205 canvas as before.
  const counts = charts?.headcount ?? [];
  const top = Math.max(4, ...counts.map((c) => c.count));
  const step = Math.max(1, Math.ceil(top / 4));
  const maxY = step * 4;
  const px = (i: number) => 55 + i * 129;
  const py = (n: number) => 172 - (n / maxY) * 152;
  const linePath = counts.length ? counts.map((c, i) => (i === 0 ? `M${px(0)} ${py(c.count)}` : ` C${(px(i - 1) + px(i)) / 2} ${py(counts[i - 1].count)}, ${(px(i - 1) + px(i)) / 2} ${py(c.count)}, ${px(i)} ${py(c.count)}`)).join('') : '';
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

  // Department donut: the three largest departments, the rest grouped.
  const COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#fb923c'];
  const depts = charts?.departments ?? [];
  const deptTotal = depts.reduce((s, d) => s + d.count, 0);
  const slices = [...depts.slice(0, 3), ...(depts.length > 3 ? [{ name: 'Others', count: depts.slice(3).reduce((s, d) => s + d.count, 0) }] : [])];
  const CIRC = 414.7;
  let used = 0;
  const arcs = slices.map((s, i) => {
    const len = deptTotal ? (s.count / deptTotal) * CIRC : 0;
    const arc = { ...s, color: COLORS[i], len, offset: -used, pct: deptTotal ? Math.round((s.count / deptTotal) * 100) : 0 };
    used += len;
    return arc;
  });
  const kindStyle: Record<string, { tone: string; icon: React.ReactNode }> = {
    LEAVE_DECISION: { tone: 'bg-green-100 text-green-600', icon: <CheckIcon className="h-4 w-4" /> },
    CORRECTION_DECISION: { tone: 'bg-indigo-100 text-indigo-600', icon: <ClockIcon className="h-4 w-4" /> },
    LEAVE_UPCOMING: { tone: 'bg-blue-100 text-blue-600', icon: <CalendarIcon className="h-4 w-4" /> },
    BALANCE_EXPIRING: { tone: 'bg-orange-100 text-orange-600', icon: <CalendarIcon className="h-4 w-4" /> },
    APPROVAL_WAITING: { tone: 'bg-orange-100 text-orange-600', icon: <DocIcon className="h-4 w-4" /> },
    DOCUMENT_EXPIRING: { tone: 'bg-red-100 text-red-600', icon: <DocIcon className="h-4 w-4" /> },
  };
  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins || 1} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
    return `${Math.round(mins / 1440)} days ago`;
  };
  const soon = (what: string) => () => {
    setNotice(`${what} will be available when that module is built.`);
    setTimeout(() => setNotice(''), 2500);
  };
  const allOk = apiHealth === 'ok' && dbHealth === 'ok';

  const quick: Array<{ label: string; icon: (p: IconProps) => React.JSX.Element; href?: string; orange?: boolean; soonLabel?: string }> = [
    { label: 'Add Employee', icon: UserPlusIcon, href: isHr ? '/employee-profile/new' : undefined, soonLabel: 'Adding employees (HR only)' },
    { label: 'Manage Leave', icon: CalendarIcon, href: team || isHr ? '/leave/team' : '/leave/my' },
    { label: 'Process Payroll', icon: WalletIcon, orange: true, soonLabel: 'Payroll' },
    { label: 'Mark Attendance', icon: ClockIcon, href: '/attendance/mark' },
    { label: 'Configure Fields', icon: GearIcon, href: isSystemAdmin ? '/custom-fields' : undefined, soonLabel: isSystemAdmin ? undefined : 'Field configuration (System Admin only)' },
    { label: 'View Reports', icon: DocIcon, href: isHr || team ? '/attendance/reports' : '/attendance/my' },
  ];

  const statusRows: Array<{ label: string; state: Health | 'off' }> = [
    { label: 'HRMS Platform', state: apiHealth },
    { label: 'Database', state: dbHealth },
    { label: 'Payroll Engine', state: 'off' },
    { label: 'Attendance Service', state: dash ? 'ok' : dashFailed ? 'down' : 'checking' },
  ];

  return (
    <div>
      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-gray-50 shadow-lg">
          {notice}
        </div>
      )}

      {/* ============ Hero ============ */}
      <section className="relative flex h-[212px] items-center overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white shadow-lg shadow-blue-600/25 sm:px-9">
        {/* Faded on phones so the greeting stays readable */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30 sm:opacity-100" viewBox="0 0 900 200" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
          <defs>
            <linearGradient id="towerG" x1="0" x2="1">
              <stop offset="0" stopColor="#c7d2fe" />
              <stop offset=".5" stopColor="#e0e7ff" />
              <stop offset="1" stopColor="#a5b4fc" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="2">
            <circle cx="640" cy="60" r="210" />
            <circle cx="640" cy="60" r="250" strokeOpacity=".35" />
          </g>
          <g fill="url(#towerG)" opacity=".75">
            <rect rx="12" x="520" y="120" width="30" height="90" />
            <rect rx="12" x="556" y="100" width="26" height="110" />
            <rect rx="12" x="590" y="130" width="34" height="80" />
            <rect rx="12" x="740" y="112" width="30" height="98" />
            <rect rx="12" x="776" y="92" width="24" height="118" />
            <rect rx="12" x="806" y="124" width="34" height="86" />
            <rect rx="12" x="846" y="104" width="28" height="106" />
          </g>
          <g fill="url(#towerG)">
            <polygon points="640,200 652,150 662,120 668,80 672,40 674,8 676,40 680,80 686,120 696,150 708,200" />
            <rect rx="12" x="660" y="120" width="24" height="80" />
          </g>
          <g fill="url(#towerG)" opacity=".95">
            <polygon points="610,200 614,140 622,116 628,128 632,200" />
            <polygon points="700,200 706,124 716,94 722,132 732,200" />
            <polygon points="446,200 452,148 466,118 470,150 476,200" />
            <rect rx="12" x="380" y="136" width="28" height="64" />
            <rect rx="12" x="414" y="110" width="20" height="90" />
            <rect rx="12" x="268" y="128" width="30" height="72" />
            <rect rx="12" x="304" y="104" width="22" height="96" />
            <rect rx="12" x="338" y="140" width="26" height="60" />
          </g>
          <rect rx="12" y="186" width="900" height="14" fill="#818cf8" opacity=".22" />
        </svg>

        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Welcome back, {displayName}!</h1>
          <p className="mb-[18px] mt-1.5 text-sm text-blue-200 sm:text-base">Here&apos;s what&apos;s happening in your HR system today.</p>
          <Link href="/employees" className="inline-flex items-center gap-2 rounded-lg bg-white px-[18px] py-2.5 text-sm font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50">
              View Employees <ArrowIcon className="h-4 w-4" />
            </Link>
        </div>

        {now && (
          <div className="absolute right-6 top-[22px] z-10 hidden min-w-[220px] rounded-xl border border-white/20 bg-white/10 px-5 py-3.5 text-right backdrop-blur-md md:block">
            <div className="flex items-center justify-end gap-2 text-[13px] font-medium text-blue-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
                <CalendarIcon className="h-[15px] w-[15px]" />
              </span>
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <p className="mb-0.5 mt-1 text-[28px] font-bold tracking-tight">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="flex items-center justify-end gap-1.5 text-xs text-blue-200">
              {greeting(now.getHours())}
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" fill="#f5b400" />
                <g stroke="#f5b400" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </g>
              </svg>
            </p>
          </div>
        )}
      </section>

      {/* ============ KPI cards ============ */}
      <section className="my-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={team ? 'Total Employees' : 'Leave Balance'}
          value={team ? (employeeCount === null ? '—' : employeeCount.toLocaleString('en-US')) : mine ? `${myBalance} days` : '—'}
          icon={UsersIcon}
          tone="blue"
          spark={{ d: 'M0 46 C18 40 28 50 46 40 S76 22 94 30 S112 14 120 16', stroke: '#3b82f6', fill: '#2563eb' }}
        />
        <Metric label={team ? 'On Leave Today' : 'Next Leave'} value={team ? team.onLeave : mine?.nextLeave ? mine.nextLeave.from : 'None'} icon={CalendarCheckIcon} tone="green" spark={{ d: 'M0 52 C20 46 34 50 50 40 S80 30 96 32 S110 18 120 12', stroke: '#34c77a', fill: '#16a34a' }} />
        <Metric label={team ? 'Attendance Rate' : 'My Day'} value={team ? (allOff ? 'Off today' : pct === null ? '—' : `${pct}%`) : mine?.attendance ? mine.attendance.statusName : 'Not marked'} icon={ClockIcon} tone="indigo" spark={{ d: 'M0 52 C20 50 34 44 52 40 S84 36 98 26 S112 12 120 8', stroke: '#a078f0', fill: '#4f46e5' }} />
        <Metric label={team ? 'Pending Approvals' : 'Pending Requests'} value={team ? team.leaveWaiting + team.correctionsWaiting + team.attendanceToApprove : mine?.pendingLeave ?? 0} icon={DocIcon} tone="orange" spark={{ d: 'M0 14 C20 20 34 26 52 26 S84 34 98 40 S112 44 120 48', stroke: '#ffab5a', fill: '#ea580c' }} />
      </section>

      {/* ============ Overview + quick actions ============ */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel
          title={charts ? 'Employee Overview' : 'My Leave Balances'}
          icon={ChartIcon}
          right={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 shadow-sm">
                Last 6 Months <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </span>
            </div>
          }
        >
          {!charts ? (
            <div className="grid h-[250px] content-start gap-3 overflow-y-auto">
              {mine && mine.balances.length === 0 && <p className="text-sm text-gray-500">No leave balance yet.</p>}
              {mine?.balances.map((b) => (
                <div key={b.leaveTypeId} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700">
                  <span>{b.name}</span>
                  <b className="text-gray-900">{fmtDays(b.balance)} days</b>
                </div>
              ))}
            </div>
          ) : (
          <svg className="block h-[250px] w-full" viewBox="0 0 720 205" preserveAspectRatio="none" role="img" aria-label="Employee headcount over the last six months">
            <defs>
              <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#2563eb" stopOpacity=".24" />
                <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="#e5e7eb" strokeWidth="1"><path d="M55 20H700M55 58H700M55 96H700M55 134H700M55 172H700" /></g>
            <g fill="#6b7280" fontSize="11">
              {[0, 1, 2, 3, 4].map((k) => (
                <text key={k} x="30" y={175 - k * 38} textAnchor="end">{(k * step).toLocaleString('en-US')}</text>
              ))}
              {counts.map((c, i) => (
                <text key={c.month} x={px(i)} y="190" textAnchor="middle">{monthName(c.month)}</text>
              ))}
            </g>
            <path d={`${linePath} L${px(counts.length - 1)} 172 L${px(0)} 172Z`} fill="url(#area)" />
            <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="3" />
            <g fill="#fff" stroke="#2563eb" strokeWidth="3">
              {counts.slice(0, -1).map((c, i) => <circle key={c.month} cx={px(i)} cy={py(c.count)} r="4" />)}
            </g>
            <line x1="700" y1={py(counts[counts.length - 1].count)} x2="700" y2="172" stroke="#2563eb" strokeOpacity=".25" strokeDasharray="4 4" />
            <circle cx="700" cy={py(counts[counts.length - 1].count)} r="6" fill="#fff" stroke="#2563eb" strokeWidth="3" />
            <rect x="658" y="0" width="58" height="24" rx="10" fill="#2563eb" />
            <text x="687" y="16" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">{counts[counts.length - 1].count.toLocaleString('en-US')}</text>
          </svg>
          )}
        </Panel>

        <Panel title="Quick Actions" icon={BoltIcon}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quick.map((q) => {
              const Icon = q.icon;
              const body = (
                <>
                  <Icon className={`h-6 w-6 ${q.orange ? 'text-orange-600' : 'text-blue-600'}`} />
                  <span>{q.label}</span>
                </>
              );
              const cls = 'flex h-[104px] flex-col items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-center text-[13px] font-medium text-gray-700 shadow-sm transition hover:border-blue-300 hover:text-gray-900 hover:shadow-md';
              return q.href ? (
                <Link key={q.label} href={q.href} className={cls}>
                  {body}
                </Link>
              ) : (
                <button key={q.label} type="button" className={cls} onClick={soon(q.soonLabel ?? q.label)}>
                  {body}
                </button>
              );
            })}
          </div>
        </Panel>
      </section>

      {/* ============ Bottom row ============ */}
      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        <Panel title="Recent Activities" icon={ClockIcon}>
          {activity.length === 0 && <p className="py-3 text-sm text-gray-500">Nothing new. Leave decisions, approvals and reminders appear here.</p>}
          {activity.slice(0, 4).map((a) => (
            <Link key={a.id} href={a.href} className="flex items-center gap-3 border-b border-gray-100 py-3 text-sm text-gray-700 last:border-b-0 hover:text-gray-900">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${(kindStyle[a.kind] ?? kindStyle.LEAVE_UPCOMING).tone}`}>{(kindStyle[a.kind] ?? kindStyle.LEAVE_UPCOMING).icon}</span>
              <span className="min-w-0 flex-1">{a.title}</span>
              <time className="whitespace-nowrap text-xs text-gray-500">{ago(a.at)}</time>
            </Link>
          ))}
        </Panel>

        <Panel title={charts ? 'Department Distribution' : 'My Day'} icon={PieIcon}>
          {!charts ? (
            <div className="grid gap-3 py-1 text-sm text-gray-700">
              {[['Status', mine?.attendance ? mine.attendance.statusName : 'Not marked yet'], ['In', mine?.attendance?.firstInAt ? new Date(mine.attendance.firstInAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'], ['Out', mine?.attendance?.lastOutAt ? new Date(mine.attendance.lastOutAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'], ['Late', mine?.attendance ? `${mine.attendance.lateMinutes} min` : '—']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-b-0"><span>{k}</span><b className="text-gray-900">{v}</b></div>
              ))}
            </div>
          ) : (
          <div className="flex items-center justify-between gap-3.5 py-1">
            <svg className="h-[150px] w-[150px] shrink-0 text-gray-900" viewBox="0 0 160 160" role="img" aria-label="Department distribution">
              <g transform="rotate(-90 80 80)" fill="none" strokeWidth="20">
                {deptTotal === 0 && <circle cx="80" cy="80" r="66" stroke="#e5e7eb" />}
                {arcs.map((a) => (
                  <circle key={a.name} cx="80" cy="80" r="66" stroke={a.color} strokeDasharray={`${a.len} ${CIRC}`} strokeDashoffset={a.offset} />
                ))}
              </g>
              <text x="80" y="78" textAnchor="middle" fontSize="22" fontWeight="800" fill="currentColor">{deptTotal.toLocaleString('en-US')}</text>
              <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#6b7280">Total</text>
            </svg>
            <div className="grid min-w-[110px] flex-1 gap-3 text-[13px] text-gray-700">
              {arcs.length === 0 && <span className="text-gray-500">No employees yet</span>}
              {arcs.map((a) => (
                <div key={a.name} className="flex items-center gap-2">
                  <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
                  {a.name}
                  <b className="ml-auto font-semibold text-gray-900">{a.pct}%</b>
                </div>
              ))}
            </div>
          </div>
          )}
        </Panel>

        <Panel
          title="System Status"
          className="lg:col-span-2 xl:col-span-1"
          right={
            <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${allOk ? 'border-green-200 bg-green-50 text-green-700' : apiHealth === 'checking' || dbHealth === 'checking' ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {allOk ? 'All Systems Operational' : apiHealth === 'checking' || dbHealth === 'checking' ? 'Checking…' : 'Service issue'}
            </span>
          }
        >
          {statusRows.map((r) => {
            const pill =
              r.state === 'ok' ? <span className="ml-auto rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Healthy</span>
              : r.state === 'down' ? <span className="ml-auto rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Unavailable</span>
              : r.state === 'checking' ? <span className="ml-auto rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-500">Checking…</span>
              : <span className="ml-auto rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-500">Not enabled</span>;
            return (
              <div key={r.label} className="flex items-center gap-3 border-b border-gray-100 py-3 text-sm text-gray-700 last:border-b-0">
                <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${r.state === 'ok' ? 'bg-green-50 text-green-600' : r.state === 'down' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span className="flex-1">{r.label}</span>
                {pill}
              </div>
            );
          })}
        </Panel>
      </section>
    </div>
  );
}
