'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Smartphone, Sparkles, PlayCircle, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { AddToHomeScreenBanner } from '@/components/add-to-home-screen';
import { cn } from '@/lib/utils';

type LoginMode = 'otp-phone' | 'otp-phone-verify' | 'password';
type UserType = 'student' | 'buddy' | null;

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
    setMode('otp-phone');
    setPhone('');
    setPhoneOtp('');
    setCredential('');
    clearMsg();
  }

  function goBack() {
    setUserType(null);
    setMode('otp-phone');
    setPhone('');
    setPhoneOtp('');
    clearMsg();
  }

  const activePhone = phone;

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
              Who&apos;s checking your<br />
              <span className="italic text-orange-600">CAT prep?</span>
            </h1>
            <p className="mt-3 text-sm text-stone-600">Nobody? That&apos;s the problem. Get an IIM senior who does.</p>
            <p className="mt-2 text-base font-bold text-stone-800" style={{ fontFamily: 'Georgia, serif' }}>
              Your exam. Our IIM buddy. One honest plan to your dream.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block shrink-0" />
                200+ IIM mentors ready
              </span>
              <span className="text-xs text-stone-500 italic">Founding cohort — be among the first</span>
            </div>
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

          {/* ₹999 + refund trust badge — always visible */}
          <div className="flex items-start gap-3 bg-stone-900 rounded-xl px-4 py-3 mb-4 shadow-lg">
            <span className="text-lg shrink-0 mt-0.5">🛡️</span>
            <div>
              <p className="text-sm font-bold text-white">Starts at <span className="text-orange-400">₹999/month</span></p>
              <p className="text-xs text-stone-300 mt-0.5 leading-relaxed">First month: full refund if you don&apos;t feel the value — just log in regularly for 20 days. If we don&apos;t help, you get your money back. No questions asked.</p>
            </div>
          </div>

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
                      {userType === 'student' ? '🎓' : '👤'}
                    </span>
                    <span className={cn(
                      'text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
                      userType === 'student' ? 'bg-stone-100 text-stone-700' :
                      'bg-teal-100 text-teal-700'
                    )}>
                      {userType}
                    </span>
                  </div>
                </div>

                {/* OTP: enter phone */}
                {mode === 'otp-phone' && (
                  <form onSubmit={requestPhoneOtp} className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-stone-900 mb-0.5">Login with mobile OTP</p>
                      <p className="text-xs text-stone-500">
                        We&apos;ll send a 6-digit code via SMS.
                      </p>
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
                          autoFocus
                          className="w-full pl-12 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        />
                      </div>
                    </div>

                    {msg && <p className={cn('text-xs', msgIsError ? 'text-rose-600' : 'text-stone-600')}>{msg}</p>}

                    <button
                      type="submit"
                      disabled={loading || activePhone.replace(/\D/g, '').length < 10}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50',
                        userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' :
                        'bg-teal-700 hover:bg-teal-800'
                      )}
                    >
                      {loading ? 'Sending…' : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
                    </button>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => { setMode('password'); clearMsg(); }}
                        className="text-xs text-stone-500 hover:text-stone-800 font-medium"
                      >
                        Login with password instead
                      </button>
                    </div>
                  </form>
                )}

                {/* OTP: enter code */}
                {mode === 'otp-phone-verify' && (
                  <form onSubmit={verifyPhoneOtp} className="space-y-4">
                    <div className="text-center mb-2">
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3',
                        userType === 'buddy' ? 'bg-teal-50 border border-teal-200' :
                        'bg-stone-100 border border-stone-200'
                      )}>
                        <Smartphone className={cn(
                          'w-5 h-5',
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
                      disabled={loading || phoneOtp.length < 6}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50',
                        userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' :
                        'bg-teal-700 hover:bg-teal-800'
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
                          Login with password
                        </p>
                        <p className="text-xs text-stone-500">
                          Enter your mobile number and password.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
                        <div className="relative flex items-center">
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
                        <p className="text-xs text-rose-600">Incorrect password. Try again.</p>
                      )}

                      <button
                        type="submit"
                        className={cn(
                          'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98]',
                          userType === 'student' ? 'bg-stone-900 hover:bg-stone-800' : 'bg-teal-700 hover:bg-teal-800'
                        )}
                      >
                        Sign in <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>

                    <div className="text-center mt-4">
                      <button
                        type="button"
                        onClick={() => { setMode('otp-phone'); clearMsg(); }}
                        className="text-xs text-stone-500 hover:text-stone-800 font-medium"
                      >
                        ← Back to mobile OTP
                      </button>
                    </div>
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

          {/* Our IIM Buddies */}
          <div className="mt-8">
            <h2 className="text-lg font-bold text-stone-900 mb-1 text-center" style={{ fontFamily: 'Georgia, serif' }}>
              Our IIM Buddies
            </h2>
            <p className="text-xs text-center text-stone-500 mb-4">IIM graduates. CAT crackers. Your elder sibling in the exam.</p>
            <div className="space-y-3">
              {([
                { emoji: '🎓', title: 'IIM graduates who cracked CAT', desc: 'Every buddy cleared CAT — 95th+ percentile. They know the exact moves that work, not just the theory.' },
                { emoji: '❤️', title: 'Elder sibling energy, not a teacher', desc: 'No scripted lectures. Honest feedback, daily check-ins, and someone who actually cares if you show up.' },
                { emoji: '📊', title: 'Strategy built around your gaps', desc: 'Your buddy studies your mocks, spots your patterns, and adjusts the plan week by week — not batch by batch.' },
              ] as { emoji: string; title: string; desc: string }[]).map(({ emoji, title, desc }) => (
                <div key={title} className="flex gap-3 p-4 bg-white border border-stone-200 rounded-xl shadow-sm">
                  <span className="text-xl shrink-0 mt-0.5">{emoji}</span>
                  <div>
                    <p className="text-sm font-bold text-stone-900">{title}</p>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What happens after you sign up */}
          <div className="mt-8">
            <h2 className="text-lg font-bold text-stone-900 mb-1 text-center" style={{ fontFamily: 'Georgia, serif' }}>
              What happens after you sign up
            </h2>
            <p className="text-xs text-center text-stone-500 mb-4">Your buddy&apos;s role + your journey — in one clear sequence.</p>
            <div className="space-y-3">
              {([
                { step: '01', title: 'You get matched', desc: 'We pair you with an IIM buddy whose CAT profile fits your weak areas — not randomly, intentionally.' },
                { step: '02', title: 'Your buddy tracks you daily', desc: 'Log your study hours each day. Your buddy sees it, nudges you when you slip, and keeps you honest.' },
                { step: '03', title: 'Weekly strategy sessions', desc: 'Review mock results together, spot the real gaps, and adjust the plan — every week till CAT day.' },
                { step: '04', title: 'You stay consistent', desc: "Consistency beats intensity. One honest plan, one IIM senior holding you to it — that's the actual edge." },
              ] as { step: string; title: string; desc: string }[]).map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4 p-4 bg-stone-50 border border-stone-100 rounded-xl">
                  <span className="text-xs font-black text-orange-500 shrink-0 mt-0.5 tabular-nums w-5">{step}</span>
                  <div>
                    <p className="text-sm font-bold text-stone-900">{title}</p>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-stone-500">
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
