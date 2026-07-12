// Ensures at most ONE auto-shown modal (install journey, buddy nudge, …) appears
// per calendar day, so students are never stacked or nagged. The first eligible
// caller of the day wins; everyone else stands down.
const KEY = 'cr_daily_modal';

export function claimDailyModal(): boolean {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(KEY) === today) return false;
    localStorage.setItem(KEY, today);
    return true;
  } catch {
    return true;
  }
}
