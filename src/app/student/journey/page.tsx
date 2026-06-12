import { redirect } from 'next/navigation';

// Journey consolidated into Analysis — one page per function.
export default function StudentJourneyPage() {
  redirect('/student/analysis');
}
