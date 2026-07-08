import { redirect } from 'next/navigation';

// Merged into the Analysis panel's "Mocks" tab — kept as a redirect so any
// existing links (nav history, PWA shortcuts) never dead-end.
export default function ExamsPage() {
  redirect('/student/analysis');
}
