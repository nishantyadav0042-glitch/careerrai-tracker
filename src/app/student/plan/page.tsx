import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getAuthUser } from '@/lib/auth';
import { FullPlanView } from '@/components/full-plan-view';

export const metadata = {
  title: 'My plan — CareerRai',
  description: 'Your whole study plan, day by day',
};

// The whole plan, on its own page rather than folded into Home.
//
// Home answers two questions and only two: what do I study today, and have I
// logged it. This is the third question — "what does the rest of it look like?"
// — and it is a real one, but it is not a daily one. A student asks it when
// they are planning their week, not when they are about to study.
export default async function PlanPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
      <div className="flex items-center gap-2">
        <Link href="/student/tracker" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          My plan
        </h1>
      </div>
      <FullPlanView />
    </div>
  );
}
