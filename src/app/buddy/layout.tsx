import { requireBuddy } from '@/lib/admin-auth';

// Outer buddy layout: role check only.
// Shell (nav, badge) and onboarding gate live in (dashboard)/layout.tsx so that
// /buddy/setup can render without the nav and without triggering a redirect loop.
export default async function BuddyLayout({ children }: { children: React.ReactNode }) {
  // Canonical gate (21 Aug). What stood here had the SAME root defect in two
  // directions at once, which is what makes it worth recording:
  //
  //   slow path — `if (profile?.role !== 'buddy') redirect('/login')`. A
  //   failed read meant profile was null, so a real buddy was thrown out.
  //
  //   cookie fast path — it checked only for admin and student. A failed read
  //   matched NEITHER, fell through, and returned the children. The same
  //   broken read that locked a buddy out over here let anyone in over there.
  //
  // The "fast path" also saved nothing: it still did the profiles read, to
  // catch a stale cookie. One read either way, so one gate either way.
  await requireBuddy();

  return <>{children}</>;
}
