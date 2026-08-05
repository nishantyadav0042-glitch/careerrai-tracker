import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, MessageCircle } from 'lucide-react';
import type { ChatMessage } from '@/components/chat/types';

export const metadata = {
  title: 'Chat · CareerRai',
  description: 'Your student conversations',
};

interface InboxRow {
  id: string;
  full_name: string;
  unread: number;
  lastBody: string | null;
  lastAt: string | null;
}

export default async function BuddyChatInboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);

  let rows: InboxRow[] = studentList.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    unread: 0,
    lastBody: null,
    lastAt: null,
  }));

  if (studentIds.length > 0) {
    // All messages for this buddy across the assigned students (last ~50 per inbox view).
    const { data: msgs } = await admin
      .from('chat_messages')
      .select('id, student_id, buddy_id, sender_id, body, created_at, read_at, attachment_name, attachment_mime, attachment_size, attachment_kind')
      .eq('buddy_id', user.id)
      .in('student_id', studentIds)
      .order('created_at', { ascending: false });

    const all = (msgs ?? []) as ChatMessage[];
    const byStudent = new Map<string, { unread: number; last?: ChatMessage }>();
    for (const m of all) {
      const entry = byStudent.get(m.student_id) ?? { unread: 0 };
      if (!entry.last) entry.last = m; // first seen = most recent (desc order)
      // unread = student sent it and buddy hasn't read it
      if (m.sender_id === m.student_id && m.read_at === null) entry.unread += 1;
      byStudent.set(m.student_id, entry);
    }

    rows = rows.map((r) => {
      const e = byStudent.get(r.id);
      return {
        ...r,
        unread: e?.unread ?? 0,
        lastBody: e?.last?.body ?? null,
        lastAt: e?.last?.created_at ?? null,
      };
    });

    // Sort: unread first, then most recent activity.
    rows.sort((a, b) => {
      if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) {
        return (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
      }
      return (b.lastAt ?? '').localeCompare(a.lastAt ?? '');
    });
  }

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Messages</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Chat
        </h1>
        <p className="text-sm text-stone-600 mt-1">{studentList.length} student{studentList.length === 1 ? '' : 's'}</p>
      </div>

      {studentList.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageCircle className="w-6 h-6 text-stone-400 mx-auto mb-2" />
          <p className="text-sm text-stone-600">No students assigned yet. Conversations appear here once you have students.</p>
        </Card>
      ) : (
        rows.map((r) => {
          const initials = (r.full_name ?? '').split(' ').map((n) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
          return (
            <Link key={r.id} href={`/buddy/chat/${r.id}`}>
              <Card className="p-4 cursor-pointer hover:border-stone-400 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900 truncate">{r.full_name}</span>
                      {r.lastAt && (
                        <span className="text-[11px] text-stone-400 shrink-0">
                          {new Date(r.lastAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-stone-500 truncate">
                        {r.lastBody ?? 'No messages yet — say hi'}
                      </span>
                      {r.unread > 0 ? (
                        <Badge color="orange">{r.unread > 9 ? '9+' : r.unread}</Badge>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
