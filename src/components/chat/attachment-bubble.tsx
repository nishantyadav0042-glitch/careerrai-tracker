'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Download, ImageOff } from 'lucide-react';
import { humanSize } from '@/lib/chat-attachments';
import type { ChatMessage } from './types';

// An attachment inside a message bubble.
//
// The file lives in a private bucket, so nothing here has a URL until it asks
// for one. Images ask when they scroll into view — a thread with twenty
// screenshots must not fire twenty signed-URL requests on mount, and a signed
// URL fetched for a bubble nobody looks at expires unused anyway. Documents
// never fetch until tapped.

const DOWNLOAD_ENDPOINT = (id: string) => `/api/chat/attachment/${id}`;

async function fetchSignedUrl(messageId: string): Promise<string | null> {
  try {
    const res = await fetch(DOWNLOAD_ENDPOINT(messageId));
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  } catch {
    return null;
  }
}

export function AttachmentBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const kind = message.attachment_kind;
  if (!kind) return null;
  return kind === 'image'
    ? <ImageAttachment message={message} />
    : <DocumentAttachment message={message} mine={mine} />;
}

function ImageAttachment({ message }: { message: ChatMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || url || failed) return;

    // Optimistic ids from an in-flight send have no row to sign against yet.
    if (message.id.startsWith('temp-')) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      const signed = await fetchSignedUrl(message.id);
      if (signed) setUrl(signed); else setFailed(true);
    }, { rootMargin: '200px' });

    observer.observe(el);
    return () => observer.disconnect();
  }, [message.id, url, failed]);

  return (
    <div ref={ref} className="mt-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={message.attachment_name ?? 'Attachment'}
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-64 w-auto max-w-full rounded-xl border border-black/5 object-cover"
          />
        </a>
      ) : failed ? (
        <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-6 text-[12.5px] text-stone-500">
          <ImageOff className="h-4 w-4" /> Couldn&apos;t load this image
        </div>
      ) : (
        // Fixed-height skeleton so the thread does not jump as images resolve.
        <div className="h-40 w-52 animate-pulse rounded-xl bg-black/10" />
      )}
    </div>
  );
}

function DocumentAttachment({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [opening, setOpening] = useState(false);

  async function open() {
    if (opening || message.id.startsWith('temp-')) return;
    setOpening(true);
    const url = await fetchSignedUrl(message.id);
    // Opened in a new tab rather than navigated to: the signed URL is short
    // lived, and losing the chat thread to a PDF viewer is its own annoyance.
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setOpening(false);
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        mine ? 'bg-white/15 hover:bg-white/25' : 'bg-black/5 hover:bg-black/10'
      }`}
    >
      <FileText className={`h-5 w-5 shrink-0 ${mine ? 'text-white' : 'text-stone-500'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] font-semibold ${mine ? 'text-white' : 'text-stone-800'}`}>
          {message.attachment_name ?? 'Document'}
        </span>
        <span className={`block text-[11px] ${mine ? 'text-white/70' : 'text-stone-500'}`}>
          {message.attachment_size ? humanSize(message.attachment_size) : ''}
          {opening ? ' · opening…' : ''}
        </span>
      </span>
      <Download className={`h-4 w-4 shrink-0 ${mine ? 'text-white/80' : 'text-stone-400'}`} />
    </button>
  );
}
