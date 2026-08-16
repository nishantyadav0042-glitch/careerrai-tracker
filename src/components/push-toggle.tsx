'use client';
import { useState, useEffect } from 'react';
import { track, detectDisplayMode } from '@/lib/journey';
import { Bell, BellOff, Check, X, Loader2 } from 'lucide-react';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';
import { PUSH_REPAIR_COPY } from '@/lib/push-state';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// The `vapidKey` prop is ignored on purpose: the public key is ALWAYS fetched
// from /api/push/vapid-public-key so it matches the private key the server signs
// with (both are DB-authoritative). Passing a build-time env key here caused a
// key mismatch that made every push silently fail.
type StepStatus = 'running' | 'ok' | 'fail';
interface DiagStep { label: string; status: StepStatus; detail?: string }

// `broken` = the student asked for reminders and the server holds no live
// subscription. Before this existed, that student saw the switch ON, because
// `initialEnabled` was fed the PREFERENCE. Measured 9 Aug: 42 students in that
// state, average 18 days, every one of them told their reminders were working.
//
// The repair is the same code path as enabling for the first time — that is the
// point. PushHealer cannot fix these students silently, because it deliberately
// never prompts and their OS permission is often the thing that lapsed. Only a
// tap can call requestPermission(), so the tap has to be asked for.
export function PushToggle({
  initialEnabled, broken = false, daysStopped = null,
}: { initialEnabled: boolean; broken?: boolean; daysStopped?: number | null; vapidKey?: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [denied, setDenied] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  // Live, on-device diagnostic of the subscribe pipeline. Each tap rebuilds it so
  // a real device can SEE exactly which step fails instead of a silent dead toggle.
  const [steps, setSteps] = useState<DiagStep[]>([]);

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        // The id is a real notifications.id now (15 Aug fix) — received_at and
        // clicked_at for this exact row fill in from the device as the service
        // worker's beacons fire, so it is checkable, not just a toast.
        const idNote = data.notificationId ? ` (id: ${String(data.notificationId).slice(0, 8)}…)` : '';
        setTestMsg(`Sent! You should see a notification in a second.${idNote}`);
      } else {
        // Surface the server's exact reason (no_subscription / vapid_not_configured /
        // send_failed_<code>) so a failed delivery is diagnosable, not silent.
        const reason = data.reason ? ` (${data.reason})` : '';
        setTestMsg((data.message ?? 'Could not send the test.') + reason);
      }
    } catch {
      setTestMsg('Could not send the test. Check your connection.');
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-capability detection must run client-side after mount */
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // iOS only exposes the Push API to an INSTALLED PWA (Add to Home Screen).
    if (isIOS() && !isStandalone()) {
      setIosNeedsInstall(true);
      setSupported(false);
      return;
    }
    setSupported(ok);
    if (ok) setDenied(Notification.permission === 'denied');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (iosNeedsInstall) {
    return (
      <p className="text-xs text-stone-500">
        To get alerts on iPhone, first add CareerRai to your Home Screen (Share → Add to Home Screen),
        open it from there, then turn alerts on.
      </p>
    );
  }
  if (!supported) {
    return <p className="text-xs text-stone-400">Push notifications aren&apos;t supported in this browser.</p>;
  }

  // Step helpers — push a running step, then mark it ok/fail. Rendered live so the
  // user (and we, from a screenshot) can see exactly where push breaks.
  function startStep(label: string) {
    setSteps((prev) => [...prev, { label, status: 'running' }]);
  }
  function endStep(status: StepStatus, detail?: string) {
    setSteps((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, status, detail } : s)));
  }

  async function enablePush() {
    setSteps([]);

    // 1. Permission
    startStep('Asking for notification permission');
    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      endStep('fail', 'You blocked notifications. Tap the lock icon in the address bar → allow.');
      setDenied(true);
      return;
    }
    if (permission !== 'granted') {
      endStep('fail', 'Permission dismissed — tap the toggle again and choose Allow.');
      return;
    }
    endStep('ok', 'Granted');

    // 2. The public key — from the server (DB) so it matches the signing key.
    startStep('Getting the server push key');
    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    if (!keyRes.ok) { endStep('fail', `Server key not configured (HTTP ${keyRes.status}).`); setError('Push isn’t configured on the server yet.'); return; }
    const { key: publicKey } = await keyRes.json();
    if (!publicKey) { endStep('fail', 'Server returned an empty key.'); setError('Push isn’t configured on the server yet.'); return; }
    endStep('ok');

    // 3. Subscribe on the (globally-registered) service worker.
    startStep('Connecting the service worker');
    await navigator.serviceWorker.register('/sw.js'); // no-op if already registered
    const reg = await navigator.serviceWorker.ready;
    endStep('ok');

    startStep('Subscribing with your browser');
    // Reuse a healthy sub bound to the current key; rotate only on a key change.
    // The old blind unsubscribe()+subscribe() rotated the endpoint every time,
    // which stranded a corpse whenever the persist that follows failed.
    let sub: PushSubscription;
    try {
      sub = await getLiveSubscription(reg, publicKey);
    } catch (e) {
      endStep('fail', e instanceof Error ? e.message : 'Your browser/network blocked the push service.');
      throw e;
    }
    endStep('ok');

    // 4. Persist (retried).
    startStep('Saving to your account');
    const { ok, reason } = await persistSubscription(sub, detectDisplayMode());
    if (!ok) { endStep('fail', 'Could not save to the server.'); throw new Error(`persist failed: ${reason}`); }
    track('push_enabled', { context: detectDisplayMode(), source: 'push_toggle' });
    endStep('ok', 'Subscribed — now tap “Send a test alert”.');
    setEnabled(true);
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    await fetch('/api/push/subscribe', { method: 'DELETE' });
    setEnabled(false);
  }

  async function toggle() {
    if (denied) return;
    setLoading(true);
    setError(null);
    try {
      if (!enabled) await enablePush();
      else await disablePush();
    } catch (err) {
      console.error('Push toggle failed:', err);
      setError(err instanceof Error ? `Couldn’t enable push: ${err.message}` : 'Couldn’t enable push alerts.');
    } finally {
      setLoading(false);
    }
  }

  // Broken and not yet repaired in this session: lead with the truth, and make
  // the fix the obvious thing to touch. Stated as a loss ("your reminders have
  // stopped"), never as a setting, and never as something they did wrong.
  const showRepair = broken && !enabled;

  return (
    <div className="space-y-2">
      {showRepair && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="text-sm font-bold text-amber-900">{PUSH_REPAIR_COPY.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {daysStopped !== null
              ? `You haven't had a reminder in ${daysStopped} day${daysStopped === 1 ? '' : 's'}. `
              : ''}
            {PUSH_REPAIR_COPY.body}
          </p>
          <button
            type="button"
            onClick={toggle}
            disabled={loading || denied}
            className="mt-2.5 w-full rounded-lg bg-amber-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            {loading ? 'Turning them back on…' : PUSH_REPAIR_COPY.cta}
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {enabled ? <Bell className="w-4 h-4 text-teal-700 shrink-0" /> : <BellOff className="w-4 h-4 text-stone-400 shrink-0" />}
          <div className="min-w-0">
            <span className="text-sm font-medium text-stone-800">Browser push alerts</span>
            {denied && (
              <p className="text-xs text-stone-400 mt-0.5">
                Blocked in browser settings — tap the lock icon in your address bar to allow.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading || denied}
          aria-label={enabled ? 'Disable push alerts' : 'Enable push alerts'}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-teal-700' : 'bg-stone-300'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {steps.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-stone-50 border border-stone-200 p-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {s.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin" />}
                {s.status === 'ok' && <Check className="w-3.5 h-3.5 text-teal-600" />}
                {s.status === 'fail' && <X className="w-3.5 h-3.5 text-red-500" />}
              </span>
              <span className="min-w-0">
                <span className={s.status === 'fail' ? 'text-red-600 font-medium' : 'text-stone-700'}>{s.label}</span>
                {s.detail && <span className="block text-stone-500">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {enabled && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="text-xs font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800 disabled:opacity-50"
          >
            {testing ? 'Sending…' : 'Send a test alert'}
          </button>
          {testMsg && <span className="text-xs text-stone-500">{testMsg}</span>}
        </div>
      )}
    </div>
  );
}
