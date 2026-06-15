'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { StudentPhoneLogin } from './student-phone-login';

const DEMO_PASSWORD = 'CareerRai2026!';
const DEMO_ACCOUNTS = [
  { label: 'Student · Aarav (recovery arc)', username: 'aarav', password: DEMO_PASSWORD },
  { label: 'Student · Priya (first-timer)', username: 'priya', password: DEMO_PASSWORD },
  { label: 'Student · Rohan (thriving)', username: 'rohan', password: DEMO_PASSWORD },
  { label: 'Student · Meera (lapsed)', username: 'meera', password: DEMO_PASSWORD },
  { label: 'Buddy (Nishant)', username: 'nishant', password: DEMO_PASSWORD },
  { label: 'Admin', username: 'admin', password: DEMO_PASSWORD },
];

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Students sign in with email + OTP; buddies/admins keep username + password.
  const [mode, setMode] = useState<'student' | 'staff'>('student');

  const hasError = params.get('error') === '1';

  function fillDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    setUsername(acc.username);
    setPassword(acc.password);
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

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">
          {/* Mode toggle: students use phone OTP, staff use username/password */}
          <div className="flex bg-stone-100 rounded-xl p-1 mb-5">
            {([['student', 'Student'], ['staff', 'Buddy · Admin']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                  mode === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'student' ? (
            <>
              <StudentPhoneLogin />
              <p className="mt-4 pt-4 border-t border-stone-200 text-[11px] text-stone-400 text-center">
                Demoing the product? Switch to{' '}
                <button type="button" onClick={() => setMode('staff')} className="font-semibold text-orange-600 hover:text-orange-700">
                  Buddy · Admin
                </button>{' '}
                for one-click demo logins.
              </p>
            </>
          ) : (
          <>
          {/* Native form POST — browser handles cookies + redirect, no JS in the auth flow */}
          <form action="/api/auth/login" method="POST" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Username</label>
              <input
                type="text"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your username"
                required
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
                  placeholder="••••••••"
                  required
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
              <p className="text-xs text-rose-600">Username or password incorrect. Try a demo account below.</p>
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
          </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-500">
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
