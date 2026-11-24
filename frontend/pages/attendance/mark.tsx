import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { TodayState, markAttendance, getToday, minutesText } from '../../lib/attendance-marking-api';
import StatusBadge from '../../components/StatusBadge';

const MOOD_ICON: Record<string, string> = { Happy: '😊', OK: '😐', Sad: '😞', None: '—' };

const timeIn = (iso: string, tz: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });

/** Employee self-service: press IN or OUT for today. One IN and one OUT, that is it for the day. */
export default function MarkAttendancePage() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<TodayState | null>(null);
  const [coords, setCoords] = useState('');
  const [geoNote, setGeoNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(new Date());

  const load = useCallback(async () => {
    try {
      setState((await getToday()).data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load today');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const gps = state?.settings.gpsRequirement ?? 'OFF';

  /** Asks the browser for the current position. Resolves to "lat,lng", or '' when not available. */
  const locate = (): Promise<string> =>
    new Promise((resolve) => {
      if (gps === 'OFF') return resolve('');
      if (!navigator.geolocation) {
        setGeoNote('This browser cannot share your location.');
        return resolve('');
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const c = `${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
          setCoords(c);
          setGeoNote('');
          resolve(c);
        },
        (err) => {
          setGeoNote(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in the browser to mark attendance.' : 'Could not get your location.');
          resolve('');
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });

  /** Pass a mood to mark IN with it right away (clicking an emoji marks immediately, no extra step). */
  const press = async (mood?: string) => {
    if (!state) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const c = await locate();
      if (gps === 'REQUIRED' && !c) throw new Error('Your location is required to mark attendance. Allow location access and try again.');
      const wasIn = state.next === 'IN';
      const res = await markAttendance({ coordinates: c || undefined, mood: wasIn && mood ? mood : undefined });
      setState(res.data);
    } catch (e: any) {
      setError(e.message || 'Could not mark attendance');
    } finally {
      setBusy(false);
    }
  };

  const tz = state?.timeZone ?? 'UTC';
  const localClock = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz });
  const localDate = clock.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
  const rec = state?.record;
  const isIn = state?.next === 'IN';

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Mark attendance</h2>
        <p className="mt-1 text-gray-500">Press IN when you start and OUT when you finish. Times use your location's timezone.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}
      {geoNote && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{geoNote}</p>}

      {!state ? (
        !error && <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <p className="text-sm text-gray-500">{localDate}</p>
            <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-gray-900">{localClock}</p>
            <p className="mt-1 text-xs text-gray-400">{tz}</p>
          </div>

          {rec && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-600">
              <StatusBadge name={rec.statusName} color={rec.statusColor} approved={rec.approved} />
              {rec.firstInAt && <span>In {timeIn(rec.firstInAt, tz)}</span>}
              {rec.lastOutAt && <span>Out {timeIn(rec.lastOutAt, tz)}</span>}
              {rec.lateMinutes > 0 && <span className="text-amber-700">{rec.lateMinutes} min late</span>}
              {rec.workedMinutes !== null && <span>Worked {minutesText(rec.workedMinutes)}</span>}
            </div>
          )}

          {isIn && state.settings.moodEnabled && state.settings.moods.length > 0 && !rec?.firstInAt && (
            <div className="mt-6">
              <p className="text-center text-sm font-medium text-gray-700">How are you feeling today? Tap one to mark IN.</p>
              <div className="mt-2 flex justify-center gap-2">
                {state.settings.moods.map((m) => (
                  <button key={m} type="button" onClick={() => press(m)} disabled={busy || !state.canMark} className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <span className="mr-1.5">{MOOD_ICON[m] ?? ''}</span>{m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gps !== 'OFF' && (
            <p className="mt-3 text-center text-xs text-gray-400">
              {coords ? `Location captured (${coords})` : `Your browser will ask to share your location${gps === 'REQUIRED' ? ' (required)' : ''}.`}
            </p>
          )}

          <button
            type="button"
            onClick={() => press()}
            disabled={busy || !state.canMark}
            className={`mt-6 w-full rounded-xl py-4 text-lg font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${isIn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {busy ? 'Please wait…' : isIn ? 'Mark IN' : 'Mark OUT'}
          </button>
          {!state.canMark && state.blockedReason && <p className="mt-3 text-center text-sm text-amber-700">{state.blockedReason}</p>}

          {state.punches.length > 0 && (
            <ul className="mt-6 divide-y divide-gray-100 border-t border-gray-100 pt-3 text-sm">
              {state.punches.map((p, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className={p.type === 'IN' ? 'font-medium text-green-700' : 'font-medium text-red-700'}>{p.type}</span>
                  <span className="font-mono text-gray-700">{timeIn(p.at, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
