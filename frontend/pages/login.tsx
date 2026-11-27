import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { DevLoginOption, forgotPassword, getDevLogins } from '../lib/api';
import { brandLogoSrc, useBranding } from '../lib/branding';
import Modal from '../components/Modal';

const EyeIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

export default function LoginPage() {
  const { branding } = useBranding();
  const router = useRouter();
  const { login, loginAsDev, isAuthenticated } = useAuth();
  // Development only: users marked "Dev login". Empty (and nothing is shown) when the server does not allow it.
  const [devUsers, setDevUsers] = useState<DevLoginOption[]>([]);
  const [devBusy, setDevBusy] = useState('');
  const [devError, setDevError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Dev convenience only: default the password field unmasked in development so you can
  // see what you typed without clicking the eye icon every time. Never on in production.
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetOk, setResetOk] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return;
    getDevLogins()
      .then((res) => setDevUsers(res.data ?? []))
      .catch(() => setDevUsers([]));
  }, [isAuthenticated]);

  if (isAuthenticated) {
    router.replace('/');
    return null;
  }

  const signInAs = async (name: string) => {
    setDevBusy(name);
    setDevError('');
    try {
      const mustChangePassword = await loginAsDev(name);
      router.replace(mustChangePassword ? '/change-password' : '/');
    } catch (err: any) {
      setDevError(err.message || 'Could not sign in');
      setDevBusy('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const mustChangePassword = await login(username, password);
      router.replace(mustChangePassword ? '/change-password' : '/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage('');
    setResetLoading(true);
    try {
      await forgotPassword(resetEmail);
      setResetOk(true);
      setResetMessage('If that email exists, a reset link has been sent.');
      setResetEmail('');
    } catch (err: any) {
      setResetOk(false);
      setResetMessage(err.message || 'Unable to send reset link');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          {branding.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogoSrc(branding)} alt={branding.appName} className="h-14 w-auto max-w-[200px] object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold text-white shadow-sm">
              {branding.appName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="mt-4 text-xl font-semibold text-gray-900">{branding.appName}</h1>
          <p className="mt-1 text-sm text-gray-500">{branding.loginBrandingText || 'Sign in to continue'}</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className={inputClass}
                placeholder="Enter your username"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true);
                    setResetMessage('');
                    setResetOk(false);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputClass} pr-11`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:text-blue-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {devUsers.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <p className="text-sm font-semibold text-amber-900">Development sign-in</p>
            <p className="mt-0.5 text-xs text-amber-800">Shown only on a development server. Signs in without a password.</p>
            {devError && <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{devError}</p>}
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-amber-900/70">
                <tr>
                  <th className="pb-1.5 font-semibold">Role</th>
                  <th className="pb-1.5 font-semibold">User</th>
                  <th className="pb-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200">
                {devUsers.map((d) => (
                  <tr key={d.username}>
                    <td className="py-2 pr-2 text-gray-700">{d.role}</td>
                    <td className="py-2 pr-2">
                      <span className="font-medium text-gray-900">{d.name || d.username}</span>
                      <span className="block font-mono text-xs text-gray-500">{d.username}</span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => signInAs(d.username)}
                        disabled={!!devBusy}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                      >
                        {devBusy === d.username ? 'Signing in…' : 'Login'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">Authorised users only. Activity is logged.</p>
      </div>

      {showForgot && (
        <Modal title="Reset your password" size="sm" busy={resetLoading} onClose={() => setShowForgot(false)}>
        <p className="text-sm text-gray-500">Enter your email and we will send a reset link if the account exists.</p>

        {resetMessage && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${resetOk ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}
          >
            {resetMessage}
          </div>
        )}

        <form onSubmit={handleForgot} className="mt-4 space-y-4">
          <div>
            <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resetLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {resetLoading ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </form>
        </Modal>
      )}
    </div>
  );
}
