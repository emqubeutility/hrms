import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { getSessions, revokeOtherSessions, revokeSession, SessionRow } from '../lib/admin-api';
import ChangePasswordForm from '../components/ChangePasswordForm';

function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad|Android/i.test(ua)) return 'Mobile browser';
  if (/Windows|Macintosh|Linux/i.test(ua)) return 'Desktop browser';
  return 'Browser';
}

export default function AccountPage() {
  const { isAuthenticated } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getSessions()
      .then((res) => setSessions(res.data))
      .catch((err) => setMessage({ type: 'err', text: err.message || 'Could not load sessions' }));

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated]);

  const signOut = async (id: string) => {
    setBusy(true);
    try {
      await revokeSession(id);
      await load();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'Could not sign out that session' });
    } finally {
      setBusy(false);
    }
  };

  const signOutOthers = async () => {
    setBusy(true);
    try {
      const res = await revokeOtherSessions();
      await load();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'Could not sign out other sessions' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Change password</h2>
        <ChangePasswordForm />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Signed-in sessions</h2>
            <p className="text-sm text-gray-500">Devices currently signed in to your account.</p>
          </div>
          <button
            onClick={signOutOthers}
            disabled={busy || sessions.filter((s) => !s.isCurrent).length === 0}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Sign out others
          </button>
        </div>

        {message && (
          <p className={`text-sm rounded-md px-3 py-2 ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </p>
        )}

        <ul className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {describeDevice(s.userAgent)}
                  {s.isCurrent && <span className="ml-2 text-xs text-blue-600">(this device)</span>}
                </p>
                <p className="text-xs text-gray-500">
                  Last active {new Date(s.lastUsedAt).toLocaleString()} · IP {s.ipAddress ?? 'unknown'}
                </p>
              </div>
              {!s.isCurrent && (
                <button onClick={() => signOut(s.id)} disabled={busy} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
                  Sign out
                </button>
              )}
            </li>
          ))}
          {sessions.length === 0 && <li className="py-3 text-sm text-gray-500">No sessions found.</li>}
        </ul>
      </section>
    </div>
  );
}
