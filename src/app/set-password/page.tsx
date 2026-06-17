'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, Lock } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

function SetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const dest = params.get('dest') ?? '/student/tracker';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const weak = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, dest }),
      });
      const data = await res.json();
      if (res.ok && data.dest) {
        router.push(data.dest);
      } else {
        setError(data.error ?? 'Could not save password. Try again.');
      }
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function skip() {
    router.push(dest);
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-orange-100 rounded-full opacity-40 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-teal-100 rounded-full opacity-40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Image src="/careerrai-logo.png" alt="CareerRai" width={80} height={80} style={{ height: 80, width: 'auto' }} priority />
          </div>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mb-4">
            <Lock className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Set a password
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            One-tap login every day — your browser saves it for you.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                New password <span className="text-stone-400 font-normal">(min 8 characters)</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className={cn(
                    'w-full px-3 py-2.5 pr-10 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2',
                    weak ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/10' : 'border-stone-300 focus:border-stone-900 focus:ring-stone-900/10'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {weak && <p className="text-xs text-amber-600 mt-1">Must be at least 8 characters.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Confirm password</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className={cn(
                  'w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2',
                  mismatch ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-stone-300 focus:border-stone-900 focus:ring-stone-900/10'
                )}
              />
              {mismatch && <p className="text-xs text-rose-600 mt-1">Passwords don't match.</p>}
            </div>

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Saving…' : <>Save password &amp; continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={skip}
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              Skip for now — I'll use OTP each time
            </button>
          </div>

          <p className="text-[11px] text-stone-400 text-center mt-4">
            Your password is hashed by Supabase — CareerRai never sees it.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
