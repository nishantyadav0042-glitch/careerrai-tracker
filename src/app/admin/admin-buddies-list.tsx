'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronDown, ChevronUp, Trophy, Calendar, Briefcase, Target, MessageCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// Everything a buddy fills in storefront setup, so the admin can match on
// expertise — not just see activity stats. Mirrors the student dossier.
export interface BuddyDossierData {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cat_percentile?: number | null;
  first_attempt_percentile?: number | null;
  cat_year?: number | null;
  iim_converted?: string | null;
  current_company?: string | null;
  strongest_section?: string | null;
  student_types_helped?: string[] | null;
  how_i_work?: string | null;
  biggest_mistake?: string | null;
  younger_self_advice?: string | null;
  linkedin_url?: string | null;
}

export interface BuddyRow {
  buddy: BuddyDossierData;
  studentCount: number;
  redFlags: number;
  feedbackCount: number;
  avgResponseHrs: number | null;
  students: { id: string; full_name: string }[];
}

function journeyLabel(b: BuddyDossierData): string | null {
  if (b.cat_percentile == null) return null;
  const final = `${b.cat_percentile}%ile`;
  return b.first_attempt_percentile != null
    ? `${b.first_attempt_percentile} → repeated → ${final}`
    : `${final} (first attempt)`;
}

export function AdminBuddiesList({ rows }: { rows: BuddyRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {rows.map(({ buddy, studentCount, redFlags, feedbackCount, avgResponseHrs, students }) => {
        const initials = buddy.full_name[0].toUpperCase();
        const isExpanded = expandedId === buddy.id;
        const journey = journeyLabel(buddy);
        const setupIncomplete = buddy.cat_percentile == null && !buddy.strongest_section;

        return (
          <Card key={buddy.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-900 text-sm">{buddy.full_name}</span>
                  <Badge color="orange">Buddy</Badge>
                  {redFlags > 0 && <Badge color="red">{redFlags} red flag{redFlags > 1 ? 's' : ''}</Badge>}
                  {setupIncomplete && <Badge color="stone">Setup incomplete</Badge>}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {[buddy.iim_converted, journey].filter(Boolean).join(' · ') || buddy.email}
                </div>
                <div className="text-xs text-stone-600 mt-1">
                  {feedbackCount} feedback (14d)
                  {avgResponseHrs !== null && <> · responds in ~{avgResponseHrs}h</>}
                  {feedbackCount === 0 && <span className="text-rose-600 font-medium"> · no recent activity</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Users className="w-4 h-4 text-stone-400" />
                <span className="text-sm font-bold text-stone-900">{studentCount}</span>
              </div>
            </div>

            {/* Matching signals — visible without expanding */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {buddy.strongest_section && (
                <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  Strong: {buddy.strongest_section}
                </span>
              )}
              {(buddy.student_types_helped ?? []).map((t) => (
                <span key={t} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => setExpandedId(isExpanded ? null : buddy.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-700"
              >
                Full profile {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {buddy.linkedin_url && (
                <a
                  href={buddy.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0a66c2] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />LinkedIn
                </a>
              )}
            </div>

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-stone-100 space-y-3 text-sm">
                <div className="space-y-1.5">
                  {journey && (
                    <div className="flex items-start gap-2.5">
                      <Trophy className="w-3.5 h-3.5 text-stone-400 mt-0.5 flex-shrink-0" />
                      <span className="text-stone-500 w-28 flex-shrink-0">CAT journey</span>
                      <span className="text-stone-800 font-medium">{journey}</span>
                    </div>
                  )}
                  {buddy.cat_year != null && (
                    <div className="flex items-start gap-2.5">
                      <Calendar className="w-3.5 h-3.5 text-stone-400 mt-0.5 flex-shrink-0" />
                      <span className="text-stone-500 w-28 flex-shrink-0">CAT year</span>
                      <span className="text-stone-800 font-medium">{buddy.cat_year}</span>
                    </div>
                  )}
                  {buddy.current_company && (
                    <div className="flex items-start gap-2.5">
                      <Briefcase className="w-3.5 h-3.5 text-stone-400 mt-0.5 flex-shrink-0" />
                      <span className="text-stone-500 w-28 flex-shrink-0">Company</span>
                      <span className="text-stone-800 font-medium">{buddy.current_company}</span>
                    </div>
                  )}
                  {buddy.how_i_work && (
                    <div className="flex items-start gap-2.5">
                      <Target className="w-3.5 h-3.5 text-stone-400 mt-0.5 flex-shrink-0" />
                      <span className="text-stone-500 w-28 flex-shrink-0">How they work</span>
                      <span className="text-stone-800 font-medium">{buddy.how_i_work}</span>
                    </div>
                  )}
                </div>

                {(buddy.biggest_mistake || buddy.younger_self_advice) && (
                  <div className="space-y-2">
                    {buddy.biggest_mistake && (
                      <div className="rounded-lg bg-stone-50 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-0.5">Their prep mistake</div>
                        <div className="text-xs text-stone-700 leading-relaxed">{buddy.biggest_mistake}</div>
                      </div>
                    )}
                    {buddy.younger_self_advice && (
                      <div className="rounded-lg bg-stone-50 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-0.5">Advice to younger self</div>
                        <div className="text-xs text-stone-700 leading-relaxed">{buddy.younger_self_advice}</div>
                      </div>
                    )}
                  </div>
                )}

                {students.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1.5">Current students</div>
                    <div className="flex flex-wrap gap-1.5">
                      {students.map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                          <MessageCircle className="w-3 h-3" />{s.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
