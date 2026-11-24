import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Parameter, createParameter, deleteMaster, getParameterTypes, listParameters, updateParameter } from '../lib/api';
import Select from './Select';

type Row = Parameter & { displayOrder?: number; isVisible?: boolean };

const blank = { text: '', code: '' };

/** Dropdown options (departments, employee types, reasons, …) kept in the parameter tables. */
export default function ParametersPanel() {
  const { isAuthenticated } = useAuth();
  const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const type = types.find((t) => t.id === typeId);
  const isEmployeeType = type?.name === 'Employee Type';

  useEffect(() => {
    if (!isAuthenticated) return;
    getParameterTypes()
      .then((r) => {
        setTypes(r.data);
        const pre = r.data.find((t) => t.name === 'Employee Type') ?? r.data[0];
        if (pre) setTypeId(pre.id);
      })
      .catch((e) => setError(e.message || 'Could not load parameter types'));
  }, [isAuthenticated]);

  const load = async (id: number) => {
    setLoading(true);
    try {
      setRows((await listParameters(id)).data as Row[]);
    } catch (e: any) {
      setError(e.message || 'Could not load options');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeId !== null) load(typeId);
  }, [typeId]);

  const startNew = () => {
    setForm(blank);
    setEditing('new');
    setError('');
    setNotice('');
  };
  const startEdit = (r: Row) => {
    setForm({ text: r.text, code: r.code ?? '' });
    setEditing(r.id);
    setError('');
    setNotice('');
  };

  const save = async () => {
    if (!form.text.trim()) {
      setError('Name is required');
      return;
    }
    if (isEmployeeType && !form.code.trim()) {
      setError('Employee types need a code: it prefixes the generated employee codes');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') await createParameter({ parameterTypeId: typeId!, text: form.text.trim(), code: form.code.trim() });
      else await updateParameter(editing as number, { text: form.text.trim(), code: form.code.trim() });
      setEditing(null);
      await load(typeId!);
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete "${r.text}" permanently? This cannot be undone. If it is in use you will be told to hide it instead.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteMaster('parameters', r.id);
      await load(typeId!);
    } catch (e: any) {
      setError(e.message || 'Could not delete');
    }
  };

  const toggle = async (r: Row) => {
    setError('');
    setNotice('');
    try {
      await updateParameter(r.id, { isVisible: !(r.isVisible ?? true) });
      await load(typeId!);
    } catch (e: any) {
      setError(e.message || 'Could not update');
    }
  };

  const field =
    'mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Parameters</h2>
          <p className="mt-1 text-gray-500">Options behind dropdowns across the app, such as departments, employee types and notice reasons.</p>
        </div>
        <button type="button" onClick={startNew} disabled={typeId === null} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
          + Add option
        </button>
      </div>

      <label className="block max-w-xs text-sm font-medium text-gray-700">
        Parameter type
        <Select className={field} value={typeId ?? ''} onChange={(e) => { setTypeId(Number(e.target.value)); setNotice(''); setError(''); }}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </label>

      {isEmployeeType && (
        <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          The code of an employee type is the prefix for new employee codes: a type with code <span className="font-mono">PRM</span> gives <span className="font-mono">PRM-0001</span>, <span className="font-mono">PRM-0002</span> and so on.
        </p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No options yet.</td></tr>
            ) : (
              rows.map((r) => {
                const visible = r.isVisible ?? true;
                return (
                  <tr key={r.id} className={!visible ? 'bg-gray-50/60' : undefined}>
                    <td className={`px-4 py-3 font-medium ${visible ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{r.text}</td>
                    <td className="px-4 py-3 font-mono text-[13px] text-gray-700">
                      {r.code || (isEmployeeType ? <span className="font-sans text-amber-700">Set a code</span> : '—')}
                    </td>
                    <td className="px-4 py-3">
                      {visible ? (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Shown</span>
                      ) : (
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(r)} className="mr-4 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                      <button type="button" onClick={() => toggle(r)} className={`text-xs font-medium ${visible ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                        {visible ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" onClick={() => remove(r)} className="ml-4 text-xs font-medium text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h4 className="text-base font-semibold text-gray-900">{editing === 'new' ? `New ${type?.name ?? 'option'}` : `Edit ${type?.name ?? 'option'}`}</h4>
              <button type="button" onClick={() => setEditing(null)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">✕</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
              <label className="block text-sm font-medium text-gray-700">
                Name
                <input className={field} maxLength={100} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} autoFocus />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Code{isEmployeeType && <span className="text-red-500"> *</span>}
                <input className={`${field} font-mono uppercase`} maxLength={10} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                {isEmployeeType && <span className="mt-1 block text-xs text-gray-500">Letters or numbers, up to 10. Used as the prefix of employee codes, e.g. PRM-0001.</span>}
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
