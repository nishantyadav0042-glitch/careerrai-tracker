import { Badge } from '@/components/ui/badge';
import { dailyHours } from '@/lib/daily-hours';
import {
  Phone, Mail, GraduationCap, Briefcase, BookOpen, Target, Calendar,
  TrendingUp, Trophy, Clock, MapPin, Award,
} from 'lucide-react';

// Every field a student fills across the 9-step onboarding lives on `profiles`.
// This dossier renders all of it, organised into scannable sections, for the
// people who coach the student: the admin (founder) and the assigned buddy.
export interface StudentDossierData {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  college?: string | null;
  course_year?: number | null;
  is_working_professional?: boolean | null;
  work_ex_months?: number | null;
  coaching_enrolled?: boolean | null;
  created_at?: string | null;

  exam_target?: string | null;
  attempt_year?: number | null;
  category?: string | null;
  is_repeater?: boolean | null;
  target_percentile?: number | null;
  hours_available?: number | null;
  study_target_hours?: number | null;

  starting_percentile?: number | null;
  baseline_varc?: number | null;
  baseline_dilr?: number | null;
  baseline_qa?: number | null;
  baseline_mocks_taken?: number | null;

  dream_colleges?: string[] | null;
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-0.5" />
      <span className="text-stone-500 w-32 flex-shrink-0">{label}</span>
      <span className="text-stone-800 font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function StudentDossier({ data }: { data: StudentDossierData }) {
  const workEx = data.work_ex_months
    ? `${Math.floor(data.work_ex_months / 12)}y ${data.work_ex_months % 12}m`
    : null;
  const joined = data.created_at
    ? new Date(data.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const hasBaseline =
    data.starting_percentile != null || data.baseline_varc != null ||
    data.baseline_dilr != null || data.baseline_qa != null;
  const hasColleges = (data.dream_colleges?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* About You (step: About You) */}
      <Section title="About">
        <Row icon={Phone} label="Phone" value={data.phone} />
        <Row icon={Mail} label="Email" value={data.email} />
        <Row icon={GraduationCap} label="College" value={data.college} />
        {data.is_working_professional ? (
          <Row icon={Briefcase} label="Work experience" value={workEx ? `${workEx} (working professional)` : 'Working professional'} />
        ) : (
          <Row icon={GraduationCap} label="Year of study" value={data.course_year ? `Year ${data.course_year}` : null} />
        )}
        <Row
          icon={BookOpen}
          label="Coaching"
          value={
            data.coaching_enrolled === true ? 'Enrolled in coaching'
            : data.coaching_enrolled === false ? 'Self-study'
            : null
          }
        />
        <Row icon={Calendar} label="Joined" value={joined} />
      </Section>

      {/* Exam Context (step: Exam Context + Daily Commitment) */}
      <Section title="Exam goals">
        <Row icon={Target} label="Target exam" value={data.exam_target} />
        <Row icon={Calendar} label="Attempt year" value={data.attempt_year} />
        <Row icon={Award} label="Category" value={data.category} />
        <Row
          icon={TrendingUp}
          label="Attempt"
          value={data.is_repeater === true ? 'Repeater' : data.is_repeater === false ? 'First attempt' : null}
        />
        <Row icon={Trophy} label="Target %ile" value={data.target_percentile != null ? `${data.target_percentile}%ile` : null} />
        {/* One daily-hours number (study_target_hours is canonical). Showing
            both hours_available and study_target_hours as separate rows made a
            student look like "4 hrs available / 8 hrs/day commitment" whenever
            the two columns had drifted. */}
        <Row icon={Clock} label="Daily self-study hours" value={(() => { const h = dailyHours(data).weekday; return h != null ? `${h} hrs/day` : null; })()} />
      </Section>

      {/* Dream colleges (step: Dream Colleges) */}
      {hasColleges && (
        <Section title="Dream colleges">
          <div className="flex flex-wrap gap-1.5">
            {data.dream_colleges!.map((c, i) => (
              <Badge key={c} color={i === 0 ? 'orange' : 'stone'}>
                <MapPin className="w-3 h-3" />{i === 0 ? `#1 ${c}` : c}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Baseline (step: Your Baseline) */}
      {hasBaseline && (
        <Section title="Baseline (at start)">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Overall', val: data.starting_percentile },
              { label: 'VARC', val: data.baseline_varc },
              { label: 'DILR', val: data.baseline_dilr },
              { label: 'QA', val: data.baseline_qa },
            ].map(({ label, val }) => (
              <div key={label} className="text-center bg-stone-50 rounded-lg py-2">
                <div className="text-base font-bold text-stone-800">{val != null ? `${val}` : '—'}</div>
                <div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div>
              </div>
            ))}
          </div>
          {data.baseline_mocks_taken != null && (
            <div className="text-xs text-stone-500 mt-1">{data.baseline_mocks_taken} mock{data.baseline_mocks_taken === 1 ? '' : 's'} taken before joining</div>
          )}
        </Section>
      )}
    </div>
  );
}
