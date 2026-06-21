'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Smartphone, Sparkles, PlayCircle, Lock, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { AddToHomeScreenBanner } from '@/components/add-to-home-screen';
import { cn } from '@/lib/utils';

type LoginMode = 'otp-phone' | 'otp-phone-verify' | 'password';
type UserType = 'student' | 'buddy' | 'admin' | null;

const ADMIN_PHONE = '7015269714';

function LoginForm() {
  const params = useSearchParams();
  const [userType, setUserType] = useState<UserType>(null);
  const [mode, setMode] = useState<LoginMode>('otp-phone');

  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);

  const hasError = params.get('error') === '1';

  function setError(m: string) { setMsg(m); setMsgIsError(true); }
  function setInfo(m: string) { setMsg(m); setMsgIsError(false); }
  function clearMsg() { setMsg(null); setMsgIsError(false); }

  function selectRole(role: UserType) {
    setUserType(role);
    // Admin uses password-only login — skip OTP entirely.
    setMode(role === 'admin' ? 'password' : 'otp-phone');
    setPhone(role === 'admin' ? ADMIN_PHONE : '');
    setPhoneOtp('');
    setCredential(role === 'admin' ? ADMIN_PHONE : '');
    clearMsg();
  }

  function goBack() {
    setUserType(null);
    setMode('otp-phone');
    setPhone('');
    setPhoneOtp('');
    clearMsg();
  }

  const activePhone = userType === 'admin' ? ADMIN_PHONE : phone;
  const isAdminLocked = userType === 'admin';

  async function startDemo() {
    setDemoLoading(true);
    clearMsg();
    try {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.dest) {
        window.location.href = data.dest;
      } else {
        setError(data.error ?? 'Demo is temporarily unavailable.');
        setDemoLoading(false);
      }
    } catch {
      setError('No connection. Try again.');
      setDemoLoading(false);
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
        body: JSON.stringify({ phone: activePhone }),
      });
      const data = await res.json();
      if (data.sent) {
        setMode('otp-phone-verify');
        setInfo('OTP sent to +91 ' + activePhone.replace(/\D/g, '').slice(-10));
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
        body: JSON.stringify({ phone: activePhone, token: phoneOtp, userType }),
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
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-96 h-96 bg-orange-100 rounded-full opacity-40 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-teal-100 rounded-full opacity-40 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Logo + headline */}
          <div className="text-center mb-6">
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
            <h1 className="text-3xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Track every day.<br />
              <span className="italic text-orange-600">Outwork yesterday.</span>
            </h1>
            <p className="mt-3 text-sm text-stone-600">Daily prep tracking with your IIM buddy.</p>
          </div>

          {/* CTA banner */}
          <a
            href="/cat-readiness"
            className="group relative block overflow-hidden rounded-2xl p-[1.5px] mb-4 shadow-lg shadow-orange-900/10"
            style={{ background: 'linear-gradient(90deg, #ea580c 0%, #d97706 55%, #f59e0b 100%)' }}
          >
            <div className="flex items-center justify-between gap-3 rounded-[15px] bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 text-lg leading-none">🎯</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block bg-white/25 border border-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">Free</span>
                    <p className="text-sm font-bold text-white">Claim your free IIM buddy session</p>
                  </div>
                  <p className="text-xs text-orange-50 mt-0.5">2 min · 10 quick taps · no signup needed</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>

          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">

            {/* ── STEP 1: Role picker ── */}
            {userType === null && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <p className="text-base font-bold text-stone-900">Who are you?</p>
                  <p className="text-xs text-stone-500 mt-1">Pick your role to continue</p>
                </div>

                <button
                  type="button"
                  onClick={() => selectRole('student')}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-stone-100 group-hover:bg-stone-900 flex items-center justify-center text-2xl transition-colors shrink-0">
                    🎓
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-stone-900">Student</p>
                    <p className="text-xs text-stone-500">I&apos;m preparing for CAT</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-stone-900 ml-auto transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => selectRole('buddy')}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-teal-100 hover:border-teal-600 hover:bg-teal-50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-50 group-hover:bg-teal-600 flex items-center justify-center text-2xl transition-colors shrink-0">
                    👤
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-stone-900">Buddy</p>
                    <p className="text-xs text-stone-500">I&apos;m an IIM mentor</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-teal-600 ml-auto transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => selectRole('admin')}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-orange-100 hover:border-orange-600 hover:bg-orange-50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-50 group-hover:bg-orange-600 flex items-center justify-center transition-colors shrink-0">
                    <Lock className="w-5 h-5 text-orange-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-stone-900">Admin</p>
                    <p className="text-xs text-stone-500">Restricted access only</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-orange-600 ml-auto transition-colors" />
                </button>
              </div>
            )}

            {/* ── STEP 2: Login form ── */}
            {userType !== null && (
              <div>
                {/* Role header */}
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-stone-100">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {userType === 'student' ? '🎓' : userType === 'buddy' ? '👤' : '🔐'}
                    </span>
                    <span className={cn(
                      'text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
                      userType === 'student' ? 'bg-stone-100 text-stone-700' :
                      userType === 'buddy' ? 'bg-teal-100 text-teal-700' :
                      'bg-orange-100 text-orange-700'
                    )}>
                      {userType}
                    </span>
                    {isAdminLocked && (
                      <span className="text-xs text-stone-400">· Authorised number only</span>
                    )}
                  </div>
                </div>

                {/* OTP: enter phone */}
                {mode === 'otp-phone' && (
                  <form onSubmit={requestPhoneOtp} className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-stone-900 mb-0.5">Login with mobile OTP</p>
                      <p className="text-xs text-stone-500">
                        {isAdminLocked ? 'OTP will be sent to the authorised admin number.' : "We'll send a 6-digit code via SMS."}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-sm font-medium text-stone-500 select-none">+91</span>
                        {isAdminLocked ? (
                          <input
                            type="tel"
                            value={ADMIN_PHONE}
                            readOnly
                            className="w-full pl-12 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-500 cursor-not-allowed font-mono tracking-wider"
                          />
                        ) : (
                          <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="9876543210"
                            required
                            maxLength={10}
                            autoFocus
                            className="w-full pl-12 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                          />
                        )}
                        {isAdminLocked && <Lock className="absolute right-3 w-4 h-4 text-stone-400" />}
                      </div>
                    </div>

                    {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-stone-600')}>{msg}</p>}

                    <button
                      type="submit"
                      disabled={loading || (!isAdminLocked && activePhone.replace(/\D/g, '').length < 10)}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50',
                        userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' :
                        userType === 'buddy' ? 'bg-teal-700 hover:bg-teal-800' :
                        'bg-orange-600 hover:bg-orange-700'
                      )}
                    >
                      {loading ? 'Sending…' : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
                    </button>

                    {!isAdminLocked && (
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => { setMode('password'); clearMsg(); }}
                          className="text-xs text-stone-500 hover:text-stone-800 font-medium"
                        >
                          Login with password instead
                        </button>
                      </div>
                    )}
                  </form>
                )}

                {/* OTP: enter code */}
                {mode === 'otp-phone-verify' && (
                  <form onSubmit={verifyPhoneOtp} className="space-y-4">
                    <div className="text-center mb-2">
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3',
                        userType === 'admin' ? 'bg-orange-50 border border-orange-200' :
                        userType === 'buddy' ? 'bg-teal-50 border border-teal-200' :
                        'bg-stone-100 border border-stone-200'
                      )}>
                        <Smartphone className={cn(
                          'w-5 h-5',
                          userType === 'admin' ? 'text-orange-600' :
                          userType === 'buddy' ? 'text-teal-600' : 'text-stone-700'
                        )} />
                      </div>
                      <p className="text-sm font-semibold text-stone-900">Enter the OTP</p>
                      <p className="text-xs text-stone-500 mt-1">Sent to +91 {activePhone.replace(/\D/g, '').slice(-10)}</p>
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
                        autoFocus
                        className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                      />
                    </div>

                    {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-teal-600')}>{msg}</p>}

                    <button
                      type="submit"
                      disabled={loading || phoneOtp.length < 4}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50',
                        userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' :
                        userType === 'buddy' ? 'bg-teal-700 hover:bg-teal-800' :
                        'bg-orange-600 hover:bg-orange-700'
                      )}
                    >
                      {loading ? 'Verifying…' : <>Verify & sign in <ArrowRight className="w-4 h-4" /></>}
                    </button>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        type="button"
                        onClick={() => { setMode('otp-phone'); clearMsg(); }}
                        className="text-stone-500 hover:text-stone-700"
                      >
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

                {/* Password login */}
                {mode === 'password' && (
                  <>
                    <form action="/api/auth/login" method="POST" className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-stone-900 mb-0.5">
                          {isAdminLocked ? 'Admin login' : 'Login with password'}
                        </p>
                        <p className="text-xs text-stone-500">
                          {isAdminLocked ? 'Enter your password to access the admin panel.' : 'Enter your mobile number and password.'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
                        <div className="relative flex items-center">
                          {isAdminLocked ? (
                            <>
                              <span className="absolute left-3 text-sm font-medium text-stone-400 select-none">+91</span>
                              <input
                                type="hidden"
                                name="credential"
                                value={ADMIN_PHONE}
                              />
                              <div className="w-full pl-12 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-500 font-mono tracking-wider">
                                {ADMIN_PHONE}
                              </div>
                              <Lock className="absolute right-3 w-4 h-4 text-stone-300" />
                            </>
                          ) : (
                            <>
                              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                              <input
                                type="tel"
                                inputMode="numeric"
                                name="credential"
                                value={credential}
                                onChange={(e) => setCredential(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="9876543210"
                                required
                                autoComplete="tel"
                                maxLength={10}
                                className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                              />
                            </>
                          )}
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
                            autoFocus={isAdminLocked}
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
                        <p className="text-xs text-rose-600">Incorrect password. Try again.</p>
                      )}

                      <button
                        type="submit"
                        className={cn(
                          'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98]',
                          userType === 'admin' ? 'bg-orange-600 hover:bg-orange-700' :
                          userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' : 'bg-teal-700 hover:bg-teal-800'
                        )}
                      >
                        Sign in <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>

                    {!isAdminLocked && (
                      <div className="text-center mt-4">
                        <button
                          type="button"
                          onClick={() => { setMode('otp-phone'); clearMsg(); }}
                          className="text-xs text-stone-500 hover:text-stone-800 font-medium"
                        >
                          ← Back to mobile OTP
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>

          {/* Live demo */}
          <button
            type="button"
            onClick={startDemo}
            disabled={demoLoading}
            className="group mt-4 w-full overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-teal-300 active:scale-[0.99] disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow">
                {demoLoading ? <Sparkles className="w-5 h-5 animate-pulse" /> : <PlayCircle className="w-6 h-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-stone-900">
                    {demoLoading ? 'Opening demo…' : 'See a live student demo'}
                  </p>
                  <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">View only</span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">
                  Step inside a real student&apos;s 30-day journey — no signup, nothing to break.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0 text-teal-600 transition-transform group-hover:translate-x-1" />
            </div>
          </button>

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
