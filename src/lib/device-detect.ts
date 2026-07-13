// Signup device detection from the user-agent — so the Expedify AI agent (and
// the leads team) know which phone the student is on and can give the RIGHT
// install/notification guidance on the call:
//   android + instagram → "open the link in Chrome, then Install app"
//   ios                 → "Safari → Share → Add to Home Screen, THEN allow notifications"
// Pure string parsing, no library; unknowns degrade to 'other'.

export interface SignupDevice {
  device: 'android' | 'ios' | 'other';
  browser: 'instagram' | 'facebook' | 'chrome' | 'safari' | 'samsung' | 'webview' | 'other';
  label: string; // human line, e.g. "Android · Instagram in-app browser"
}

export function parseSignupDevice(ua: string | null | undefined): SignupDevice {
  const s = ua ?? '';
  const device: SignupDevice['device'] =
    /Android/i.test(s) ? 'android'
    : /iPhone|iPad|iPod/i.test(s) ? 'ios'
    : 'other';

  const browser: SignupDevice['browser'] =
    /Instagram/i.test(s) ? 'instagram'
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(s) ? 'facebook'
    : /SamsungBrowser/i.test(s) ? 'samsung'
    : /; wv\)|Version\/[\d.]+ Chrome/i.test(s) && device === 'android' ? 'webview'
    : /Chrome|CriOS/i.test(s) ? 'chrome'
    : /Safari/i.test(s) && device === 'ios' ? 'safari'
    : 'other';

  const deviceName = device === 'android' ? 'Android' : device === 'ios' ? 'iPhone' : 'Unknown device';
  const browserName =
    browser === 'instagram' ? 'Instagram in-app browser'
    : browser === 'facebook' ? 'Facebook in-app browser'
    : browser === 'samsung' ? 'Samsung Internet'
    : browser === 'webview' ? 'in-app browser'
    : browser === 'chrome' ? 'Chrome'
    : browser === 'safari' ? 'Safari'
    : 'unknown browser';

  return { device, browser, label: `${deviceName} · ${browserName}` };
}

// The line the AI agent needs — what this device means for install + push.
export function deviceCallGuidance(d: SignupDevice): string {
  if (d.device === 'ios') {
    return `They're on an iPhone (signed up via ${d.label.split(' · ')[1]}). On iPhone, notifications only work AFTER installing: guide them to open the site in Safari → Share button → "Add to Home Screen", then open the app and allow notifications.`;
  }
  if (d.device === 'android' && (d.browser === 'instagram' || d.browser === 'facebook' || d.browser === 'webview')) {
    return `They're on Android but signed up inside the ${d.label.split(' · ')[1]} — push notifications don't work there. Guide them: open careerrai-daily.vercel.app in Chrome → tap "Install app" → allow notifications.`;
  }
  if (d.device === 'android') {
    return `They're on Android (${d.label.split(' · ')[1]}). One tap covers everything: allow notifications when asked; installing from Chrome's "Install app" makes it feel like a real app.`;
  }
  return 'Device unknown — ask whether they use Android or iPhone before giving install steps.';
}
