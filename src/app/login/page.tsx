'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Mail, KeyRound } from 'lucide-react';
import Image from 'next/image';
import { AddToHomeScreenBanner } from '@/components/add-to-home-screen';
import { cn } from '@/lib/utils';

const DEMO_PASSWORD = 'CareerRai2026!';
const DEMO_ACCOUNTS = [
  { label: 'Aarav — 79→94%ile in 30 days', username: 'aarav', password: DEMO_PASSWORD },
  { label: 'Priya — first-timer, 62→74%ile', username: 'priya', password: DEMO_PASSWORD },
  { label: 'Rohan — thriving at 97%ile', username: 'rohan', password: DEMO_PASSWORD },
  { label: 'Meera — lapsed, needs attention', username: 'meera', password: DEMO_PASSWORD },
  { label: 'Buddy — Nishant (IIM-A, Bain)', username: 'nishant', password: DEMO_PASSWORD },
  { label: 'Admin', username: 'admin', password: DEMO_PASSWORD },
];

type LoginMode = 'password' | 'otp-email' | 'otp-code';

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<LoginMode>('password');

  // Password login state
  const [credential, setCredential] = useState(''); // email or username
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // OTP login state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);

  const hasError = params.get('error') === '1';

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[0]) {
    setCredential(acc.username);
    setPassword(acc.password);
    setMode('password');
  }

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setOtpLoading(true);
    setOtpMsg(null);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail }),
      });
      const data = await res.json();
      if (data.sent) {
        setMode('otp-code');
        setOtpMsg('Code sent — check your email.');
      } else {
        setOtpMsg(data.message ?? "Couldn't send the code. Try again.");
      }
    } catch {
      setOtpMsg('No connection. Try again.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setOtpLoading(true);
    setOtpMsg(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail, token: otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.dest) {
        window.location.href = data.dest;
        return;
      }
      setOtpMsg(data.error ?? 'That code is incorrect or expired.');
    } catch {
      setOtpMsg('No connection. Try again.');
    } finally {
      setOtpLoading(false);
    }
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
            <Image
              src="/careerrai-logo.png"
              alt="CareerRai"
              width={124}
              height={124}
              style={{ height: 124, width: 'auto' }}
              priority
            />
          </div>
          <h1
            className="text-3xl font-bold text-stone-900 tracking-tight"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Track every day.<br />
            <span className="italic text-orange-600">Outwork yesterday.</span>
          </h1>
          <p className="mt-3 text-sm text-stone-600">Daily prep tracking with your IIM buddy.</p>
        </div>

        {/* CAT Readiness Test — visible above the login form */}
        <a
          href="/cat-readiness"
          className="mb-4 flex items-center justify-between gap-3 w-full bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3.5 hover:bg-orange-100 transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold text-orange-900">Free CAT Readiness Test</p>
            <p className="text-xs text-orange-700 mt-0.5">5 min · no signup · get a real score + IIM buddy session</p>
          </div>
          <ArrowRight className="w-4 h-4 text-orange-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </a>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">

          {/* Password login (primary) */}
          {mode === 'password' && (
            <>
              <form action="/api/auth/login" method="POST" className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">Email or username</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="text"
                      name="credential"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder="you@example.com or username"
                      required
                      autoComplete="email username"
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 pr-10 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {hasError && (
                  <p className="text-xs text-rose-600">Incorrect credentials. Try a demo account below, or use OTP login.</p>
                )}

                <button
                  type="submit"
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98]',
                    'bg-stone-900 text-white hover:bg-stone-800'
                  )}
                >
                  Sign in <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => { setMode('otp-email'); setOtpMsg(null); }}
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  First time? Forgot password? → Login with OTP
                </button>
              </div>
            </>
          )}

          {/* OTP — enter email */}
          {mode === 'otp-email' && (
            <form onSubmit={requestOtp} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm font-semibold text-stone-900">Login with email code</p>
                <p className="text-xs text-stone-500 mt-1">We'll send a 6-digit code to your email.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>
              </div>

              {otpMsg && <p className="text-xs text-stone-600">{otpMsg}</p>}

              <button
                type="submit"
                disabled={otpLoading || !otpEmail.includes('@')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {otpLoading ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode('password'); setOtpMsg(null); }}
                  className="text-xs text-stone-500 hover:text-stone-700"
                >
                  ← Back to password login
                </button>
              </div>
            </form>
          )}

          {/* OTP — enter code */}
          {mode === 'otp-code' && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm font-semibold text-stone-900">Enter the code</p>
                <p className="text-xs text-stone-500 mt-1">
                  Sent to <span className="font-semibold text-stone-700">{otpEmail}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">6-digit code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm tracking-[0.4em] font-mono focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>
              </div>

              {otpMsg && <p className="text-xs text-stone-600">{otpMsg}</p>}

              <button
                type="submit"
                disabled={otpLoading || otpCode.length < 6}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {otpLoading ? 'Verifying…' : <>Verify &amp; sign in <ArrowRight className="w-4 h-4" /></>}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setMode('otp-email'); setOtpCode(''); setOtpMsg(null); }}
                  className="text-stone-500 hover:text-stone-700"
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={() => requestOtp()}
                  disabled={otpLoading}
                  className="font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {/* Demo accounts — only show on password mode */}
          {mode === 'password' && (
            <div className="mt-5 pt-5 border-t border-stone-200">
              <p className="text-xs text-stone-500 text-center mb-3">Try a demo account (click to fill)</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="text-xs py-2 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl text-stone-700 font-medium transition-colors text-left"
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 text-center mt-2">
                All demo accounts use password: <span className="font-mono">{DEMO_PASSWORD}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-4">
          <AddToHomeScreenBanner />
        </div>

        <p className="mt-4 text-center text-xs text-stone-500">
          Bharat-first peer mentorship · 0% commission
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
