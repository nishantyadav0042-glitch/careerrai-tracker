import { redirect } from 'next/navigation';

// Merged into the Profile panel's "Settings" tab — kept as a redirect so any
// existing links never dead-end.
export default function StudentSettingsPage() {
  redirect('/student/profile?tab=settings');
}
