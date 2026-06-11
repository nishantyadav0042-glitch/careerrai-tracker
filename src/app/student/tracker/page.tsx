import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Daily Tracker',
  description: 'Log your daily prep and maintain your streak',
};

export default async function DailyTrackerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/student/home"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Daily Tracker
            </h1>
            <p className="text-sm text-stone-500">Log your prep in 30 seconds</p>
          </div>
        </div>

        {/* Main Tracker */}
        <DailyTrackerApp studentId={user.id} />

        {/* Info Cards */}
        <div className="space-y-3">
          <Card className="p-4 bg-teal-50 border-teal-200">
            <div className="flex gap-3">
              <span className="text-lg">🔥</span>
              <div>
                <p className="text-sm font-semibold text-teal-900">Build Your Streak</p>
                <p className="text-xs text-teal-700 mt-1">
                  Log every day at the same time to build momentum. Streaks compound over time.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-orange-50 border-orange-200">
            <div className="flex gap-3">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-sm font-semibold text-orange-900">Buddy Sees Everything</p>
                <p className="text-xs text-orange-700 mt-1">
                  Your buddy gets notified when you log. They&apos;ll use this to give better feedback.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex gap-3">
              <span className="text-lg">💪</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Best Time to Log</p>
                <p className="text-xs text-blue-700 mt-1">
                  Log right after your study session. Today&apos;s log locks in at 3 AM tomorrow.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* CTA to detailed form */}
        <div className="text-center">
          <p className="text-xs text-stone-600 mb-3">
            Need to log more details? Quizzes, notes, specific scores?
          </p>
          <Link
            href="/student/today"
            className="inline-block text-teal-700 font-medium hover:underline text-sm"
          >
            Go to detailed form →
          </Link>
        </div>
      </div>
    </div>
  );
}
