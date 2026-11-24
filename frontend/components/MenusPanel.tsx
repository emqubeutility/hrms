import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { createMenuItem, getMenuItems, MenuItemPayload, MenuItemRow, updateMenuItem } from '../lib/admin-api';
import { descendantIds, flattenWithDepth } from '../lib/menu-tree';
import { UserType } from '../lib/user-types';
import Select from './Select';

interface FormState {
  name: string;
  pageUrl: string;
  iconClass: string;
  displayOrder: string;
  parentId: string; // '' = top level
  isMainMenu: boolean;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: '',
  pageUrl: '',
  iconClass: '',
  displayOrder: '0',
  parentId: '',
  isMainMenu: true,
  isActive: true,
};

function toForm(item: MenuItemRow): FormState {
  return {
    name: item.name,
    pageUrl: item.pageUrl ?? '',
    iconClass: item.iconClass ?? '',
    displayOrder: String(item.displayOrder),
    parentId: item.parentId === null ? '' : String(item.parentId),
    isMainMenu: item.isMainMenu,
    isActive: item.isActive,
  };
}

export default function MenusPanel() {
  const { user } = useAuth();
  const canEdit = user?.userTypeId === UserType.SystemAdmin;

  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () =>
    getMenuItems()
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message || 'Could not load menu items'));

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => flattenWithDepth(items), [items]);

  // A parent cannot be the item itself or one of its own descendants.
  const parentChoices = useMemo(() => {
    if (editingId === null || editingId === 'new') return rows;
    const blocked = new Set([editingId, ...descendantIds(editingId, items)]);
    return rows.filter(({ item }) => !blocked.has(item.id));
  }, [rows, items, editingId]);

  const startNew = () => {
    setEditingId('new');
    setForm({ ...emptyForm, displayOrder: String(items.length + 1) });
    setError('');
    setNotice('');
  };

  const startEdit = (item: MenuItemRow) => {
    setEditingId(item.id);
    setForm(toForm(item));
    setError('');
    setNotice('');
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Name is required';
    if (form.pageUrl && !form.pageUrl.startsWith('/')) return 'Page address must start with /';
    if (!/^\d+$/.test(form.displayOrder)) return 'Display order must be a whole number';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const payload: MenuItemPayload = {
      name: form.name.trim(),
      pageUrl: form.pageUrl.trim() || null,
      iconClass: form.iconClass.trim() || null,
      displayOrder: Number(form.displayOrder),
      parentId: form.parentId === '' ? null : Number(form.parentId),
      isMainMenu: form.isMainMenu,
      isActive: form.isActive,
    };
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') {
        await createMenuItem(payload);
      } else if (editingId !== null) {
        await updateMenuItem(editingId, payload);
      }
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-gray-600">Only a System Administrator can manage menus.</p>
      </div>
    );
  }

  const inputClass =
    'mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-colors';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Menus</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            The sidebar is built from these items. Each item still needs rights for a user type under Rights.
          </p>
        </div>
        <button
          onClick={startNew}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New menu item
        </button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 text-sm rounded-lg px-3.5 py-2.5 bg-green-50 text-green-700 border border-green-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-5 items-start">
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Menu structure</span>
            <span className="text-xs text-gray-400">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
            {rows.length === 0 && <p className="p-6 text-sm text-gray-500 text-center">No menu items yet.</p>}
            {rows.map(({ item, depth }) => (
              <button
                key={item.id}
                onClick={() => startEdit(item)}
                className={`group relative w-full text-left flex items-center gap-3 py-3 pr-4 transition-colors ${
                  editingId === item.id ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                }`}
                style={{ paddingLeft: `${depth * 22 + 16}px` }}
              >
                {editingId === item.id && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600" />}
                {depth > 0 && <span className="text-gray-300 text-sm shrink-0">└</span>}
                <span className={`text-sm truncate ${item.isActive ? 'text-gray-800' : 'text-gray-400 line-through'} ${!item.pageUrl ? 'font-semibold' : ''}`}>
                  {item.name}
                </span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  {!item.isActive && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Inactive</span>
                  )}
                  {item.pageUrl && <span className="text-xs text-gray-400 font-mono truncate max-w-[9rem]">{item.pageUrl}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-6">
          {editingId === null ? (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 p-8 text-sm text-gray-500 text-center">
              Select a menu item to edit it, or create a new one.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">{editingId === 'new' ? 'New menu item' : 'Edit menu item'}</h3>
                {editingId !== 'new' && <span className="text-xs text-gray-400 font-mono">#{editingId}</span>}
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Name
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Parent
                <Select className={inputClass} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                  <option value="">Top level</option>
                  {parentChoices.map(({ item, depth }) => (
                    <option key={item.id} value={item.id}>
                      {`${'— '.repeat(depth)}${item.name}`}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Page address
                <input
                  className={`${inputClass} font-mono`}
                  placeholder="/employees (leave empty for a group heading)"
                  value={form.pageUrl}
                  onChange={(e) => setForm({ ...form, pageUrl: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Display order
                  <input className={inputClass} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Icon class
                  <input className={inputClass} value={form.iconClass} onChange={(e) => setForm({ ...form, iconClass: e.target.value })} />
                </label>
              </div>

              <div className="flex gap-6 text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={form.isMainMenu} onChange={(e) => setForm({ ...form, isMainMenu: e.target.checked })} />
                  Main menu
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Active
                </label>
              </div>

              {error && (
                <p className="flex items-center gap-2 text-sm rounded-lg px-3.5 py-2.5 bg-red-50 text-red-700 border border-red-200">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1 border-t border-gray-100 -mx-5 px-5 pb-0 mt-5 pt-4">
                <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
