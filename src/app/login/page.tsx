'use client';
import { useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Smartphone, ChevronLeft, KeyRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { InstallButton } from '@/components/install/install-button';
import { ContinueWithGoogle } from '@/components/auth/continue-with-google';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';

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
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);

  const errorParam = params.get('error');
  const hasError = errorParam === '1';
  const isLocked = errorParam === 'locked';
  const seatInactive = errorParam === 'seat_inactive';
  const sessionLost = errorParam === 'session_lost';

  function setError(m: string) { setMsg(m); setMsgIsError(true); }
  function setInfo(m: string) { setMsg(m); setMsgIsError(false); }
  function clearMsg() { setMsg(null); setMsgIsError(false); }

  // startMode lets the role picker send someone straight to password login.
  // App Review (28 Jul 2026, guideline 2.1) rejected 1.0 with "we were unable
  // to sign in as no password login was found": the reviewer cannot receive an
  // Indian SMS OTP, and the password path was a 12px grey link two steps deep.
  // Password login must stay reachable in one obvious tap from this page.
  function selectRole(role: UserType, startMode: LoginMode = 'otp-phone') {
    setUserType(role);
    setMode(startMode);
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

  // Counts how many OTPs one person needs. Production measured 830 sends
  // against 630 signups (1.32x) with no way to tell a first ask from a
  // resend — the retry rate was visible only as an SMS bill.
  const otpAsks = useRef(0);

  async function requestPhoneOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    clearMsg();
    otpAsks.current += 1;
    track(otpAsks.current === 1 ? 'auth_otp_requested' : 'auth_otp_resent',
      { surface: 'login', attempt: otpAsks.current });
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
        track('auth_otp_verified', { surface: 'login', asks: otpAsks.current });
        track('auth_identity_completed', { surface: 'login', method: 'phone_otp' });
        window.location.href = data.dest;
      } else {
        // The reason, never the code the student typed.
        track('auth_otp_failed', { surface: 'login', status: res.status });
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
                alt="CareerRai — By the students, for the students"
                width={132}
                height={124}
                style={{ height: 124, width: 'auto' }}
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-stone-900 tracking-tight leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Build Your <span className="italic text-orange-600">FREE</span><br />
              Personal CAT Study Plan
            </h1>
            <p className="mt-3 text-sm text-stone-600 leading-relaxed">
              Built around your preparation, your strengths and your available time.
              No more wondering what to study today, what to revise, or if you&apos;re
              on track — CareerRai plans it for you.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs font-medium text-stone-600">
              <span className="inline-flex items-center gap-1">
                <span className="text-teal-600">✓</span> Personalised for every student
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-teal-600">✓</span> Updates till CAT day
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-teal-600">✓</span> Built by CAT mentors
              </span>
            </div>
          </div>

          {/* Install-app CTA — prime real estate, pushes students to install the app */}
          <div className="mb-4">
            <InstallButton variant="banner" />
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">

            {/* Password-login failures redirect here as a full page load
                (/login?error=1 from api/auth/login), which resets all local
                state including userType back to the step-1 role picker —
                so this banner is driven purely by the URL param and shown
                regardless of step, or the error silently vanishes. */}
            {hasError && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                That didn&apos;t work — check your password (or number) and try again.
              </div>
            )}
            {isLocked && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
                Too many attempts. Please wait a few minutes and try again — or use mobile OTP to sign in.
              </div>
            )}
            {sessionLost && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
                Your session had expired by the time Google sent you back, so the connection
                couldn&apos;t be completed. Sign in again and retry — nothing was changed.
              </div>
            )}
            {seatInactive && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
                This counsellor account is no longer active. If that&apos;s unexpected, contact the CareerRai team.
              </div>
            )}

            {/* ── STEP 1: Role picker ── */}
            {userType === null && (
              <div className="space-y-3">
                {/* Goes to the funnel it names. This was selectRole('student'),
                    which only swapped this same screen to the phone field — so
                    a new student tapping "Build my free study plan" got asked
                    for a number and never saw a plan being built (founder,
                    1 Aug, watching a friend install the app). The questions
                    belong BEFORE the account, as on web. */}
                <Link
                  href="/start"
                  prefetch={false}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-900 bg-stone-900 hover:bg-stone-800 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl shrink-0">
                    🎓
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">Build my free study plan</p>
                    <p className="text-xs text-stone-300">I&apos;m preparing for CAT</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white ml-auto transition-transform group-hover:translate-x-0.5" />
                </Link>

                {/* Continue with Google — one tap, and it both signs up and
                    logs in, so it sits above the two mode-specific buttons
                    rather than inside either. Identity scopes only; a student
                    is never asked for calendar permission (see the component).
                    Mobile OTP and password stay exactly as visible as before —
                    Google is an addition, never a replacement, and nothing
                    here is required to pay. */}
                <div className="pt-1">
                  <ContinueWithGoogle />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1 bg-stone-200" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">or</span>
                  <span className="h-px flex-1 bg-stone-200" />
                </div>

                {/* Existing accounts: mobile OTP or password, both plainly
                    visible. Do not demote these to fine print — see the
                    selectRole note above (App Review guideline 2.1). */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => selectRole('student', 'otp-phone')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-3 text-xs font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
                  >
                    <Smartphone className="h-3.5 w-3.5" /> Log in with OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRole('student', 'password')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-3 text-xs font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Log in with password
                  </button>
                </div>

                <div className="pt-1 text-center">
                  <InstallButton variant="text" />
                </div>

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => selectRole('buddy')}
                    className="text-xs font-medium text-stone-400 hover:text-teal-700 transition-colors"
                  >
                    I&apos;m an IIM Buddy →
                  </button>
                </div>
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

                {/* Mode switch — a real, visible control on both login modes.
                    Hidden during OTP verification so the code entry stays
                    focused. See the selectRole note (App Review 2.1). */}
                {mode !== 'otp-phone-verify' && (
                  <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
                    {([
                      { m: 'otp-phone' as LoginMode, label: 'Mobile OTP' },
                      { m: 'password' as LoginMode, label: 'Password' },
                    ]).map(({ m, label }) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setMode(m); clearMsg(); }}
                        className={cn(
                          'rounded-lg py-2 text-xs font-bold transition-all',
                          mode === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* OTP: enter phone */}
                {mode === 'otp-phone' && (
                  <form onSubmit={requestPhoneOtp} className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-stone-900 mb-0.5">Log in with mobile OTP</p>
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
                      {loading ? 'Sending…' : <><span>Send OTP</span> <ArrowRight className="w-4 h-4" /></>}
                    </button>

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
                      {loading ? 'Verifying…' : <><span>Verify &amp; sign in</span> <ArrowRight className="w-4 h-4" /></>}
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
                          Log in with password
                        </p>
                        <p className="text-xs text-stone-500">
                          Use your mobile number, email or username.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-800 mb-1.5">
                          Mobile number, email or username
                        </label>
                        {/* Free text on purpose. /api/auth/login resolves a
                            phone, an email OR a username (see that route), but
                            this field used to strip every non-digit and cap at
                            10 — so an email or username was physically
                            untypeable. That is why App Review could not sign in
                            with the credentials they were given (guideline 2.1).
                            Do not re-add digit stripping here. */}
                        <input
                          type="text"
                          name="credential"
                          value={credential}
                          onChange={(e) => setCredential(e.target.value)}
                          placeholder="9876543210 or you@example.com"
                          required
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-800 mb-1.5">Password</label>
                        <div className="relative">
                          <input
                            type={showPass ? 'text' : 'password'}
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="········"
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
                  </>
                )}
              </div>
            )}

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
