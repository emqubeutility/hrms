import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import BrandingPanel from '../components/settings/BrandingPanel';
import AttendanceConfigPanel from '../components/settings/AttendanceConfigPanel';
import LeaveConfigPanel from '../components/settings/LeaveConfigPanel';
import { CountryItem, EmailStatus, SystemConfigurationItem, createCountry, getEmailStatus, sendTestEmail, getCountries, getSystemConfigurations, updateCountry, updateSystemConfiguration } from '../lib/api';
import Select from '../components/Select';

// Default Country now lives in the Countries tab; time and number format in the Branding tab.
// Security Configuration (§I) as 33-35.
const SECURITY_IDS = new Set([33, 34, 35]);
// Company details (name, licence, registration, contact) are ids 36-46.
const COMPANY_IDS = new Set([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
const WIDE = new Set(['Company Address']);
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);

/** Settings with a fixed list of valid values are shown as a dropdown. */
const CHOICES: Record<string, { value: string; label: string }[]> = {
  'Default Time Format': [
    { value: '12', label: '12-hour (3:30 PM)' },
    { value: '24', label: '24-hour (15:30)' },
  ],
};
const NUMERIC = new Set(['Max Failed Login Attempts', 'Account Lockout Minutes', 'Session Timeout Minutes']);

const inputClass = 'mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

export default function SystemSettingsPage() {
  const { isAuthenticated, user } = useAuth();
  const [items, setItems] = useState<SystemConfigurationItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  type Tab = 'company' | 'countries' | 'branding' | 'attendance' | 'leave' | 'security';
  const TABS: [Tab, string][] = [['company', 'Company'], ['countries', 'Countries'], ['branding', 'Branding'], ['attendance', 'Attendance configuration'], ['leave', 'Leave configuration'], ['security', 'Security']];
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>('company');
  // The tab is kept in the address (?tab=branding) so it can be linked to and survives a refresh.
  useEffect(() => {
    const q = router.query.tab;
    if (typeof q === 'string' && TABS.some(([k]) => k === q)) setTabState(q as Tab);
  }, [router.query.tab]);
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace({ pathname: router.pathname, query: { tab: t } }, undefined, { shallow: true });
  };
  const [countries, setCountries] = useState<CountryItem[]>([]);

  const isSystemAdmin = user?.userTypeId === 3;

  const load = async () => {
    setLoading(true);
    try {
      const [res, cs] = await Promise.all([getSystemConfigurations(), getCountries()]);
      setCountries(cs.data);
      setItems(res.data);
      setDrafts(Object.fromEntries(res.data.map((i) => [i.id, i.value ?? ''])));
    } catch (err: any) {
      setError(err.message || 'Failed to load system configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isSystemAdmin) load();
    else if (isAuthenticated) setLoading(false);
  }, [isAuthenticated, isSystemAdmin]);

  const shown = tab === 'countries' || tab === 'branding' || tab === 'attendance' || tab === 'leave' ? [] : items.filter((i) => (tab === 'company' ? COMPANY_IDS : SECURITY_IDS).has(i.id));
  const changed = shown.filter((i) => (drafts[i.id] ?? '') !== (i.value ?? ''));

  /** One Save for the whole tab: only the settings that changed are sent. */
  const saveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    for (const i of changed) {
      if (NUMERIC.has(i.name) && !/^\d+$/.test((drafts[i.id] ?? '').trim())) {
        setError(`"${i.name}" must be a whole number.`);
        return;
      }
    }
    setSaving(true);
    const done: string[] = [];
    try {
      for (const i of changed) {
        await updateSystemConfiguration(i.id, { value: (drafts[i.id] ?? '').trim() });
        done.push(i.name);
      }
    } catch (err: any) {
      const failed = changed[done.length]?.name;
      setError(`${failed ? `"${failed}": ` : ''}${err.message || 'Could not save'}${done.length ? ` (already saved: ${done.join(', ')})` : ''}`);
    } finally {
      setSaving(false);
      await load();
    }
  };

  if (!isAuthenticated) return null;
  if (!isSystemAdmin) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
        Only System Admin can manage system settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">System settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Only System Admin can change these. Every change is recorded in the audit log.
        </p>
      </div>

      {message && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Side tabs: one list down the left, the chosen tab's content on the right. */}
        <nav aria-label="System settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setMessage(''); setError(''); setDrafts(Object.fromEntries(items.map((i) => [i.id, i.value ?? '']))); }}
              aria-current={tab === key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${tab === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-6">

      {tab === 'security' && !loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p className="font-medium text-gray-700">Password policy (fixed, not editable here)</p>
          <p className="mt-1">At least 8 characters, with upper, lower, digit and special characters. Multi-factor authentication is not yet implemented.</p>
        </div>
      )}

      {tab === 'security' && !loading && <EmailTest />}

      {tab === 'branding' ? (
        <BrandingPanel />
      ) : tab === 'attendance' ? (
        <AttendanceConfigPanel />
      ) : tab === 'leave' ? (
        <LeaveConfigPanel />
      ) : tab === 'countries' ? (
        <CountryList countries={countries} defaultCountry={items.find((i) => i.name === 'Default Country') ?? null} onChanged={load} onMessage={setMessage} onError={setError} />
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <form onSubmit={saveAll} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            {shown.map((item) => {
              const choices = item.name === 'Default Country' ? countries.filter((c) => c.isActive).map((c) => ({ value: c.isoCode, label: `${c.name} (${c.isoCode})` })) : CHOICES[item.name];
              const value = drafts[item.id] ?? '';
              const set = (v: string) => setDrafts((d) => ({ ...d, [item.id]: v }));
              return (
                <label key={item.id} className={`block text-sm font-medium text-gray-700 ${WIDE.has(item.name) ? 'md:col-span-2' : ''}`}>
                  {item.name}
                  {choices ? (
                    <Select className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
                      {!choices.some((c) => c.value === value) && <option value={value}>{value || 'Select…'}</option>}
                      {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </Select>
                  ) : WIDE.has(item.name) ? (
                    <textarea className={inputClass} rows={3} maxLength={500} value={value} onChange={(e) => set(e.target.value)} />
                  ) : (
                    <input className={inputClass} type={item.valueKind === 'date' ? 'date' : 'text'} inputMode={NUMERIC.has(item.name) ? 'numeric' : undefined} value={value} onChange={(e) => set(e.target.value)} />
                  )}
                  {item.valueKind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) && daysUntil(value) <= 60 && (
                    <span className={`mt-1 block text-xs font-semibold ${daysUntil(value) < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {daysUntil(value) < 0 ? `Expired ${-daysUntil(value)} day${daysUntil(value) === -1 ? '' : 's'} ago` : `Expires in ${daysUntil(value)} day${daysUntil(value) === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {item.description && <span className="mt-1 block text-xs font-normal text-gray-500">{item.description}</span>}
                </label>
              );
            })}
            {shown.length === 0 && <p className="text-sm text-gray-500">No settings in this section.</p>}
          </div>
          {shown.length > 0 && (
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              {changed.length > 0 && <span className="mr-auto text-xs text-gray-500">{changed.length} unsaved change{changed.length === 1 ? '' : 's'}</span>}
              <button
                type="button"
                disabled={saving || changed.length === 0}
                onClick={() => setDrafts(Object.fromEntries(items.map((i) => [i.id, i.value ?? ''])))}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={saving || changed.length === 0}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </form>
      )}
        </div>
      </div>
    </div>
  );
}

const blank = { isoCode: '', name: '', currencyCode: '', defaultTimezone: '', defaultLanguage: 'en', dateFormat: 'DD/MM/YYYY' };

/** The list of countries the company works with. Default Country, attendance and policies pick from it. */
function CountryList({ countries, defaultCountry, onChanged, onMessage, onError }: { countries: CountryItem[]; defaultCountry: SystemConfigurationItem | null; onChanged: () => void; onMessage: (t: string) => void; onError: (t: string) => void }) {
  const [form, setForm] = useState(blank);
  const field = (key: keyof typeof blank, label: string, placeholder: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input className={inputClass} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} required {...extra} />
    </label>
  );
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    onMessage('');
    try {
      const created = await createCountry({
        isoCode: form.isoCode.trim().toUpperCase(),
        name: form.name.trim(),
        currencyCode: form.currencyCode.trim().toUpperCase(),
        defaultTimezone: form.defaultTimezone.trim(),
        defaultLanguage: form.defaultLanguage.trim(),
        dateFormat: form.dateFormat.trim(),
      });
      onMessage(created.data.name + ' added.');
      setForm(blank);
      onChanged();
    } catch (err: any) {
      onError(err.message || 'Could not add the country');
    }
  };
  /** The company country: new employees start with it, and attendance falls back to its timezone. */
  const makeDefault = async (c: CountryItem) => {
    if (!defaultCountry) return;
    onError('');
    onMessage('');
    try {
      await updateSystemConfiguration(defaultCountry.id, { value: c.isoCode });
      onMessage(c.name + ' is now the default country.');
      onChanged();
    } catch (err: any) {
      onError(err.message || 'Could not set the default country');
    }
  };
  const toggle = async (c: CountryItem) => {
    onError('');
    try {
      await updateCountry(c.id, { isActive: !c.isActive });
      onChanged();
    } catch (err: any) {
      onError(err.message || 'Could not update the country');
    }
  };
  return (
    <div className="space-y-5">
      <form onSubmit={add} className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
        {field('isoCode', 'ISO code', 'AE', { maxLength: 2 })}
        <div className="sm:col-span-2">{field('name', 'Name', 'United Arab Emirates')}</div>
        {field('currencyCode', 'Currency code', 'AED', { maxLength: 3 })}
        {field('defaultTimezone', 'Default timezone', 'Asia/Dubai')}
        {field('defaultLanguage', 'Default language', 'en')}
        {field('dateFormat', 'Date format', 'DD/MM/YYYY')}
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Add country</button>
        </div>
      </form>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-3">ISO</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Timezone</th><th className="px-4 py-3">Language</th><th className="px-4 py-3">Date format</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Default</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {countries.map((c) => (
                <tr key={c.id} className={c.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.isoCode}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">{c.currencyCode}</td>
                  <td className="px-4 py-3">{c.defaultTimezone}</td>
                  <td className="px-4 py-3">{c.defaultLanguage}</td>
                  <td className="px-4 py-3">{c.dateFormat}</td>
                  <td className="px-4 py-3"><span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3">{defaultCountry?.value === c.isoCode ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Default</span> : c.isActive ? <button type="button" onClick={() => makeDefault(c)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Make default</button> : null}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => toggle(c)} className="text-sm font-medium text-blue-600 hover:text-blue-800">{c.isActive ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
              {countries.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">No countries yet. Add your company's country first, then mark it as the default.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Is email set up, and does it really arrive? Sends one test message and says where it went. */
function EmailTest() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getEmailStatus().then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await sendTestEmail(to.trim());
      setResult({ ok: true, text: r.data.redirected ? `Sent. Because this is a development copy, it was delivered to ${r.data.deliveredTo} (not ${r.data.requestedFor}). Check that inbox, and the junk folder.` : `Sent to ${r.data.deliveredTo}. Check that inbox, and the junk folder.` });
    } catch (err: any) {
      setResult({ ok: false, text: err.message || 'Could not send' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Email</h3>
      {status && (
        <p className="mt-1 text-sm text-gray-600">
          {status.configured ? <>Mail server <b>{status.host}:{status.port}</b>, sent from <b>{status.from}</b>.</> : <span className="text-amber-700">No mail server is set up (SMTP_HOST is empty), so messages are only written to the server log.</span>}
          {' '}Environment: <b>{status.environment}</b>.
          {status.redirectedTo && <> All email is redirected to <b>{status.redirectedTo}</b>.</>}
        </p>
      )}
      <form onSubmit={send} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">Send a test email to
          <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className={inputClass + ' w-72'} />
        </label>
        <button type="submit" disabled={busy || !to.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? 'Sending…' : 'Send test email'}</button>
      </form>
      {result && <p className={`mt-3 rounded-lg px-3.5 py-2.5 text-sm ${result.ok ? 'border border-green-200 bg-green-50 text-green-800' : 'border border-red-200 bg-red-50 text-red-700'}`}>{result.text}</p>}
    </section>
  );
}
