import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ModuleConfigurationItem, getModuleConfigurations, updateModuleConfiguration } from '../lib/api';

export default function ModulesPage() {
  const { isAuthenticated, user } = useAuth();
  const [modules, setModules] = useState<ModuleConfigurationItem[]>([]);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isSystemAdmin = user?.userTypeId === 3;

  const load = async () => {
    setLoading(true);
    try {
      const res = await getModuleConfigurations();
      setModules(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isSystemAdmin) load();
    else if (isAuthenticated) setLoading(false);
  }, [isAuthenticated, isSystemAdmin]);

  const toggle = async (m: ModuleConfigurationItem) => {
    setError('');
    setMessage('');
    setTogglingKey(m.moduleKey);
    try {
      await updateModuleConfiguration(m.moduleKey, !m.isEnabled);
      load();
    } catch (err: any) {
      setError(err.message || `Could not update ${m.name}`);
    } finally {
      setTogglingKey(null);
    }
  };

  const nameOf = (key: string) => modules.find((m) => m.moduleKey === key)?.name ?? key;

  if (!isAuthenticated) return null;
  if (!isSystemAdmin) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
        Only System Admin can manage module configuration.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Module configuration</h2>
        <p className="mt-1 text-sm text-gray-500">
          Modules marked &ldquo;not yet available&rdquo; aren&rsquo;t built yet &mdash; the toggle is a placeholder for when they are.
        </p>
      </div>

      {message && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <ul className="divide-y divide-gray-100">
            {modules.map((m) => (
              <li key={m.moduleKey} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {m.isImplemented ? 'Available' : 'Not yet available'}
                    {m.dependsOn.length > 0 && <> · Requires {m.dependsOn.map(nameOf).join(', ')}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  disabled={togglingKey === m.moduleKey}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${m.isEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  aria-pressed={m.isEnabled}
                  aria-label={`Toggle ${m.name}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${m.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </li>
            ))}
            {modules.length === 0 && <li className="px-5 py-6 text-center text-sm text-gray-500">No modules configured.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
