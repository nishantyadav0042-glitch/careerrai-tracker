'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, X, Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAttachmentUpload } from './use-attachment-upload';
import { AttachmentBubble } from './attachment-bubble';
import { ACCEPT_ATTRIBUTE } from '@/lib/chat-attachments';
import type { ChatMessage } from './types';
import { ReportConversation } from './report-conversation';

function checkAuthorship(aiBulletText: string, submitted: string): string | null {
  const norm = (s: string): string[] =>
    s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const aiWords = new Set(norm(aiBulletText));
  const submittedTokens = norm(submitted);
  const submittedSet = new Set(submittedTokens);
  const ownWords = submittedTokens.filter((w) => !aiWords.has(w));
  const intersection = [...submittedSet].filter((w) => aiWords.has(w)).length;
  const union = aiWords.size + submittedSet.size - intersection;
  const similarity = union > 0 ? intersection / union : 0;
  if (similarity > 0.55 || ownWords.length < 8) {
    return 'Write this in your own words — your student needs YOU, not a template.';
  }
  return null;
}

interface ChatThreadProps {
  /** The pair these messages belong to. */
  studentId: string;
  buddyId: string;
  /** The authenticated user — id of the person viewing this thread. */
  meId: string;
  /** Name shown in the header (the OTHER person in the pair). */
  otherName: string;
  /** Header subtitle (e.g. expectation line). */
  subtitle?: string;
  /** Initial messages (chronological, oldest first). */
  initialMessages: ChatMessage[];
  /**
   * For a buddy, the studentId of the thread (so the server knows which pair).
   * Omitted/undefined when the viewer is the student.
   */
  sendStudentId?: string;
  /**
   * True when rendered as a tab inside another page (the student's merged
   * Buddy panel) rather than as a standalone route. Standalone uses a fixed
   * panel sized off the app chrome; embedded fills whatever height its
   * parent gives it instead, since a page header + tab switcher now sits
   * above it that the fixed offset doesn't know about.
   */
  embedded?: boolean;
}

export function ChatThread({
  studentId,
  buddyId,
  meId,
  otherName,
  subtitle,
  initialMessages,
  sendStudentId,
  embedded = false,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [aiBullets, setAiBullets] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const upload = useAttachmentUpload(sendStudentId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const seenIds = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  // Mark thread read on mount and refresh the layout so the nav badge clears.
  useEffect(() => {
    void fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sendStudentId ? { studentId: sendStudentId } : {}),
    }).then(() => {
      // Re-run server components so the unread badge in the layout reflects 0.
      router.refresh();
    }).catch(() => {});
  }, [sendStudentId, router]);

  // Realtime: append incoming messages for this exact pair. RLS guarantees
  // only pair members receive rows.
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${studentId}:${buddyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.buddy_id !== buddyId) return; // not our pair
          if (seenIds.current.has(msg.id)) return; // already have it (e.g. own optimistic)
          seenIds.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, studentId, buddyId]);

  // Auto-scroll whenever the message list grows.
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const send = useCallback(async () => {
    const body = draft.trim();
    // A file with no covering note is a normal thing to send.
    if ((!body && !upload.ready) || sending || upload.uploading) return;

    // Authorship gate — buddy only, only when AI facts were loaded.
    if (aiBullets) {
      const err = checkAuthorship(aiBullets, body);
      if (err) {
        setSendError(err);
        return;
      }
    }
    setSendError(null);
    setSending(true);

    const pending = upload.ready;

    // Optimistic message.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      student_id: studentId,
      buddy_id: buddyId,
      sender_id: meId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      attachment_kind: pending?.kind ?? null,
      attachment_name: pending?.filename ?? null,
      attachment_mime: pending?.mime ?? null,
      attachment_size: pending?.size ?? null,
    };
    seenIds.current.add(tempId);
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setAiBullets(null);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          ...(sendStudentId ? { studentId: sendStudentId } : {}),
          ...(pending
            ? { attachment: { path: pending.path, filename: pending.filename, mime: pending.mime } }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server deleted the stored object (verification failed), so the
        // pending path can never send. Re-upload the file we are still
        // holding — fresh path — and surface the real reason.
        if (json.attachmentGone && pending) upload.reupload();
        throw new Error(json.error ?? 'send failed');
      }
      const { message } = json as { message: ChatMessage };
      upload.clear();
      // Swap optimistic for the real row.
      seenIds.current.delete(tempId);
      seenIds.current.add(message.id);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
    } catch (e) {
      // Roll back optimistic message and restore draft. The attachment is
      // deliberately KEPT — it uploaded fine, and making someone re-pick a
      // 15 MB file because the message row failed would be cruel.
      seenIds.current.delete(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      setSendError(e instanceof Error && e.message !== 'send failed'
        ? e.message
        : "Couldn't send — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, aiBullets, studentId, buddyId, meId, sendStudentId, upload]);

  const generateDraft = useCallback(async () => {
    if (!sendStudentId || generatingDraft) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch('/api/chat/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: sendStudentId }),
      });
      if (!res.ok) return;
      const { draft: generated } = (await res.json()) as { draft: string };
      if (!generated) return;
      // Show bullets in the facts panel — do NOT put them in the textarea.
      setAiBullets(generated);
      setSendError(null);
    } catch {
      // Silent — buddy still has the empty textarea
    } finally {
      setGeneratingDraft(false);
    }
  }, [sendStudentId, generatingDraft]);

  const isBuddy = !!sendStudentId;

  return (
    /*
     * Fixed panel: fills the space between the app header (~6rem from top) and
     * the bottom nav (~4.5rem from bottom, accounting for nav content + padding).
     * Using fixed + inline top/bottom avoids layout-shift issues on mobile.
     */
    <div
      className={embedded ? 'h-full flex flex-col' : 'fixed left-0 right-0 flex flex-col max-w-2xl mx-auto px-4'}
      style={embedded ? undefined : { top: '6rem', bottom: '4.5rem' }}
    >
      {/* Header. The report/block control lives here rather than per-message:
          in a 1:1 thread you report the person, not one line. Required by
          App Store 1.2 and Play's UGC policy — see lib/chat-safety. */}
      <div className="shrink-0 pb-3 mb-1 border-b border-stone-200">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
            {otherName}
          </h1>
          <ReportConversation otherId={meId === studentId ? buddyId : studentId} otherName={otherName} />
        </div>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-sm text-stone-500">Say hi to your buddy 👋</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
                    mine
                      ? 'bg-stone-800 text-white rounded-br-sm'
                      : 'bg-stone-100 text-stone-900 rounded-bl-sm'
                  )}
                >
                  {m.attachment_kind && <AttachmentBubble message={m} mine={mine} />}
                  {m.body && <span className={cn(m.attachment_kind && 'mt-1.5 block')}>{m.body}</span>}
                  <span
                    className={cn(
                      'block text-[10px] mt-1 text-right',
                      mine ? 'text-stone-400' : 'text-stone-400'
                    )}
                  >
                    {new Date(m.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 pt-2 border-t border-stone-200 space-y-2">
        {/* Generate Draft — buddy only, deliberate tap */}
        {isBuddy && (
          <button
            onClick={generateDraft}
            disabled={generatingDraft}
            className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 disabled:opacity-40 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generatingDraft ? 'Loading facts…' : 'Get reply facts'}
          </button>
        )}

        {/* AI facts panel — buddy writes their message FROM these, not from the textarea */}
        {aiBullets && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-800 relative">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-teal-700 mb-1.5">Facts to write from</p>
              <button
                onClick={() => { setAiBullets(null); setSendError(null); }}
                className="shrink-0 text-teal-400 hover:text-teal-700 mt-0.5"
                aria-label="Dismiss facts"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">{aiBullets}</pre>
          </div>
        )}

        {sendError && (
          <p className="text-xs text-red-600 font-medium">{sendError}</p>
        )}

        {/* Pending attachment — one per message, cancellable mid-upload. */}
        {(upload.file || upload.ready) && (
          <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
            {upload.ready?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={upload.ready.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            ) : (
              <Paperclip className="h-4 w-4 shrink-0 text-stone-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-stone-800">{upload.label}</p>
              {upload.uploading ? (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-[width] duration-150"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              ) : (
                <p className="text-[11px] text-teal-700">Ready to send</p>
              )}
            </div>
            <button
              type="button"
              onClick={upload.cancel}
              aria-label={upload.uploading ? 'Cancel upload' : 'Remove attachment'}
              className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {upload.error && <p className="text-xs font-medium text-red-600">{upload.error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset the input so picking the SAME file twice still fires.
              e.target.value = '';
              if (file) void upload.start(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.uploading || !!upload.ready}
            aria-label="Attach a file"
            title="Attach an image or document"
            className="shrink-0 w-11 h-11 rounded-full text-stone-500 flex items-center justify-center transition-colors hover:bg-stone-100 disabled:opacity-40"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={aiBullets ? 'Write your message from the facts above…' : 'Type a message…'}
            className="flex-1 resize-none rounded-2xl border border-stone-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/40 focus:border-teal-600 max-h-32"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !upload.ready) || sending || upload.uploading}
            aria-label="Send message"
            className="shrink-0 w-11 h-11 rounded-full bg-orange-600 text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-700"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
