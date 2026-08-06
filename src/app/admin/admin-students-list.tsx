'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Phone, ChevronDown, ChevronUp, UserX, AlertCircle, Sparkles, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dailyHours as studentDailyHours } from '@/lib/daily-hours';
import type { Profile } from '@/types';
import { StudentDossier, type StudentDossierData } from '@/components/student-dossier';
import { waMessages, leadState } from '@/lib/wa-messages';
import { dreamCollegeLabel } from '@/lib/dream-college';

// Buddy rows carry their storefront-setup answers so the admin can match on
// expertise (strongest section, who they help best), not just a name.
export type BuddyInfo = Profile & {
  strongest_section?: string | null;
  student_types_helped?: string[] | null;
  iim_converted?: string | null;
  cat_percentile?: number | null;
};

interface StudentStat {
  student: Profile & StudentDossierData & { onboarding_completed?: boolean | null; phone?: string | null; created_at?: string };
  summary: { band: string; overallScore: number; daysSubmitted: number; avgStudy: number };
  buddy?: Profile;
  submittedToday: boolean;
  hasRedFlags: boolean;
  joinedLabel?: string | null;
  daysSinceJoin?: number | null;
  isNew?: boolean;
}

interface PendingStudent {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  status: string;
  assigned_buddy_id: string | null;
}

// Build a WhatsApp click-to-chat link from a real (+country code) phone number,
// pre-typed with the SUGGESTED outreach message from the shared templates (the
// single source of truth in lib/wa-messages — same copy as the Leads page).
// The message is chosen from the lead's state (no app → install nudge,
// installed-but-notifications-off → turn on reminders, engaged → keep going);
// with no state (never-joined invites) it defaults to the install nudge.
function whatsappLink(
  phone: string | null | undefined,
  name: string,
  opts?: { appInstalled?: boolean; pushOn?: boolean; dreamColleges?: unknown }
): string | null {
  if (!phone || !phone.trim().startsWith('+')) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 10) return null;
  const firstName = (name || '').split(' ')[0] || 'there';
  const state = leadState(opts?.appInstalled ?? false, opts?.pushOn ?? false);
  const msgs = waMessages({ firstName, dreamCollege: dreamCollegeLabel(opts?.dreamColleges) });
  const suggested = msgs.find((m) => m.suggestedFor === state) ?? msgs[0];
  return `https://wa.me/${digits}?text=${encodeURIComponent(suggested.text)}`;
}

// One-line buddy credential for the dropdown: "Shreya — IIM Indore · strong DILR".
function buddyOptionLabel(b: BuddyInfo): string {
  const bits = [b.iim_converted, b.strongest_section ? `strong ${b.strongest_section}` : null].filter(Boolean);
  return bits.length ? `${b.full_name} — ${bits.join(' · ')}` : b.full_name;
}

// The student facts that actually drive a buddy match, shown WITHOUT expanding:
// profile type (fresher/repeater, student/WP), target, hours, weakest section.
function matchFacts(s: StudentStat['student']): string[] {
  const facts: string[] = [];
  if (s.is_repeater === true) facts.push('Repeater');
  else if (s.is_repeater === false) facts.push('First attempt');
  if (s.is_working_professional === true) facts.push('Working professional');
  else if (s.is_working_professional === false) facts.push('Student');
  if (s.coaching_enrolled === true) facts.push('Has coaching');
  else if (s.coaching_enrolled === false) facts.push('Self-study');
  if (s.target_percentile != null) facts.push(`Target ${s.target_percentile}%ile`);
  const sections = [
    { name: 'VARC', val: s.baseline_varc },
    { name: 'DILR', val: s.baseline_dilr },
    { name: 'QA', val: s.baseline_qa },
  ].filter((x): x is { name: string; val: number } => x.val != null);
  if (sections.length >= 2) {
    const weakest = sections.reduce((a, b) => (b.val < a.val ? b : a));
    facts.push(`Weakest: ${weakest.name} (${weakest.val})`);
  }
  // Through dailyHours(): study_target_hours is canonical — hours_available is the signup-time
  // answer and goes stale the moment a student edits their goal. 42 of 234
  // students had drifted when this was checked, so admin was quoting a
  // different daily-hours number than the app was planning with.
  const dailyHours = studentDailyHours(s).weekday;
  if (dailyHours != null) facts.push(`${dailyHours}h/day`);
  return facts;
}

export function AdminStudentsList({
  students,
  buddies,
  pendingStudents = [],
}: {
  students: StudentStat[];
  buddies: BuddyInfo[];
  pendingStudents?: PendingStudent[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleAssign(studentId: string, buddyId: string | null) {
    setLoadingId(studentId);
    try {
      const response = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (response.ok) router.refresh(); // re-runs the server page for fresh assignment state
    } finally {
      setLoadingId(null);
    }
  }

  // Parent already sorts by created_at DESC, so the newest joiner is on top.
  function renderStudentCard({ student, summary, buddy, submittedToday, joinedLabel, daysSinceJoin, isNew }: StudentStat) {
    const bandColor = summary.band === 'On track' ? 'green' : summary.band === 'Needs nudging' ? 'amber' : 'red';
    const nameParts = (student.full_name || 'S').split(' ').filter(Boolean);
    const initials = nameParts.map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'S';
    const isLoading = loadingId === student.id;
    const isExpanded = expandedId === student.id;
    const isSparse = student.onboarding_completed &&
      (!student.college || !student.exam_target || !(student.dream_colleges?.length) || !student.starting_percentile);
    const facts = matchFacts(student);
    const selectedBuddy = buddies.find((b) => b.id === buddy?.id);
    const wa = whatsappLink(student.phone, student.full_name, {
      appInstalled: (student as { app_installed?: boolean | null }).app_installed === true,
      pushOn: ((student as { notif_prefs?: { push?: boolean } | null }).notif_prefs)?.push === true,
      dreamColleges: student.dream_colleges,
    });
    const joinedAgo = daysSinceJoin === null || daysSinceJoin === undefined
      ? null
      : daysSinceJoin === 0 ? 'today' : daysSinceJoin === 1 ? 'yesterday' : `${daysSinceJoin}d ago`;

    return (
      <Card key={student.id} className={cn('p-4', isNew && 'ring-1 ring-orange-200 bg-orange-50/40')}>
        {/* Header: avatar + name + expand toggle */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0',
            'bg-gradient-to-br from-stone-900 to-stone-700'
          )}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-stone-900 text-sm truncate">{student.full_name}</span>
                {joinedLabel && (
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Joined {joinedLabel}{joinedAgo ? ` · ${joinedAgo}` : ''}
                  </div>
                )}
              </div>
              <button
                onClick={() => setExpandedId(isExpanded ? null : student.id)}
                className="-mt-1 -mr-1 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-stone-100 text-stone-500 text-[11px] font-semibold flex-shrink-0"
              >
                Full profile {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Status badges — wrap cleanly on their own line */}
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {isNew && <Badge color="orange"><Sparkles className="w-3 h-3" />New</Badge>}
              <Badge color={bandColor}>{summary.overallScore}/100</Badge>
              {submittedToday ? (
                <Badge color="green"><CheckCircle2 className="w-3 h-3" />Today</Badge>
              ) : (
                <Badge color="amber"><Clock className="w-3 h-3" />Pending</Badge>
              )}
              {!student.onboarding_completed && <Badge color="stone">Setup incomplete</Badge>}
              {isSparse && <Badge color="amber"><AlertCircle className="w-3 h-3" />Profile sparse</Badge>}
            </div>

            <div className="text-xs text-stone-500 mt-1">
              {student.exam_target ?? 'CAT'} · {summary.daysSubmitted}/7 days logged
            </div>
          </div>
        </div>

        {/* Match strip — the profile facts that decide which buddy fits, no expand needed */}
        {facts.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium',
                  f.startsWith('Weakest') ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600'
                )}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Contact row — phone + one-tap WhatsApp (real signups only) */}
        {student.phone && student.phone.trim().startsWith('+') && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <a
              href={`tel:${student.phone}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg px-2.5 py-1.5"
            >
              <Phone className="w-3.5 h-3.5" />{student.phone}
            </a>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1ebe57] rounded-lg px-2.5 py-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />Add on WhatsApp
              </a>
            )}
          </div>
        )}

        {/* Buddy assignment — its own full-width row, never squeezing the name */}
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-medium text-stone-400 flex-shrink-0">Buddy</label>
          <select
            value={buddy?.id || ''}
            onChange={(e) => handleAssign(student.id, e.target.value || null)}
            disabled={isLoading}
            className={cn(
              'flex-1 min-w-0 px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-600',
              isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            )}
          >
            <option value="">Unassigned</option>
            {buddies.map((b) => (
              <option key={b.id} value={b.id}>{buddyOptionLabel(b)}</option>
            ))}
          </select>
        </div>

        {/* Who the assigned buddy helps best — sanity check for the match */}
        {selectedBuddy && (selectedBuddy.student_types_helped?.length ?? 0) > 0 && (
          <div className="mt-1.5 text-[11px] text-stone-500">
            <span className="font-semibold text-stone-600">{selectedBuddy.full_name.split(' ')[0]}</span> helps best:{' '}
            {selectedBuddy.student_types_helped!.join(', ')}
          </div>
        )}

        {/* Expanded full dossier — everything the student filled in setup */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <StudentDossier data={student} />
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Real signups — leads who joined from the app, newest first */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
            New signups <span className="text-stone-400">({students.length})</span>
          </h3>
          <span className="text-[11px] text-stone-400">newest first</span>
        </div>
        {students.length > 0 ? (
          students.map(renderStudentCard)
        ) : (
          <Card className="p-4 border-dashed border-stone-300 bg-stone-50/60 text-center text-xs text-stone-400">
            No real signups yet — they’ll appear here the moment someone joins.
          </Card>
        )}
      </div>

      {/* Pending — in allowlist but never logged in */}
      {pendingStudents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600 px-1">
            Invited — not joined yet <span className="text-stone-400">({pendingStudents.length})</span>
          </h3>
          {pendingStudents.map((p) => {
            const nameParts = (p.full_name || 'S').split(' ').filter(Boolean);
            const initials = nameParts.map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'S';
            const assignedBuddy = buddies.find(b => b.id === p.assigned_buddy_id);
            const wa = whatsappLink(p.phone, p.full_name);

            return (
              <Card key={p.id} className="p-4 border-dashed border-stone-300 bg-stone-50/60">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center text-stone-500 text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-stone-700 text-sm">{p.full_name}</span>
                        <Badge color="stone"><UserX className="w-3 h-3" />Never logged in</Badge>
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-3 flex-wrap">
                        {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                        {p.email && <span>{p.email}</span>}
                        {assignedBuddy && <span>Buddy: {assignedBuddy.full_name.split(' ')[0]}</span>}
                      </div>
                    </div>
                  </div>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1ebe57] rounded-lg px-2.5 py-1.5 flex-shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {students.length === 0 && pendingStudents.length === 0 && (
        <div className="text-center py-12 text-stone-400 text-sm">No students yet</div>
      )}
    </div>
  );
}
