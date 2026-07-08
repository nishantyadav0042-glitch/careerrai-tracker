import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { PushToggle } from '@/components/push-toggle';
import { ShareProgressButton } from '@/components/share-progress-button';
import { Check, GraduationCap, Clock } from 'lucide-react';
import type { NotifPrefs } from '@/types';
import { DreamCollegesCard } from '@/components/dream-colleges-card';
import { MembershipCard } from '@/components/membership-card';
import { EditProfileTrigger } from './edit-profile-trigger';
import { RefundCard } from './refund-card';
import { paymentsEnabled } from '@/lib/feature-flags';
import { scholarshipDisplay } from '@/lib/pricing';
import { RecommendedBuddies, type RecommendedBuddy } from '@/components/recommended-buddies';

interface BuddyRow { full_name: string; college: string | null; cat_percentile: number | null; buddy_bio: string | null }

// Formerly the whole /student/profile page; now the "Profile" tab inside
// the merged Profile panel (Profile + History + Settings). Purely
// presentational — all data-fetching stays in page.tsx.
export function ProfileOverview({
  displayName, email, examTarget, initials, profile, buddy, buddyInitials, buddyId,
  responseHours, daysLogged, bestStreak, latestPercentile, targetPercentile, progressPct,
  recommendedBuddies, isInFirstMonth, refundDaysLogged, refundEligible, existingRefundReq, REFUND_DAYS_REQUIRED,
  scholarship, prefs,
}: {
  displayName: string;
  email: string | null;
  examTarget: string | null;
  initials: string;
  profile: { dream_colleges: unknown; subscription_status: string | null; subscription_plan: string | null; subscription_renews_at: string | null; full_name: string | null; created_at: string; buddy_id: string | null };
  buddy: BuddyRow | null;
  buddyInitials: string;
  buddyId: string | null;
  responseHours: number | null;
  daysLogged: number;
  bestStreak: number;
  latestPercentile: number | null;
  targetPercentile: number;
  progressPct: number;
  recommendedBuddies: RecommendedBuddy[];
  isInFirstMonth: boolean;
  refundDaysLogged: number;
  refundEligible: boolean;
  existingRefundReq: { status: 'pending' | 'approved' | 'rejected'; requestedAt: string } | null;
  REFUND_DAYS_REQUIRED: number;
  scholarship: { label: string; pricing: ReturnType<typeof scholarshipDisplay> } | null;
  prefs: NotifPrefs;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{displayName}</div>
            {email && <div className="text-sm text-stone-600">{email}</div>}
            <div className="mt-1"><Badge color="stone">{examTarget ?? 'CAT Student'}</Badge></div>
            <EditProfileTrigger />
          </div>
        </div>
      </Card>

      {/* Progress Summary */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Your Progress</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{daysLogged}</div>
            <div className="text-xs text-stone-500 mt-0.5">Days logged</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{bestStreak}</div>
            <div className="text-xs text-stone-500 mt-0.5">Best streak</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{latestPercentile ? `${Math.round(latestPercentile)}%` : '—'}</div>
            <div className="text-xs text-stone-500 mt-0.5">Latest %ile</div>
          </div>
        </div>
        {latestPercentile !== null && (
          <div className="mb-4">
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-stone-500 mt-1.5">You&apos;re {progressPct}% of the way to your {targetPercentile}%ile target</p>
          </div>
        )}
        <ShareProgressButton daysLogged={daysLogged} bestStreak={bestStreak} percentile={latestPercentile} />
      </Card>

      {/* Free students: browse real mentors — the product behind the paywall.
          Placed right after the header, above everything else, so it's never
          buried under progress stats / membership / refund cards. */}
      {!buddyId && <RecommendedBuddies buddies={recommendedBuddies} studentName={displayName} />}

      <DreamCollegesCard initial={(profile.dream_colleges as string[] | null) ?? []} />

      {paymentsEnabled() && (
        <MembershipCard
          status={(profile.subscription_status as 'free_beta' | 'active' | 'expired' | 'paused' | 'refund_requested') ?? 'free_beta'}
          plan={profile.subscription_plan}
          renewsAt={profile.subscription_renews_at}
          fullName={profile.full_name ?? displayName}
          scholarship={scholarship}
        />
      )}

      {/* Refund guarantee */}
      {(isInFirstMonth || existingRefundReq) && (
        <RefundCard
          daysLogged={refundDaysLogged}
          required={REFUND_DAYS_REQUIRED}
          eligible={refundEligible}
          existingRequest={existingRefundReq}
        />
      )}

      {/* Buddy Trust Signals */}
      {buddy && (
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">Your Buddy</div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {buddyInitials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-stone-900">{buddy.full_name}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {buddy.college && (
                  <Badge color="blue"><GraduationCap className="w-3 h-3 inline mr-1" />{buddy.college}</Badge>
                )}
                {buddy.cat_percentile && (
                  <Badge color="orange">{Number(buddy.cat_percentile).toFixed(0)}%ile CAT</Badge>
                )}
              </div>
            </div>
          </div>
          {buddy.buddy_bio && (
            <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-teal-300 pl-3">
              &quot;{buddy.buddy_bio}&quot;
            </p>
          )}
          {responseHours !== null && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <Clock className="w-3.5 h-3.5" />
              Responds within {responseHours} hr{responseHours === 1 ? '' : 's'} — verified
            </div>
          )}
        </div>
        {buddyId && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <Badge color="green"><Check className="w-3 h-3 inline mr-1" />Connected</Badge>
          </div>
        )}
      </Card>
      )}

      <NotifPrefsPanel initial={prefs} label1="Daily reminder" label2="Email notifications" />

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Push notifications</div>
        <PushToggle initialEnabled={prefs.push ?? false} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        <p className="text-xs text-stone-400 mt-2">Get instant alerts on your device even when the app is closed.</p>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Member since</div>
        <div className="text-sm font-semibold text-stone-900">
          {new Date(profile.created_at).toLocaleDateString('en-IN', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </div>
      </Card>
    </div>
  );
}
