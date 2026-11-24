import React, { useCallback, useEffect, useState } from 'react';
import {
  Dependant,
  createEmployeeDependant,
  deleteEmployeeDependant,
  getEmployeeDependants,
  getParameters,
  updateEmployeeDependant,
} from '../lib/api';
import Select from './Select';

type Opt = { id: number; text: string };

const emptyForm = { firstName: '', lastName: '', relationTypeId: '', genderId: '', dateOfBirth: '', contactNo: '', email: '' };

const field =
  'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

function fmt(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Family members / dependants of one employee. */
export default function EmployeeDependants({ employeeId, canEdit }: { employeeId: number; canEdit: boolean }) {
  const [items, setItems] = useState<Dependant[]>([]);
  const [relations, setRelations] = useState<Opt[]>([]);
  const [genders, setGenders] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, r, g] = await Promise.all([
        getEmployeeDependants(employeeId),
        getParameters('Dependant Relation'),
        getParameters('Gender'),
      ]);
      setItems(d.data);
      setRelations(r.data as Opt[]);
      setGenders(g.data as Opt[]);
    } catch (e: any) {
      setError(e.message || 'Could not load dependents');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const label = (list: Opt[], id?: number | null) => list.find((o) => o.id === id)?.text ?? '—';

  const startNew = () => {
    setForm(emptyForm);
    setEditing('new');
    setError('');
    setNotice('');
  };

  const startEdit = (d: Dependant) => {
    const p = d.dependantProfile;
    setForm({
      firstName: p.name ?? '',
      lastName: p.lastName ?? '',
      relationTypeId: d.relationTypeId ? String(d.relationTypeId) : '',
      genderId: p.genderId ? String(p.genderId) : '',
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
      contactNo: p.contactNo ?? '',
      email: p.email ?? '',
    });
    setEditing(d.id);
    setError('');
    setNotice('');
  };

  const save = async () => {
    if (!form.firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!form.relationTypeId) {
      setError('Choose the relation');
      return;
    }
    if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      setError('Date of birth cannot be in the future');
      return;
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      setError('Enter a valid email address');
      return;
    }
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || undefined,
      relationTypeId: Number(form.relationTypeId),
      genderId: form.genderId ? Number(form.genderId) : undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      contactNo: form.contactNo.trim() || undefined,
      email: form.email.trim() || undefined,
    };
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') await createEmployeeDependant(employeeId, payload);
      else await updateEmployeeDependant(employeeId, editing as number, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save dependent');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Dependant) => {
    if (!window.confirm(`Remove ${d.dependantProfile.name}?`)) return;
    setError('');
    try {
      await deleteEmployeeDependant(employeeId, d.id);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not remove dependent');
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {canEdit && editing === null && (
        <button type="button" onClick={startNew} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
          + Add dependent
        </button>
      )}

      {editing !== null && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              First name <span className="text-red-500">*</span>
              <input className={field} maxLength={100} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Last name
              <input className={field} maxLength={100} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Relation <span className="text-red-500">*</span>
              <Select className={field} value={form.relationTypeId} onChange={(e) => setForm({ ...form, relationTypeId: e.target.value })}>
                <option value="">Select…</option>
                {relations.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
              </Select>
              {relations.length === 0 && <span className="mt-1 block text-xs text-gray-500">No relation options yet. Add "Dependant Relation" values in Masters.</span>}
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Gender
              <Select className={field} value={form.genderId} onChange={(e) => setForm({ ...form, genderId: e.target.value })}>
                <option value="">Select…</option>
                {genders.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
              </Select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Date of birth
              <input type="date" className={field} max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Contact number
              <input className={field} maxLength={30} value={form.contactNo} onChange={(e) => setForm({ ...form, contactNo: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              Email
              <input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => { setEditing(null); setError(''); }} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save dependent'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Relation</th>
              <th className="px-4 py-3">Gender</th>
              <th className="px-4 py-3">Date of birth</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No dependents recorded.</td></tr>
            ) : (
              items.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.dependantProfile.name} {d.dependantProfile.lastName}</td>
                  <td className="px-4 py-3 text-gray-700">{label(relations, d.relationTypeId)}</td>
                  <td className="px-4 py-3 text-gray-700">{label(genders, d.dependantProfile.genderId)}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(d.dependantProfile.dateOfBirth)}</td>
                  <td className="px-4 py-3 text-gray-700">{d.dependantProfile.contactNo || d.dependantProfile.email || '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => startEdit(d)} className="mr-4 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                        <button type="button" onClick={() => remove(d)} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
