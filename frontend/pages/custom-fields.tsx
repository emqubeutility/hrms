import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { CountryItem, CustomFieldAdmin, createCustomField, getCountries, deleteCustomField, getCustomFieldDefinitions, updateCustomField } from '../lib/api';
import Select from '../components/Select';

const TABS = [
  ['personal', 'Personal'],
  ['employment', 'Employment'],
  ['organization', 'Organization'],
  ['attendance', 'Attendance & Leave'],
  ['compensation', 'Compensation & Payroll'],
  ['bank', 'Bank & Statutory'],
  ['documents', 'Documents'],
  ['education', 'Education & Experience'],
  ['access', 'System Access'],
  ['airfare', 'AirFare'],
];
const TYPES = ['Text', 'Textarea', 'Number', 'Decimal', 'Date', 'Dropdown', 'Multi-select', 'Radio', 'Checkbox', 'Email', 'Phone', 'URL', 'Yes/No'];
const OPTIONS_REQUIRED = ['Dropdown', 'Multi-select', 'Radio'];

const blank = { label: '', tabKey: 'personal', sectionName: '', fieldType: 'Text', options: '', countryCode: 'ALL', isRequired: false, placeholder: '', helpText: '' };

export default function CustomFieldsPage() {
  const { isAuthenticated, user } = useAuth();
  // The countries added in System settings → Countries.
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [fields, setFields] = useState<CustomFieldAdmin[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isSystemAdmin = user?.userTypeId === 3;

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCustomFieldDefinitions();
      setFields(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isSystemAdmin) {
      load();
      getCountries().then((r) => setCountries(r.data)).catch(() => setCountries([]));
    }
    else if (isAuthenticated) setLoading(false);
  }, [isAuthenticated, isSystemAdmin]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const options = OPTIONS_REQUIRED.includes(form.fieldType) ? form.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const created = await createCustomField({
        label: form.label,
        tabKey: form.tabKey,
        sectionName: form.sectionName,
        fieldType: form.fieldType,
        options,
        countryCode: form.countryCode,
        isRequired: form.isRequired,
        placeholder: form.placeholder || undefined,
        helpText: form.helpText || undefined,
      });
      setMessage(`Custom field ${created.data.code} added. It now appears on the employee profile.`);
      setForm(blank);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not add the field');
    }
  };

  const remove = async (f: CustomFieldAdmin) => {
    if (!window.confirm(`Delete the custom field "${f.label}"? This cannot be undone. If employees already have a value in it you will be told to deactivate it instead.`)) return;
    setError('');
    try {
      await deleteCustomField(f.code);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not delete the field');
    }
  };

  const toggle = async (f: CustomFieldAdmin) => {
    setError('');
    try {
      await updateCustomField(f.code, { isActive: !f.isActive });
      load();
    } catch (err: any) {
      setError(err.message || 'Could not update the field');
    }
  };

  if (!isAuthenticated) return null;
  if (!isSystemAdmin) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
        Only System Admin can manage custom fields.
      </div>
    );
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Custom fields</h2>
        <p className="mt-1 text-sm text-gray-500">
          Only System Admin can create, change or deactivate custom fields. Codes are fixed once created. Deactivated fields keep their saved values.
        </p>
      </div>

      {message && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Tab</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Options</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
              {!loading && fields.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-500">No custom fields yet.</td></tr>}
              {fields.map((f) => (
                <tr key={f.code}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{f.code}</td>
                  <td className="px-4 py-3 text-gray-900">{f.label}</td>
                  <td className="px-4 py-3 text-gray-700">{TABS.find((t) => t[0] === f.tabKey)?.[1] ?? f.tabKey}</td>
                  <td className="px-4 py-3 text-gray-700">{f.sectionName}</td>
                  <td className="px-4 py-3 text-gray-700">{f.fieldType}</td>
                  <td className="px-4 py-3 text-gray-700">{f.options.length ? f.options.join(', ') : '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{f.countryCode}</td>
                  <td className="px-4 py-3 text-gray-700">{f.isRequired ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${f.isActive ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                      {f.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => toggle(f)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                      {f.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => remove(f)} className="ml-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Add custom field</h3>
        <form onSubmit={add} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Label<span className="text-red-600">*</span></label>
            <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required minLength={2} placeholder="e.g. Blood donor" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Profile tab</label>
            <Select className={inputClass} value={form.tabKey} onChange={(e) => setForm({ ...form, tabKey: e.target.value })}>
              {TABS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Section name</label>
            <input className={inputClass} value={form.sectionName} onChange={(e) => setForm({ ...form, sectionName: e.target.value })} required minLength={2} placeholder="e.g. Additional personal details" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Field type</label>
            <Select className={inputClass} value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          {OPTIONS_REQUIRED.includes(form.fieldType) && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Options</label>
              <input className={inputClass} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Comma separated, e.g. XS, S, M, L" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Placeholder</label>
            <input className={inputClass} value={form.placeholder} onChange={(e) => setForm({ ...form, placeholder: e.target.value })} placeholder="Shown in the empty field" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Applies to</label>
            <Select className={inputClass} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}>
              <option value="ALL">All countries</option>
              {countries.filter((c) => c.isActive || c.isoCode === form.countryCode).map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Required</label>
            <Select className={inputClass} value={form.isRequired ? 'Yes' : 'No'} onChange={(e) => setForm({ ...form, isRequired: e.target.value === 'Yes' })}>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Help text</label>
            <input className={inputClass} value={form.helpText} onChange={(e) => setForm({ ...form, helpText: e.target.value })} placeholder="Shown under the field" />
          </div>
          <div className="flex items-end justify-end md:col-span-2 xl:col-span-3">
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Add custom field</button>
          </div>
        </form>
      </section>
    </div>
  );
}
