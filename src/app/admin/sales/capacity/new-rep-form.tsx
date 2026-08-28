'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PART_TIME_REQUIRED_FIELDS } from '@/lib/sales-rep-provisioning';

// Onboarding a rep, on the screen that already governs what a rep can hold.
//
// The form is deliberately asymmetric: choosing FULL-TIME shows almost nothing
// (the table's defaults ARE the full-time week, and they are shown read-only so
// nobody has to guess what they inherited), while choosing PART-TIME opens the
// numbers and refuses to submit until they are filled in. That asymmetry is the
// whole feature — "part-time" with unstated numbers is a full-time seat wearing
// a different word.
//
// The password field posts once, to Supabase Auth, and is never stored here or
// on our side of the wall. There is no "show existing password" anywhere,
// because we never have one.

const FULL_TIME_DEFAULTS = { work_days: [1, 2, 3, 4, 5, 6], work_start_ist: '10:00', work_end_ist: '19:00', max_capacity_units: 50, max_new_per_day: 15 };
const DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']] as const;

export function NewRepForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'attach'>('create');
  const [employment, setEmployment] = useState<'full_time' | 'part_time'>('part_time');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startIst, setStartIst] = useState('');
  const [endIst, setEndIst] = useState('');
  const [capacity, setCapacity] = useState('');
  const [perDay, setPerDay] = useState('');
  // Pay, stated at hire. Rupees in the box, paise on the wire.
  const [fixedRs, setFixedRs] = useState('');
  const [incentivePct, setIncentivePct] = useState('');

  // Mirrors checkEmploymentStatement on the server. The server is the
  // authority; this only saves a round trip and names the same missing fields.
  const partTimeGaps = employment !== 'part_time' ? [] : [
    days.length === 0 ? 'work_days' : null,
    startIst ? null : 'work_start_ist',
    endIst ? null : 'work_end_ist',
    capacity ? null : 'max_capacity_units',
    perDay ? null : 'max_new_per_day',
    fixedRs === '' ? 'monthly_fixed_paise' : null,
    incentivePct === '' ? 'incentive_percent' : null,
  ].filter(Boolean) as string[];

  async function submit() {
    setMsg(null);
    if (partTimeGaps.length > 0) {
      setMsg({ kind: 'err', text: `Part-time needs its own numbers: ${partTimeGaps.join(', ')}. There is no part-time default.` });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { mode, employment_type: employment, fullName, phone: phone || undefined };
      if (mode === 'create') { body.email = email; body.password = password; } else { body.userId = userId; }
      if (employment === 'part_time') {
        body.work_days = days;
        body.work_start_ist = startIst;
        body.work_end_ist = endIst;
        body.max_capacity_units = Number(capacity);
        body.max_new_per_day = Number(perDay);
        body.monthly_fixed_paise = Math.round(Number(fixedRs) * 100);
        body.incentive_percent = Number(incentivePct);
      }
      const res = await fetch('/api/admin/create-sales-rep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: 'err', text: data.error ?? 'Could not create the rep.' }); return; }
      setMsg({ kind: 'ok', text: `${fullName || data.email} can now sign in and reach /sales. Their capacity row is live below.` });
      setPassword(''); setEmail(''); setFullName(''); setPhone(''); setUserId('');
      setFixedRs(''); setIncentivePct('');
      router.refresh();
    } catch {
      setMsg({ kind: 'err', text: 'Network error — nothing was created.' });
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-dashed border-stone-300 bg-white py-3 text-[13px] font-bold text-stone-700 hover:bg-stone-50">
        + Add a sales rep
      </button>
    );
  }

  const input = 'w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-[13px]';
  const label = 'text-[11px] font-bold uppercase tracking-wide text-stone-500';

  return (
    <div className="mt-3 rounded-2xl border border-stone-300 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-stone-900">Add a sales rep</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-stone-500">Cancel</button>
      </div>

      <div className="mt-3 flex gap-1.5">
        {(['create', 'attach'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setMsg(null); }}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${mode === m ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-700'}`}>
            {m === 'create' ? 'Create the login here' : 'Attach a Supabase user'}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        {mode === 'create'
          ? 'CareerRai calls the Supabase Auth admin API — the same path the dashboard’s Add user button uses. The password goes straight to Supabase and is never stored by CareerRai.'
          : 'Use this when the login was already created in the Supabase Dashboard. Nothing about authentication is touched; only the CareerRai profile and capacity row are written.'}
      </p>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="block"><span className={label}>Full name</span>
          <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Their real name" /></label>
        {mode === 'create' ? (
          <>
            <label className="block"><span className={label}>Work email</span>
              <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@careerrai.in" /></label>
            <label className="block"><span className={label}>Phone (optional, enables phone login)</span>
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" /></label>
            <label className="block"><span className={label}>Password (min 10 chars)</span>
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </>
        ) : (
          <label className="block"><span className={label}>Supabase auth user id</span>
            <input className={input} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid from the Authentication tab" /></label>
        )}
      </div>

      <div className="mt-3">
        <span className={label}>Employment</span>
        <div className="mt-1 flex gap-1.5">
          {(['full_time', 'part_time'] as const).map((e) => (
            <button key={e} type="button" onClick={() => { setEmployment(e); setMsg(null); }}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${employment === e ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-700'}`}>
              {e === 'full_time' ? 'Full-time' : 'Part-time'}
            </button>
          ))}
        </div>
      </div>

      {employment === 'full_time' ? (
        <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[11.5px] text-stone-600">
          Full-time uses the standing configuration: {FULL_TIME_DEFAULTS.work_days.length} days a week,{' '}
          {FULL_TIME_DEFAULTS.work_start_ist}–{FULL_TIME_DEFAULTS.work_end_ist} IST, {FULL_TIME_DEFAULTS.max_capacity_units} units
          of active work, {FULL_TIME_DEFAULTS.max_new_per_day} new leads a day. Change any of it afterwards from this screen.
        </p>
      ) : (
        <>
          <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-[11.5px] text-indigo-900">
            Part-time has <strong>no defaults</strong>. If these were left to inherit the full-time week, part-time would be
            a word rather than a working arrangement — so all five are required: {PART_TIME_REQUIRED_FIELDS.join(', ')}.
          </p>
          <div className="mt-2">
            <span className={label}>Working days</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {DAYS.map(([v, n]) => {
                const d = Number(v);
                const on = days.includes(d);
                return (
                  <button key={v} type="button" onClick={() => setDays((c) => on ? c.filter((x) => x !== d) : [...c, d])}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-bold ${on ? 'bg-indigo-600 text-white' : 'border border-stone-300 text-stone-600'}`}>{n}</button>
                );
              })}
            </div>
          </div>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-4">
            <label className="block"><span className={label}>Start (IST)</span>
              <input className={input} type="time" value={startIst} onChange={(e) => setStartIst(e.target.value)} /></label>
            <label className="block"><span className={label}>End (IST)</span>
              <input className={input} type="time" value={endIst} onChange={(e) => setEndIst(e.target.value)} /></label>
            <label className="block"><span className={label}>Active work units</span>
              <input className={input} type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
            <label className="block"><span className={label}>New leads / day</span>
              <input className={input} type="number" min={1} max={100} value={perDay} onChange={(e) => setPerDay(e.target.value)} /></label>
          </div>

          {/* Pay, stated at hire (28 Aug 2026). Same rule as the hours above:
              there is no part-time default, and a seat whose payslip cannot be
              computed is as unfinished as one with no working week. */}
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
            <label className="block"><span className={label}>Fixed fee / month (₹)</span>
              <input className={input} type="number" min={0} step={1} value={fixedRs}
                onChange={(e) => setFixedRs(e.target.value)} placeholder="8000" /></label>
            <label className="block"><span className={label}>Incentive on conversions (%)</span>
              <input className={input} type="number" min={0} max={100} step={0.5} value={incentivePct}
                onChange={(e) => setIncentivePct(e.target.value)} placeholder="10" /></label>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">
            Both are required and neither has a default. The percentage applies
            to what a student actually pays, per conversion, and a refund
            withdraws only that one. Enter <strong>0%</strong> for a
            fixed-pay-only seat — that is a real answer; leaving it blank is not,
            and would show them “terms not set” instead of a payslip.
          </p>
        </>
      )}

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>
      )}

      <button type="button" onClick={submit} disabled={busy}
        className="mt-3 w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
        {busy ? 'Creating…' : mode === 'create' ? 'Create the login and the sales seat' : 'Provision this user as a sales rep'}
      </button>
    </div>
  );
}
