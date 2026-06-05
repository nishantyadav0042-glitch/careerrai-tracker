import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TimelineView } from '@/components/timeline-view';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function StudentJourneyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get student profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Friend';

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <Link
              href="/student/home"
              className="inline-flex items-center gap-2 text-stone-600 hover:text-stone-900 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Home</span>
            </Link>
            <h1
              className="text-3xl font-bold text-stone-900"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Your Journey
            </h1>
            <p className="text-stone-600 mt-1">
              Visualize your CAT prep growth and insights
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-stone-200">
          <a
            href="#timeline"
            className="py-2 px-4 font-semibold text-orange-600 border-b-2 border-orange-600"
          >
            📅 Timeline
          </a>
          <a
            href="#analytics"
            className="py-2 px-4 font-semibold text-stone-600 hover:text-stone-900"
          >
            📊 Analytics
          </a>
        </div>

        {/* Timeline Section */}
        <div id="timeline" className="mb-16">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Your Study Journey</h2>
            <p className="text-stone-600">
              A complete timeline of your logs, tests, feedback, and milestones
            </p>
          </div>

          <TimelineView studentId={user.id} />
        </div>

        {/* Analytics Section */}
        <div id="analytics">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Performance Analytics</h2>
            <p className="text-stone-600">
              Deep insights into your mock trends, study patterns, and CAT readiness
            </p>
          </div>

          <AnalyticsDashboard studentId={user.id} />
        </div>

        {/* Footer */}
        <div className="mt-16 p-6 bg-white rounded-xl border border-stone-200 text-center">
          <p className="text-sm text-stone-600 mb-3">
            💡 Your buddy has access to all these insights and uses them to guide your CAT preparation
          </p>
          <Link
            href="/student/home"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
