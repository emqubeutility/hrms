import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { getUserTypes, MenuFlags } from '../lib/api';
import { getMenuItems, getMenuPermissions, MenuItemRow, MenuPermissionRow, setMenuPermissions } from '../lib/admin-api';
import { flattenWithDepth, Selection, toggleSelection } from '../lib/menu-tree';
import { UserType } from '../lib/user-types';
import Select from './Select';

type FlagKey = keyof MenuFlags;

const FLAGS: Array<{ key: FlagKey; label: string }> = [
  { key: 'isCreate', label: 'Create' },
  { key: 'isEdit', label: 'Edit' },
  { key: 'isDelete', label: 'Delete' },
];

export default function RightsPanel() {
  const { user } = useAuth();
  const canEdit = user?.userTypeId === UserType.SystemAdmin;

  const [userTypes, setUserTypes] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [userTypeId, setUserTypeId] = useState<number | ''>('');
  const [selection, setSelection] = useState<Selection>({});
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [pageUrlOverrides, setPageUrlOverrides] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([getUserTypes(), getMenuItems()])
      .then(([types, menu]) => {
        setUserTypes(types.data);
        setItems(menu.data);
      })
      .catch((err) => setMessage({ type: 'err', text: err.message || 'Could not load menus' }));
  }, []);

  useEffect(() => {
    if (userTypeId === '') return;
    setLoading(true);
    setMessage(null);
    getMenuPermissions(userTypeId)
      .then((res) => {
        const next: Selection = {};
        const overrides: Record<number, string | null> = {};
        for (const row of res.data) {
          next[row.menuItemId] = { isCreate: row.isCreate, isEdit: row.isEdit, isDelete: row.isDelete };
          overrides[row.menuItemId] = row.pageUrlOverride;
        }
        setSelection(next);
        setPageUrlOverrides(overrides);
        setSavedSnapshot(JSON.stringify(next));
      })
      .catch((err) => setMessage({ type: 'err', text: err.message || 'Could not load rights' }))
      .finally(() => setLoading(false));
  }, [userTypeId]);

  const rows = useMemo(() => flattenWithDepth(items), [items]);
  const dirty = userTypeId !== '' && JSON.stringify(selection) !== savedSnapshot;

  const tick = (id: number, checked: boolean) => {
    setSelection((prev) => toggleSelection(prev, id, checked, items));
  };

  const setFlag = (id: number, key: FlagKey, value: boolean) => {
    setSelection((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const save = async () => {
    if (userTypeId === '') return;
    setSaving(true);
    setMessage(null);
    try {
      const permissions: MenuPermissionRow[] = Object.entries(selection).map(([id, flags]) => ({
        menuItemId: Number(id),
        pageUrlOverride: pageUrlOverrides[Number(id)] ?? null,
        ...flags,
      }));
      await setMenuPermissions(userTypeId, permissions);
      setSavedSnapshot(JSON.stringify(selection));
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Rights by user type</h2>
        <p className="text-sm text-gray-500 mt-1">
          This is what actually controls the sidebar: ticking a page grants it (and shows its section);
          unticking every page in a section hides that section too. Create, edit and delete apply to that page.
        </p>
        {!canEdit && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            You can view rights but only a System Administrator can change them.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 pb-4 space-y-4 border-b border-gray-100">
          <label className="block text-sm font-medium text-gray-700">
            User type
            <Select
              className="mt-1 block w-full sm:w-72 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={userTypeId}
              onChange={(e) => setUserTypeId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Select a user type</option>
              {userTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>

          {message && (
            <p className={`text-sm rounded-md px-3 py-2 ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.text}
            </p>
          )}
        </div>

        {userTypeId === '' ? (
          <p className="p-6 text-sm text-gray-500 text-center">Select a user type to see its menus.</p>
        ) : loading ? (
          <p className="p-6 text-sm text-gray-500 text-center">Loading…</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.length === 0 && <p className="p-6 text-sm text-gray-500 text-center">No menu items yet.</p>}
            {rows.map(({ item, depth }) => {
              const flags = selection[item.id];
              const ticked = !!flags;
              const isGroup = depth === 0;
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 pr-4 ${isGroup ? 'bg-gray-50/80 py-2.5' : 'py-2'}`}
                  style={{ paddingLeft: `${depth * 24 + 16}px` }}
                >
                  <label className="flex min-w-0 items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                      checked={ticked}
                      disabled={!canEdit}
                      onChange={(e) => tick(item.id, e.target.checked)}
                    />
                    <span className={`truncate text-sm ${isGroup ? 'font-semibold' : 'font-normal'} ${item.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {item.name}
                    </span>
                    {item.pageUrl && <span className="hidden shrink-0 text-xs text-gray-400 font-mono sm:inline">{item.pageUrl}</span>}
                    {!item.isActive && <span className="shrink-0 text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">inactive</span>}
                  </label>
                  {flags ? (
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      {FLAGS.map((f) => (
                        <label key={f.key} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-gray-300"
                            checked={!!flags[f.key]}
                            disabled={!canEdit}
                            onChange={(e) => setFlag(item.id, f.key, e.target.checked)}
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  ) : <span />}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && userTypeId !== '' && !loading && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
            {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save rights'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
