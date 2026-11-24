import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { BranchOption, CountryItem, MasterItem, getBranches, getCountries, getSites } from '../../lib/api';
import {
  Holiday,
  HolidayCalendar,
  HolidayLevel,
  createHolidayCalendar,
  getHolidayCalendar,
  getHolidayCalendars,
  getHolidayOrder,
  importHolidays,
  removeHoliday,
  saveHoliday,
  updateHoliday,
  saveHolidayOrder,
  updateHolidayCalendar,
} from '../../lib/attendance-api';
import Drawer, { fieldClass } from '../Drawer';
import ExcelImport from '../ExcelImport';
import Select from '../Select';

const LEVEL_LABEL: Record<HolidayLevel, { name: string; hint: string }> = {
  EMPLOYEE: { name: 'Employee calendar', hint: 'A calendar assigned to the employee personally' },
  SITE: { name: 'Site calendar', hint: "The calendar of the employee's site" },
  BRANCH: { name: 'Branch calendar', hint: "The calendar of the employee's branch" },
  COUNTRY: { name: 'Country calendar', hint: "The calendar of the employee's country of employment" },
  COMPANY: { name: 'Company calendar', hint: 'The company-wide calendar' },
};
const scopeText = (c: HolidayCalendar, countries: CountryItem[]) => (c.scope === 'COMPANY' ? 'Company' : c.scope === 'COUNTRY' ? `Country · ${countries.find((x) => x.isoCode === c.countryCode)?.name ?? c.countryCode}` : c.scope === 'SITE' ? `Site · ${c.siteName ?? ''}` : `Branch · ${c.branchName ?? ''}`);

const blank = { name: '', scope: 'COMPANY', countryCode: '', branchId: '', siteId: '', isActive: true };

/** Holiday calendars by company, country or branch, plus the order in which they apply to an employee. */
export default function HolidayCalendarsPanel() {
  const { isAuthenticated } = useAuth();
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [sites, setSites] = useState<MasterItem[]>([]);
  const [order, setOrder] = useState<HolidayLevel[]>([]);
  const [savedOrder, setSavedOrder] = useState('');
  const [selected, setSelected] = useState<(HolidayCalendar & { holidays: Holiday[] }) | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [hol, setHol] = useState({ date: '', endDate: '', name: '', holidayType: 'PUBLIC' });
  /** The holiday being changed; null when adding a new one. */
  const [editingHol, setEditingHol] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCalendars = async () => {
    try {
      setCalendars((await getHolidayCalendars()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load holiday calendars');
    }
  };
  const open = async (id: number) => {
    setError('');
    try {
      setSelected((await getHolidayCalendar(id)).data);
    } catch (e: any) {
      setError(e.message || 'Could not open the calendar');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadCalendars();
    getBranches().then((r) => setBranches(r.data)).catch(() => {});
    getCountries().then((r) => setCountries(r.data)).catch(() => setCountries([]));
    getSites().then((r) => setSites(r.data)).catch(() => setSites([]));
    getHolidayOrder().then((r) => { setOrder(r.data); setSavedOrder(JSON.stringify(r.data)); }).catch(() => {});
  }, [isAuthenticated]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const saveOrder = async () => {
    setError('');
    try {
      const r = await saveHolidayOrder(order);
      setOrder(r.data);
      setSavedOrder(JSON.stringify(r.data));
    } catch (e: any) {
      setError(e.message || 'Could not save the order');
    }
  };

  const startNew = () => {
    setForm(blank);
    setEditing('new');
    setError('');
  };
  const startEdit = (c: HolidayCalendar) => {
    setForm({ name: c.name, scope: c.scope, countryCode: c.countryCode ?? '', branchId: c.branchId ? String(c.branchId) : '', siteId: c.siteId ? String(c.siteId) : '', isActive: c.isActive });
    setEditing(c.id);
    setError('');
  };
  const saveCalendar = async () => {
    if (!form.name.trim()) return setError('Name is required');
    if (form.scope === 'COUNTRY' && !form.countryCode) return setError('Choose a country');
    if (form.scope === 'SITE' && !form.siteId) return setError('Choose a site');
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name.trim(), scope: form.scope, countryCode: form.scope === 'COUNTRY' ? form.countryCode : undefined, branchId: form.scope === 'BRANCH' && form.branchId ? Number(form.branchId) : undefined, siteId: form.scope === 'SITE' && form.siteId ? Number(form.siteId) : undefined, isActive: form.isActive };
      if (editing === 'new') {
        const created = await createHolidayCalendar(payload);
        await open(created.data.id);
      } else {
        await updateHolidayCalendar(editing as number, payload);
        if (selected?.id === editing) await open(editing as number);
      }
      setEditing(null);
      await loadCalendars();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!selected) return;
    if (!hol.date || !hol.name.trim()) return setError('Date and name are required');
    if (hol.endDate && hol.endDate < hol.date) return setError('The end date cannot be before the date');
    setError('');
    try {
      const payload = { date: hol.date, endDate: hol.endDate || null, name: hol.name.trim(), holidayType: hol.holidayType };
      if (editingHol === null) await saveHoliday(selected.id, payload);
      else await updateHoliday(selected.id, editingHol, payload);
      setHol({ date: '', endDate: '', name: '', holidayType: 'PUBLIC' });
      setEditingHol(null);
      await open(selected.id);
      loadCalendars();
    } catch (e: any) {
      setError(e.message || 'Could not save the holiday');
    }
  };
  const startEditHoliday = (h: Holiday) => {
    setHol({ date: h.date, endDate: h.endDate && h.endDate !== h.date ? h.endDate : '', name: h.name, holidayType: h.holidayType });
    setEditingHol(h.id);
    setError('');
  };
  const cancelEditHoliday = () => {
    setHol({ date: '', endDate: '', name: '', holidayType: 'PUBLIC' });
    setEditingHol(null);
  };
  const delHoliday = async (h: Holiday) => {
    if (!selected || !window.confirm(`Remove ${h.name} (${h.date})?`)) return;
    try {
      await removeHoliday(selected.id, h.id);
      await open(selected.id);
      loadCalendars();
    } catch (e: any) {
      setError(e.message || 'Could not remove');
    }
  };

  const years = selected ? [...new Set([year, ...selected.holidays.map((h) => Number(h.date.slice(0, 4)))])].sort() : [year];
  const shown = selected ? selected.holidays.filter((h) => h.date.startsWith(String(year))) : [];
  const orderDirty = JSON.stringify(order) !== savedOrder;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Holiday calendars</h2>
          <p className="mt-1 text-gray-500">Public and company holidays by company, country or branch.</p>
        </div>
        <button type="button" onClick={startNew} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Add calendar</button>
      </div>

      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Which calendar applies to an employee</h3>
            <p className="mt-1 text-sm text-gray-500">The first level in this list that has a calendar for the employee is used. Move a level up or down to change the order.</p>
          </div>
          <button type="button" onClick={saveOrder} disabled={!orderDirty} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">Save order</button>
        </div>
        <ol className="mt-4 space-y-2">
          {order.map((level, i) => (
            <li key={level} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{LEVEL_LABEL[level].name}</p>
                <p className="text-xs text-gray-500">{LEVEL_LABEL[level].hint}</p>
              </div>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${LEVEL_LABEL[level].name} up`} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${LEVEL_LABEL[level].name} down`} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30">↓</button>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-4">
          {calendars.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">No calendars yet.</p>}
          {calendars.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} className={`block w-full rounded-xl border p-3 text-left shadow-sm ${selected?.id === c.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-medium ${c.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{c.name}</span>
                <span className="text-xs text-gray-500">{c.holidayCount} days</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{scopeText(c, countries)}</p>
            </button>
          ))}
        </div>

        <div className="space-y-5 lg:col-span-8">
          {!selected ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Choose a calendar to see and edit its holidays.</p>
          ) : (
            <>
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
                    <p className="text-xs text-gray-500">{scopeText(selected, countries)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </Select>
                    <button type="button" onClick={() => startEdit(selected)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Edit calendar</button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[9rem_9rem_1fr_9rem_auto_auto]">
                  <input type="date" aria-label="Date" className={`${fieldClass} !mt-0`} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value, endDate: hol.endDate && hol.endDate < e.target.value ? '' : hol.endDate })} />
                  <input type="date" aria-label="End date (optional)" title="End date (optional): for a holiday that lasts several days" className={`${fieldClass} !mt-0`} min={hol.date || undefined} value={hol.endDate} onChange={(e) => setHol({ ...hol, endDate: e.target.value })} />
                  <input aria-label="Holiday name" placeholder="Holiday name" className={`${fieldClass} !mt-0`} maxLength={120} value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
                  <Select aria-label="Type" className={`${fieldClass} !mt-0`} value={hol.holidayType} onChange={(e) => setHol({ ...hol, holidayType: e.target.value })}>
                    <option value="PUBLIC">Public</option><option value="COMPANY">Company</option><option value="OPTIONAL">Optional</option>
                  </Select>
                  <button type="button" onClick={addHoliday} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">{editingHol === null ? 'Add' : 'Save'}</button>
                  {editingHol !== null && <button type="button" onClick={cancelEditHoliday} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>}
                </div>

                <table className="mt-4 min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr><th className="py-2">Date (and end date)</th><th className="py-2">Holiday</th><th className="py-2">Type</th><th className="py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shown.length === 0 ? (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-500">No holidays in {year}.</td></tr>
                    ) : (
                      shown.map((h) => (
                        <tr key={h.id}>
                          <td className="py-2 font-mono text-[13px] text-gray-700">{h.date}{h.endDate && h.endDate !== h.date ? ` to ${h.endDate}` : ''}</td>
                          <td className="py-2 text-gray-900">{h.name}</td>
                          <td className="py-2 text-gray-600">{h.holidayType.charAt(0) + h.holidayType.slice(1).toLowerCase()}</td>
                          <td className="whitespace-nowrap py-2 text-right"><button type="button" onClick={() => startEditHoliday(h)} className="mr-3 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button><button type="button" onClick={() => delHoliday(h)} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </div>

      <ExcelImport
        title="Import holidays from Excel"
        help="Columns: Date (YYYY-MM-DD), Name, End date (optional, for a holiday that lasts several days), Applies to (Company, Country, Branch or Site) and Value (the country, branch or site name; leave empty for Company). Each row goes to the calendar for that company, country, branch or site, and a new calendar is created if there is none. If Applies to is empty, the row goes to the calendar chosen above. A date that already exists is updated; new holidays are added as public holidays."
        templatePath="/attendance/holiday-calendars/template"
        templateName="holidays-template.xlsx"
        run={(file, commit) => importHolidays(selected ? selected.id : null, file, commit)}
        onImported={() => { if (selected) open(selected.id); loadCalendars(); }}
        />

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? 'New holiday calendar' : 'Edit holiday calendar'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveCalendar} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-gray-700">Name
            <input className={fieldClass} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Applies to
            <Select className={fieldClass} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="COMPANY">The whole company</option>
              <option value="COUNTRY">A country</option>
              <option value="SITE">A site</option>
              <option value="BRANCH">A branch</option>
            </Select>
          </label>
          {form.scope === 'COUNTRY' && (
            <label className="block text-sm font-medium text-gray-700">Country
              <Select className={fieldClass} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}>
                <option value="">Select a country…</option>
                {countries.filter((c) => c.isActive || c.isoCode === form.countryCode).map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
              </Select>
            </label>
          )}
          {form.scope === 'SITE' && (
            <label className="block text-sm font-medium text-gray-700">Site
              <Select className={fieldClass} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">Select…</option>
                {sites.filter((x) => x.isActive || String(x.id) === form.siteId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </label>
          )}
          {form.scope === 'BRANCH' && (
            <label className="block text-sm font-medium text-gray-700">Branch
              <Select className={fieldClass} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">Select…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Active
          </label>
        </Drawer>
      )}
    </div>
  );
}
