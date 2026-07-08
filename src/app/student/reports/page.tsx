import { redirect } from 'next/navigation';

// Merged into the Profile panel's "History" tab — kept as a redirect so any
// existing links never dead-end.
export default function StudentReportsPage() {
  redirect('/student/profile?tab=history');
}
