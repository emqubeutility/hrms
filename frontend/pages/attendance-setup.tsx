import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import WorkSchedulesPanel from '../components/attendance/WorkSchedulesPanel';
import WeeklyOffPanel from '../components/attendance/WeeklyOffPanel';
import HolidayCalendarsPanel from '../components/attendance/HolidayCalendarsPanel';
import RostersPanel from '../components/attendance/RostersPanel';
import AssignmentsPanel from '../components/attendance/AssignmentsPanel';
import ShiftsPanel from '../components/attendance/ShiftsPanel';
import OvertimePanel from '../components/attendance/OvertimePanel';

type Tab = 'shifts' | 'schedules' | 'weeklyoff' | 'holidays' | 'roster' | 'assignments' | 'overtime';

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'shifts', label: 'Shifts', hint: 'Work shifts with timing and grace rules' },
  { key: 'schedules', label: 'Work schedules', hint: 'Required hours, fixed or flexible start, breaks' },
  { key: 'weeklyoff', label: 'Weekly off', hint: 'Templates of weekly off days' },
  { key: 'holidays', label: 'Holiday calendars', hint: 'Holidays by company, country or branch, and their order' },
  { key: 'roster', label: 'Roster', hint: 'Repeating shift patterns and Excel import' },
  { key: 'assignments', label: 'Assignments', hint: 'Give employees a schedule, roster and calendar' },
  { key: 'overtime', label: 'Overtime', hint: 'OT rules to assign to employees' },
];

/** Administration > Attendance setup: everything attendance reads from, in one place. */
export default function AttendanceSetupPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('shifts');

  // Deep links arrive as ?tab=…
  useEffect(() => {
    const q = router.query.tab;
    if (TABS.some((t) => t.key === q)) setTab(q as Tab);
  }, [router.query.tab]);

  const choose = (t: Tab) => {
    setTab(t);
    router.replace({ pathname: '/attendance-setup', query: { tab: t } }, undefined, { shallow: true });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Attendance setup</h2>
        <p className="mt-1 text-gray-500">Shifts, work schedules, holidays, rosters and who they apply to. Branches are managed under Masters.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => choose(t.key)}
            title={t.hint}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shifts' && <ShiftsPanel />}
      {tab === 'schedules' && <WorkSchedulesPanel />}
      {tab === 'weeklyoff' && <WeeklyOffPanel />}
      {tab === 'holidays' && <HolidayCalendarsPanel />}
      {tab === 'roster' && <RostersPanel />}
      {tab === 'assignments' && <AssignmentsPanel />}
      {tab === 'overtime' && <OvertimePanel />}
    </div>
  );
}
