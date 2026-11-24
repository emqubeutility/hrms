import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import ParametersPanel from '../components/ParametersPanel';
import BranchesPanel from '../components/BranchesPanel';
import Select from '../components/Select';
import {
  MasterItem,
  DocumentTypeItem,
  CountryItem,
  getSites,
  getDocumentTypes,
  getLanguages,
  getCountries,
  createSite,
  updateSite,
  deactivateSite,
  deleteMaster,
  createLanguage,
  updateLanguage,
  deactivateLanguage,
  createDocumentType,
  updateDocumentType,
  deactivateDocumentType,
} from '../lib/api';

// Shifts are managed under Administration > Attendance setup, not here.
type MasterTab = 'sites' | 'languages' | 'document-types';

const tabs: { key: MasterTab; label: string; description: string }[] = [
  { key: 'sites', label: 'Sites', description: 'Work locations and office sites.' },
  { key: 'languages', label: 'Languages', description: 'Mother tongue options for employee profiles.' },
  { key: 'document-types', label: 'Document Types', description: 'Categories for employee documents.' },
];

const api = {
  sites: { list: getSites, create: createSite, update: updateSite, deactivate: deactivateSite },
  languages: { list: getLanguages, create: createLanguage, update: updateLanguage, deactivate: deactivateLanguage },
  'document-types': { list: getDocumentTypes, create: createDocumentType, update: updateDocumentType, deactivate: deactivateDocumentType },
} as const;

const emptyForm = {
  name: '',
  hasExpiry: false,
  countryCodes: [] as string[],
};

export default function MastersPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  // Parameters carries its own screen inside this page.
  const [special, setSpecial] = useState<'parameters' | 'branches' | null>(null);

  // Old /branches and /parameters URLs arrive as ?tab=…
  useEffect(() => {
    const q = router.query.tab;
    if (q === 'parameters' || q === 'branches') setSpecial(q);
  }, [router.query.tab]);
  const [activeTab, setActiveTab] = useState<MasterTab>('sites');
  const [items, setItems] = useState<Record<MasterTab, (MasterItem | DocumentTypeItem)[]>>({
    sites: [],
    languages: [],
    'document-types': [],
  });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countries, setCountries] = useState<CountryItem[]>([]);

  const loadAll = () => {
    setLoading(true);
    setError('');
    return Promise.all(tabs.map((t) => api[t.key].list()))
      .then((results) => {
        const next: typeof items = { sites: [], languages: [], 'document-types': [] };
        tabs.forEach((t, i) => {
          next[t.key] = results[i].data;
        });
        setItems(next);
      })
      .catch((err: any) => setError(err.message || 'Could not load master data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAll();
    // The countries that System Settings > Countries has added, so Document Types can pick among them.
    getCountries().then((r) => setCountries(r.data.filter((c) => c.isActive))).catch(() => setCountries([]));
  }, [isAuthenticated]);

  const switchTab = (tab: MasterTab) => {
    setSpecial(null);
    setActiveTab(tab);
    setEditingId(null);
    setError('');
    setNotice('');
  };

  const startNew = () => {
    setEditingId('new');
    setForm(emptyForm);
    setError('');
    setNotice('');
  };

  const startEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setForm({ ...emptyForm, name: item.name, hasExpiry: !!(item as DocumentTypeItem).hasExpiry, countryCodes: (item as DocumentTypeItem).countryCodes ?? [] });
    setError('');
    setNotice('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Name is required';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { create, update } = api[activeTab];
      if (activeTab === 'document-types') {
        const dp = { name: form.name.trim(), hasExpiry: form.hasExpiry, countryCodes: form.countryCodes };
        if (editingId === 'new') await (create as typeof createDocumentType)(dp);
        else await (update as typeof updateDocumentType)(editingId as number, dp);
      } else {
        const payload = { name: form.name.trim() };
        if (editingId === 'new') await (create as typeof createSite)(payload);
        else await (update as typeof updateSite)(editingId as number, payload);
      }
      setEditingId(null);
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: MasterItem) => {
    setError('');
    setNotice('');
    try {
      if (item.isActive) {
        await api[activeTab].deactivate(item.id);
      } else {
        await (api[activeTab].update as typeof updateSite)(item.id, { isActive: true });
      }
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Could not update status');
    }
  };

  const removeItem = async (item: MasterItem) => {
    if (!window.confirm(`Delete "${item.name}" permanently? This cannot be undone. If it is in use you will be told to deactivate it instead.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteMaster(activeTab, item.id);
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Could not delete');
    }
  };

  const currentTab = tabs.find((t) => t.key === activeTab)!;
  const currentItems = items[activeTab];
  const isDocTypes = activeTab === 'document-types';

  const inputClass =
    'mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-colors';

  const countryLabel = (codes: string[]) => {
    if (!codes || codes.length === 0) return 'All countries';
    return codes.map((c) => countries.find((x) => x.isoCode === c)?.name ?? c).join(', ');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Masters</h2>
        <p className="text-gray-500 mt-1">Manage reference data and catalogs used across the app.</p>
      </div>

      {notice && (
        <p className="text-sm rounded-lg px-3.5 py-2.5 bg-green-50 text-green-700 border border-green-200">{notice}</p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Section navigation (same pattern as Employee edit) */}
        <nav aria-label="Master categories" className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:sticky lg:top-6 lg:col-span-3 lg:self-start">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference data</p>
          {tabs.map((t) => {
            const active = !special && activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{t.label}</span>
                <span className={`text-xs ${active ? 'text-blue-600' : 'text-gray-400'}`}>{items[t.key].length}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { setSpecial('branches'); setEditingId(null); setError(''); setNotice(''); }}
            aria-current={special === 'branches' ? 'true' : undefined}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium ${special === 'branches' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Branches
          </button>
          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Dropdown options</p>
          <button
            type="button"
            onClick={() => { setSpecial('parameters'); setEditingId(null); setError(''); setNotice(''); }}
            aria-current={special === 'parameters' ? 'true' : undefined}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium ${special === 'parameters' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Parameters
          </button>
        </nav>

        {/* Section panel */}
        {special ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-9">
            {special === 'branches' ? <BranchesPanel /> : <ParametersPanel />}
          </section>
        ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-9">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{currentTab.label}</h3>
              <p className="mt-1 text-sm text-gray-500">{currentTab.description}</p>
            </div>
            <button
              type="button"
              onClick={startNew}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add {currentTab.label.replace(/s$/, '')}
            </button>
          </div>

          {error && (
            <p className="mb-4 text-sm rounded-lg px-3.5 py-2.5 bg-red-50 text-red-700 border border-red-200">{error}</p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  {isDocTypes && (
                    <>
                      <th className="px-4 py-3">Expiry</th>
                      <th className="px-4 py-3">Country</th>
                    </>
                  )}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={isDocTypes ? 5 : 3} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                ) : currentItems.length === 0 ? (
                  <tr><td colSpan={isDocTypes ? 5 : 3} className="px-4 py-8 text-center text-gray-500">No {currentTab.label.toLowerCase()} yet.</td></tr>
                ) : (
                  currentItems.map((item) => {
                    return (
                      <tr key={item.id} className={!item.isActive ? 'bg-gray-50/60' : undefined}>
                        <td className={`px-4 py-3 font-medium ${item.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{item.name}</td>
                        {isDocTypes && (
                          <>
                            <td className="px-4 py-3 text-gray-700">{(item as DocumentTypeItem).hasExpiry ? 'Issue + expiry required' : 'No expiry'}</td>
                            <td className="px-4 py-3 text-gray-700">{countryLabel((item as DocumentTypeItem).countryCodes)}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          {item.isActive ? (
                            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
                          ) : (
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => startEdit(item)} className="text-xs font-medium text-blue-600 hover:text-blue-800 mr-4">
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(item)}
                            className={`text-xs font-medium ${item.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                          >
                            {item.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" onClick={() => removeItem(item)} className="ml-4 text-xs font-medium text-red-600 hover:text-red-800">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={cancelEdit} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl animate-[slideIn_0.2s_ease-out]">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h4 className="text-base font-semibold text-gray-900">
                {editingId === 'new' ? `New ${currentTab.label.replace(/s$/, '')}` : `Edit ${currentTab.label.replace(/s$/, '')}`}
              </h4>
              <button type="button" onClick={cancelEdit} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {error && (
                <p className="text-sm rounded-lg px-3.5 py-2.5 bg-red-50 text-red-700 border border-red-200">{error}</p>
              )}

              <label className="block text-sm font-medium text-gray-700">
                Name
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </label>

              {isDocTypes && (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Countries
                    <Select
                      multiple
                      className={inputClass}
                      values={form.countryCodes}
                      onValuesChange={(v) => setForm({ ...form, countryCodes: v })}
                      options={countries.map((c) => ({ value: c.isoCode, label: c.name }))}
                      allText="All countries"
                      noun="countries"
                      placeholder={countries.length === 0 ? 'Add countries in System Settings first' : 'Select…'}
                    />
                    <span className="mt-1 block text-xs text-gray-500">Leave empty for every employee, or pick the countries this document applies to.</span>
                  </label>
                  <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                    <input type="checkbox" className="mt-0.5" checked={form.hasExpiry} onChange={(e) => setForm({ ...form, hasExpiry: e.target.checked })} />
                    <span>
                      <span className="font-medium">This document expires</span>
                      <span className="block text-gray-500">Issue date and expiry date become required for documents of this type.</span>
                    </span>
                  </label>
                </>
              )}

            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={cancelEdit} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
