import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { CountryItem, ProfileRule, ProfileRuleCatalog, getCountries, getProfileRules, getSystemConfigurations, resetProfileRules, saveProfileRules } from '../lib/api';

type Override = { isVisible: boolean | null; isRequired: boolean | null };
const keyOf = (s: string, g: string, f: string) => `${s}|${g}|${f}`;

/** Per-country control of which profile tabs, groups and fields appear, and which are required. Countries come from System settings > Countries. */
export default function ProfileRulesPage() {
  const { isAuthenticated, user } = useAuth();
  const isSystemAdmin = user?.userTypeId === 3;

  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [catalog, setCatalog] = useState<ProfileRuleCatalog | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [saved, setSaved] = useState<Record<string, Override>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const toMap = (rules: ProfileRule[]) =>
    Object.fromEntries(rules.map((r) => [keyOf(r.sectionKey, r.groupTitle, r.fieldKey), { isVisible: r.isVisible, isRequired: r.isRequired }]));

  const load = async (c: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await getProfileRules(c);
      setCatalog(res.data);
      const m = toMap(res.data.rules);
      setOverrides(m);
      setSaved(m);
    } catch (e: any) {
      setError(e.message || 'Could not load rules');
    } finally {
      setLoading(false);
    }
  };

  // The countries in the country list; the Default Country is shown first.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isSystemAdmin) { setLoading(false); return; }
    Promise.all([getCountries(), getSystemConfigurations()])
      .then(([cs, cfg]) => {
        const active = cs.data.filter((c) => c.isActive);
        const def = cfg.data.find((i) => i.name === 'Default Country')?.value;
        setCountries(active);
        const first = active.find((c) => c.isoCode === def) ?? active[0];
        if (first) setCountry(first.isoCode);
        else setLoading(false);
      })
      .catch((e: any) => { setError(e.message || 'Could not load the country list'); setLoading(false); });
  }, [isAuthenticated, isSystemAdmin]);
  useEffect(() => {
    if (country) load(country);
  }, [country]);

  const dirty = useMemo(() => JSON.stringify(overrides) !== JSON.stringify(saved), [overrides, saved]);

  const get = (k: string): Override => overrides[k] ?? { isVisible: null, isRequired: null };
  const setOv = (k: string, patch: Partial<Override>) =>
    setOverrides((prev) => {
      const next = { ...(prev[k] ?? { isVisible: null, isRequired: null }), ...patch };
      const copy = { ...prev };
      if (next.isVisible === null && next.isRequired === null) delete copy[k];
      else copy[k] = next;
      return copy;
    });

  // Setting a value equal to the code default clears the override, so only real changes are stored.
  const setVisible = (k: string, value: boolean, def: boolean) => setOv(k, { isVisible: value === def ? null : value });
  const setRequired = (k: string, value: boolean, def: boolean) => setOv(k, { isRequired: value === def ? null : value });

  const changeCountry = (c: string) => {
    if (c === country) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setCountry(c);
    setNotice('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const rules: ProfileRule[] = Object.entries(overrides).map(([k, v]) => {
        const [sectionKey, groupTitle, fieldKey] = k.split('|');
        return { sectionKey, groupTitle, fieldKey, isVisible: v.isVisible, isRequired: v.isRequired };
      });
      const res = await saveProfileRules(country, rules);
      setCatalog(res.data);
      const m = toMap(res.data.rules);
      setOverrides(m);
      setSaved(m);
    } catch (e: any) {
      setError(e.message || 'Could not save rules');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(`Reset ${countryName} to the built-in defaults? All its overrides are removed.`)) return;
    setError('');
    try {
      const res = await resetProfileRules(country);
      setCatalog(res.data);
      setOverrides({});
      setSaved({});
    } catch (e: any) {
      setError(e.message || 'Could not reset');
    }
  };

  if (isAuthenticated && !isSystemAdmin) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Only System Admin can manage profile rules.</div>;
  }

  const countryName = countries.find((c) => c.isoCode === country)?.name ?? country;
  const checkbox = 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profile rules</h2>
        <p className="mt-1 text-gray-500">
          Choose which employee profile tabs, groups and fields appear and which fields are required. Fields marked
          <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">default</span>
          follow the built-in country layout. Countries are managed in System settings, Countries.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {countries.map((c) => (
          <button
            key={c.isoCode}
            type="button"
            onClick={() => changeCountry(c.isoCode)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${c.isoCode === country ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            {c.name}
          </button>
        ))}
        {countries.length === 0 && !loading && <span className="text-sm text-gray-500">No countries yet. Add them in System settings, Countries.</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={reset} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Reset to defaults</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {loading || !catalog ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          {catalog.sections.map((s) => {
            const sk = keyOf(s.key, '', '');
            const sectionVisible = get(sk).isVisible ?? true;
            return (
              <section key={s.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className={checkbox} checked={sectionVisible} disabled={s.locked} onChange={(e) => setVisible(sk, e.target.checked, true)} />
                    <span className="font-semibold text-gray-900">{s.title}</span>
                  </label>
                  {s.locked && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">always shown</span>}
                  {!sectionVisible && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">tab hidden for {countryName}</span>}
                </header>

                <div className={sectionVisible ? '' : 'opacity-50'}>
                  {s.groups.map((g) => {
                    const gk = keyOf(s.key, g.title, '');
                    const groupVisible = get(gk).isVisible ?? true;
                    return (
                      <div key={g.title} className="border-b border-gray-100 px-5 py-3 last:border-b-0">
                        <label className="flex items-center gap-3">
                          <input type="checkbox" className={checkbox} checked={groupVisible} onChange={(e) => setVisible(gk, e.target.checked, true)} disabled={!sectionVisible} />
                          <span className="text-sm font-medium text-gray-800">{g.title}</span>
                        </label>
                        {g.fields.length > 0 && (
                          <table className={`mt-2 w-full text-sm ${groupVisible ? '' : 'opacity-50'}`}>
                            <thead>
                              <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                                <th className="py-1 pr-4 font-medium">Field</th>
                                <th className="w-24 py-1 font-medium">Show</th>
                                <th className="w-24 py-1 font-medium">Required</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.fields.map((f) => {
                                const fk = keyOf(s.key, g.title, f.key);
                                const ov = get(fk);
                                const visible = f.locked ? true : ov.isVisible ?? f.defaultVisible;
                                const required = ov.isRequired ?? f.defaultRequired;
                                return (
                                  <tr key={f.key} className="border-t border-gray-50">
                                    <td className="py-1.5 pr-4 text-gray-700">
                                      {f.label}
                                      {f.locked && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">needed</span>}
                                      {!f.locked && ov.isVisible === null && !f.defaultVisible && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">default: hidden</span>}
                                    </td>
                                    <td>
                                      <input type="checkbox" className={checkbox} checked={visible} disabled={f.locked || !sectionVisible || !groupVisible} onChange={(e) => setVisible(fk, e.target.checked, f.defaultVisible)} />
                                    </td>
                                    <td>
                                      <input type="checkbox" className={checkbox} checked={required} disabled={f.locked || !visible || !sectionVisible || !groupVisible} onChange={(e) => setRequired(fk, e.target.checked, f.defaultRequired)} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
