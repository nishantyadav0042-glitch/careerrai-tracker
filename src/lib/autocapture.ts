// Global autocapture — the Heap / PostHog / Amplitude-autocapture pattern.
//
// One set of passive listeners records EVERY tap and how far each screen is
// scrolled, automatically. This is the only architecture that meets the bar
// "answer any behavioural question six months from now without shipping a new
// event": buttons that don't exist yet are captured the moment they render, at
// zero per-button cost.
//
// Naming: a semantic name is read from `data-analytics="buddy_buy_tillcat"` when
// present; otherwise a stable label is derived from the element (aria-label →
// visible text → title → tag). Group elements with `data-section="paywall"` to
// tag which part of a screen a tap happened in. Everything is best-effort and
// swallow-all — capture must never break a real interaction.

import { track } from './journey';

let started = false;
let maxScrollPct = 0;
let scrollRaf = 0;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
}

function labelFor(el: HTMLElement): string {
  const explicit = el.getAttribute('data-analytics');
  if (explicit) return explicit.slice(0, 60);
  const aria = el.getAttribute('aria-label');
  if (aria) return slug(aria);
  const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (txt) return slug(txt);
  const title = el.getAttribute('title');
  if (title) return slug(title);
  return el.tagName.toLowerCase();
}

function sectionOf(el: HTMLElement): string | null {
  const sec = el.closest('[data-section]') as HTMLElement | null;
  return sec?.getAttribute('data-section') ?? null;
}

// Nearest actionable ancestor of the click target.
const ACTIONABLE = '[data-analytics],button,a,[role="button"],[role="tab"],[role="switch"],input[type="submit"],input[type="button"],[data-tour],summary,label';

function onClick(e: MouseEvent): void {
  try {
    const target = e.target as HTMLElement | null;
    const el = target?.closest?.(ACTIONABLE) as HTMLElement | null;
    if (!el) return;
    const named = !!el.getAttribute('data-analytics');
    track('tap', {
      el: labelFor(el),
      auto: named ? undefined : true,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || undefined,
      text: named ? undefined : ((el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48) || undefined),
      section: sectionOf(el) || undefined,
      href: (el as HTMLAnchorElement).href || undefined,
      disabled: (el as HTMLButtonElement).disabled || undefined,
      tour: el.getAttribute('data-tour') || undefined,
    });
  } catch {
    /* never break a click */
  }
}

function onScroll(): void {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    try {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round((doc.scrollTop / total) * 100));
      if (pct > maxScrollPct) maxScrollPct = pct;
    } catch {
      /* ignore */
    }
  });
}

/** Bind the global capture listeners. Idempotent; call once at app start. */
export function startAutocapture(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.addEventListener('click', onClick, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
}

/** Read + reset the max scroll depth of the screen being left. */
export function takeScrollDepth(): number {
  const d = maxScrollPct;
  maxScrollPct = 0;
  return d;
}
