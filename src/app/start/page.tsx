'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

// Freemium self-signup. Two fields (Name + Phone), phone-OTP, no password,
// no allowlist. On success the visitor lands straight in the free app.
// Meta ad CTA points here (optionally after previewing the public /demo).
type Step = 'form' | 'otp';

export default function StartPage() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep only digits, cap at 10 (Indian mobile).
  function onPhoneChange(v: string) {
    setPhone(v.replace(/\D/g, '').slice(0, 10));
  }

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError('Apna naam likho.'); return; }
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) { setError('Sahi 10-digit mobile number daalo.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.sent) {
        setStep('otp');
      } else {
        setError(data.message ?? 'OTP bhej nahi paaye. Dobara try karo.');
      }
    } catch {
      setError('Connection issue. Dobara try karo.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) { setError('6-digit code daalo.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp, name: name.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.dest) {
        window.location.href = data.dest;
      } else {
        setError(data.error ?? 'Code galat ya expire ho gaya.');
      }
    } catch {
      setError('Connection issue. Dobara try karo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo /></div>

        {step === 'form' ? (
          <form onSubmit={requestOtp} className="space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-xl font-bold text-stone-900">Apni CAT prep track karna shuru karo — app bilkul free 🎯</h1>
              <p className="text-sm text-stone-600">Ek IIM senior se tracking baad me; pehle app khud try karo.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Naam</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aapka naam"
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm focus:border-stone-900 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Mobile number</label>
                <div className="flex items-center rounded-xl border border-stone-300 focus-within:border-stone-900">
                  <span className="pl-4 pr-2 text-sm text-stone-500">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    placeholder="10-digit number"
                    className="w-full rounded-xl py-3 pr-4 text-sm focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-stone-400">OTP se verify, 10 second.</p>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Bhej rahe hain…' : 'Free access lo →'}
            </Button>
            <p className="text-center text-[11px] text-stone-400">
              Hum coaching nahi hain. Aapka data sirf aapki prep ke liye.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-xl font-bold text-stone-900">Code daalo 📲</h1>
              <p className="text-sm text-stone-600">
                +91 {phone} pe ek 6-digit code bheja hai — daalo aur seedha andar aao.
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-center text-lg tracking-[0.4em] focus:border-stone-900 focus:outline-none"
              autoFocus
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Verify ho raha hai…' : 'Andar aao →'}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('form'); setOtp(''); setError(null); }}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-700"
            >
              ← Number badalna hai
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
