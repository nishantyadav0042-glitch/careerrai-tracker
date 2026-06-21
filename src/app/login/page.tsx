'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Mail, Smartphone } from 'lucide-react';
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

type LoginMode = 'password' | 'otp-email' | 'link-sent' | 'otp-phone' | 'otp-phone-verify';

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<LoginMode>('password');

  // Password login state
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState('');

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');

  // Shared loading/message state
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);

  const hasError = params.get('error') === '1';

  function setError(m: string) { setMsg(m); setMsgIsError(true); }
  function setInfo(m: string) { setMsg(m); setMsgIsError(false); }
  function clearMsg() { setMsg(null); setMsgIsError(false); }

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[0]) {
    setCredential(acc.username);
    setPassword(acc.password);
    setMode('password');
    clearMsg();
  }

  async function requestEmailOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    clearMsg();
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail }),
      });
      const data = await res.json();
      if (data.sent) {
        setMode('link-sent');
      } else {
        setError(data.message ?? "Couldn't send the code. Try again.");
      }
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPhoneOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    clearMsg();
    try {
      const res = await fetch('/api/auth/request-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.sent) {
        setMode('otp-phone-verify');
        setInfo('OTP sent to +91 ' + phone.replace(/\D/g, '').slice(-10));
      } else {
        setError(data.message ?? "Couldn't send OTP. Try again.");
      }
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearMsg();
    try {
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: phoneOtp }),
      });
      const data = await res.json();
      if (data.ok && data.dest) {
        window.location.href = data.dest;
      } else {
        setError(data.error ?? 'Incorrect OTP. Try again.');
      }
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Gradient banner */}
      <a
        href="/cat-readiness"
        className="flex items-center justify-between gap-3 w-full px-4 py-3.5 transition-all group shrink-0"
        style={{ background: 'linear-gradient(90deg, #ea580c 0%, #d97706 60%, #f59e0b 100%)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-base leading-none">🎯</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block bg-white/20 border border-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">FREE</span>
              <p className="text-sm font-bold text-white">Claim your free IIM buddy session</p>
            </div>
            <p className="text-xs text-orange-100 mt-0.5">2 min · 10 quick taps · no signup needed</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white shrink-0 group-hover:translate-x-1 transition-transform" />
      </a>

      <div className="flex-1 flex items-center justify-center p-6">
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

          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">

            {/* ── Password login ── */}
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

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setMode('otp-phone'); clearMsg(); }}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 px-3 border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 font-medium"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Mobile OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('otp-email'); clearMsg(); }}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 px-3 border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 font-medium"
                  >
                    <Mail className="w-3.5 h-3.5" /> Email link
                  </button>
                </div>
              </>
            )}

            {/* ── Phone OTP — enter number ── */}
            {mode === 'otp-phone' && (
              <form onSubmit={requestPhoneOtp} className="space-y-4">
                <div className="text-center mb-2">
                  <p className="text-sm font-semibold text-stone-900">Login with mobile OTP</p>
                  <p className="text-xs text-stone-500 mt-1">We'll send a 6-digit code to your number via SMS.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm font-medium text-stone-500 select-none">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      required
                      maxLength={10}
                      className="w-full pl-12 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                    />
                  </div>
                </div>

                {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-stone-600')}>{msg}</p>}

                <button
                  type="submit"
                  disabled={loading || phone.replace(/\D/g, '').length < 10}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Sending…' : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
                </button>

                <div className="text-center">
                  <button type="button" onClick={() => { setMode('password'); clearMsg(); }} className="text-xs text-stone-500 hover:text-stone-700">
                    ← Back to password login
                  </button>
                </div>
              </form>
            )}

            {/* ── Phone OTP — enter code ── */}
            {mode === 'otp-phone-verify' && (
              <form onSubmit={verifyPhoneOtp} className="space-y-4">
                <div className="text-center mb-2">
                  <div className="w-12 h-12 bg-teal-50 border border-teal-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Smartphone className="w-5 h-5 text-teal-600" />
                  </div>
                  <p className="text-sm font-semibold text-stone-900">Enter the OTP</p>
                  <p className="text-xs text-stone-500 mt-1">Sent to +91 {phone.replace(/\D/g, '').slice(-10)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">6-digit OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    maxLength={6}
                    className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>

                {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-teal-600')}>{msg}</p>}

                <button
                  type="submit"
                  disabled={loading || phoneOtp.length < 4}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Verifying…' : <>Verify & sign in <ArrowRight className="w-4 h-4" /></>}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button type="button" onClick={() => { setMode('otp-phone'); clearMsg(); }} className="text-stone-500 hover:text-stone-700">
                    ← Change number
                  </button>
                  <button
                    type="button"
                    onClick={() => requestPhoneOtp()}
                    disabled={loading}
                    className="font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                  >
                    {loading ? 'Sending…' : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Email OTP — enter email ── */}
            {mode === 'otp-email' && (
              <form onSubmit={requestEmailOtp} className="space-y-4">
                <div className="text-center mb-2">
                  <p className="text-sm font-semibold text-stone-900">Login with email link</p>
                  <p className="text-xs text-stone-500 mt-1">We'll send a one-click login link to your email.</p>
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

                {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-stone-600')}>{msg}</p>}

                <button
                  type="submit"
                  disabled={loading || !otpEmail.includes('@')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Sending…' : <>Send login link <ArrowRight className="w-4 h-4" /></>}
                </button>

                <div className="text-center">
                  <button type="button" onClick={() => { setMode('password'); clearMsg(); }} className="text-xs text-stone-500 hover:text-stone-700">
                    ← Back to password login
                  </button>
                </div>
              </form>
            )}

            {/* ── Email link sent ── */}
            {mode === 'link-sent' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-teal-50 border border-teal-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-5 h-5 text-teal-600" />
                  </div>
                  <p className="text-sm font-semibold text-stone-900">Check your inbox</p>
                  <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                    We sent a login link to{' '}
                    <span className="font-semibold text-stone-700">{otpEmail}</span>.{' '}
                    Click it to log in — no code needed.
                  </p>
                </div>

                {msg && <p className={cn('text-xs text-center', msgIsError ? 'text-rose-600' : 'text-stone-600')}>{msg}</p>}

                <div className="flex items-center justify-between text-xs pt-1">
                  <button type="button" onClick={() => { setMode('otp-email'); clearMsg(); }} className="text-stone-500 hover:text-stone-700">
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => requestEmailOtp()}
                    disabled={loading}
                    className="font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                  >
                    {loading ? 'Sending…' : 'Resend link'}
                  </button>
                </div>
              </div>
            )}

            {/* Demo accounts — password mode only */}
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
