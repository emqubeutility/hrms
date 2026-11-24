import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { CountryItem, SalaryTemplate, createSalaryTemplate, getCountries, getSalaryTemplates, updateSalaryTemplate } from '../lib/api';
import Select from '../components/Select';


type Row = { label: string; code?: string };
type Form = { id?: number; name: string; countryCode: string; components: Row[] };
const blank = (): Form => ({ name: '', countryCode: 'ALL', components: [{ label: 'Basic' }, { label: 'HRA' }] });

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

/**
 * Salary templates (D-024): HR Admin and System Admin define the monthly salary components;
 * on the employee profile HR picks a template and fills in an amount per component.
 */
export default function SalaryTemplatesPage() {
  const { isAuthenticated, user } = useAuth();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  // The countries added in System settings → Countries.
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const countryName = (code: string) => (code === 'ALL' ? 'All countries' : countries.find((c) => c.isoCode === code)?.name ?? code);
  const [form, setForm] = useState<Form>(blank());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const allowed = user?.userTypeId === 3 || user?.userTypeId === 4;

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSalaryTemplates();
      setTemplates(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load salary templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && allowed) {
      load();
      getCountries().then((r) => setCountries(r.data)).catch(() => setCountries([]));
    } else if (isAuthenticated) setLoading(false);
  }, [isAuthenticated, allowed]);

  const setRow = (i: number, label: string) =>
    setForm((f) => ({ ...f, components: f.components.map((r, j) => (j === i ? { ...r, label } : r)) }));
  const removeRow = (i: number) => setForm((f) => ({ ...f, components: f.components.filter((_, j) => j !== i) }));
  const moveRow = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const next = [...f.components];
      const j = i + dir;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, components: next };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const components = form.components
      .map((r) => ({ label: r.label.trim(), ...(r.code ? { code: r.code } : {}) }))
      .filter((r) => r.label);
    if (!components.length) {
      setError('Add at least one component.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), countryCode: form.countryCode, components };
      if (form.id) {
        await updateSalaryTemplate(form.id, payload);
      } else {
        await createSalaryTemplate(payload);
      }
      setForm(blank());
      load();
    } catch (err: any) {
      const details = (err.errors ?? []).map((x: any) => x.message).filter(Boolean);
      setError([err.message || 'Could not save the template', ...details].join(' — '));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: SalaryTemplate) => {
    setError('');
    setMessage('');
    try {
      await updateSalaryTemplate(t.id, { isActive: !t.isActive });
      load();
    } catch (err: any) {
      setError(err.message || 'Could not update the template');
    }
  };

  const edit = (t: SalaryTemplate) => {
    setMessage('');
    setError('');
    setForm({ id: t.id, name: t.name, countryCode: t.countryCode, components: t.components.map((c) => ({ label: c.label, code: c.code })) });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isAuthenticated) return null;
  if (!allowed) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
        Salary templates are managed by HR Admin and System Admin.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Salary templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define the monthly salary components once. On an employee’s Compensation tab, choose a template and fill in the amounts.
        </p>
      </div>

      {message && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">{form.id ? 'Edit template' : 'New template'}</h2>
          {form.id && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">Editing #{form.id}</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tpl-name" className="mb-1.5 block text-xs font-medium text-gray-600">
              Template name<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input id="tpl-name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. India Staff Monthly" className={inputClass} />
          </div>
          <div>
            <label htmlFor="tpl-country" className="mb-1.5 block text-xs font-medium text-gray-600">Country</label>
            <Select id="tpl-country" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} className={inputClass}>
              <option value="ALL">All countries</option>
              {countries.filter((c) => c.isActive || c.isoCode === form.countryCode).map((c) => (
                <option key={c.isoCode} value={c.isoCode}>{c.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Components (monthly)</p>
          <div className="space-y-2">
            {form.components.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-gray-400">{i + 1}</span>
                <input
                  aria-label={`Component ${i + 1} name`}
                  value={r.label}
                  maxLength={60}
                  onChange={(e) => setRow(i, e.target.value)}
                  placeholder="e.g. Special allowance"
                  className={`${inputClass} max-w-md`}
                />
                {r.code && <span className="hidden font-mono text-xs text-gray-400 sm:inline">{r.code}</span>}
                <div className="ml-auto flex gap-1">
                  <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => moveRow(i, 1)} disabled={i === form.components.length - 1} aria-label="Move down" className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => removeRow(i)} disabled={form.components.length === 1} className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
                </div>
              </div>
            ))}
          </div>
          {form.components.length < 30 && (
            <button type="button" onClick={() => setForm({ ...form, components: [...form.components, { label: '' }] })} className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              + Add component
            </button>
          )}
          {form.id && <p className="mt-2 text-xs text-gray-400">Renaming a component keeps its code, so amounts already saved on employees stay linked.</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-5">
          {form.id && (
            <button type="button" onClick={() => setForm(blank())} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Cancel edit
            </button>
          )}
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : form.id ? 'Save template' : 'Create template'}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Templates</h2>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-gray-500">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No templates yet. Create the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Country</th>
                  <th className="px-6 py-3">Components</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <tr key={t.id} className={t.isActive ? '' : 'bg-gray-50/60'}>
                    <td className="px-6 py-3 font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 text-gray-600">{countryName(t.countryCode)}</td>
                    <td className="px-6 py-3">
                      <div className="flex max-w-xl flex-wrap gap-1.5">
                        {t.components.map((c) => (
                          <span key={c.code} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{c.label}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <button type="button" onClick={() => edit(t)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Edit</button>
                      <button type="button" onClick={() => toggle(t)} className="ml-4 text-sm font-medium text-gray-600 hover:text-gray-900">
                        {t.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
