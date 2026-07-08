import { redirect } from 'next/navigation';

// Merged into the Buddy panel's "Chat" tab — kept as a redirect so any
// existing links (push notifications, PWA shortcuts) never dead-end.
export default function StudentChatPage() {
  redirect('/student/buddy?tab=chat');
}
