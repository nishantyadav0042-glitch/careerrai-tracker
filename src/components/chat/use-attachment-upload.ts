'use client';

import { useCallback, useRef, useState } from 'react';
import { validateDeclaredFile, humanSize, type AttachmentKind } from '@/lib/chat-attachments';

// Uploading a file from the chat composer.
//
// XHR rather than fetch, for one reason: fetch cannot report upload progress.
// A student on Indian mobile data pushing a 15 MB PDF needs to see it moving,
// or they assume it hung and tap again.
//
// The file goes STRAIGHT to storage, not through our API. A Vercel serverless
// request body caps out around 4.5 MB, so a 20 MB document physically cannot
// be posted to a route handler. The server issues a signed URL, the browser
// uploads to it, and the server verifies the bytes afterwards.

export interface PendingAttachment {
  path: string;
  filename: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  /** Local preview for images, so a thumbnail appears with no round trip. */
  previewUrl: string | null;
}

export interface UploadState {
  file: File | null;
  progress: number;          // 0–100
  uploading: boolean;
  ready: PendingAttachment | null;
  error: string | null;
}

const IDLE: UploadState = { file: null, progress: 0, uploading: false, ready: null, error: null };

export function useAttachmentUpload(studentId?: string) {
  const [state, setState] = useState<UploadState>(IDLE);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const previewRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    revokePreview();
    setState(IDLE);
  }, [revokePreview]);

  const start = useCallback(async (file: File) => {
    // Same rules the server enforces, run here first purely so the user hears
    // "that's a video" instantly instead of after a round trip. The server
    // does not trust any of this.
    const check = validateDeclaredFile(file.name, file.type, file.size);
    if (!check.ok) {
      setState({ ...IDLE, error: check.error });
      return;
    }

    revokePreview();
    const preview = check.kind === 'image' ? URL.createObjectURL(file) : null;
    previewRef.current = preview;
    setState({ file, progress: 0, uploading: true, ready: null, error: null });

    let signed: { uploadUrl: string; path: string; kind: AttachmentKind; mime: string };
    try {
      const res = await fetch('/api/chat/attachment/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name, mime: file.type, size: file.size,
          ...(studentId ? { studentId } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        revokePreview();
        setState({ ...IDLE, error: json.error ?? "Couldn't start the upload." });
        return;
      }
      signed = json;
    } catch {
      revokePreview();
      setState({ ...IDLE, error: 'Network problem — try again.' });
      return;
    }

    // Supabase returns a path or a full URL depending on version; accept both.
    const url = signed.uploadUrl.startsWith('http')
      ? signed.uploadUrl
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${signed.uploadUrl}`;

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('content-type', file.type);
      xhr.setRequestHeader('x-upsert', 'false');

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        setState((s) => (s.uploading ? { ...s, progress: Math.round((e.loaded / e.total) * 100) } : s));
      };
      xhr.onload = () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setState({
            file, progress: 100, uploading: false, error: null,
            ready: {
              path: signed.path, filename: file.name, mime: signed.mime,
              kind: signed.kind, size: file.size, previewUrl: preview,
            },
          });
        } else {
          revokePreview();
          setState({ ...IDLE, error: "That upload didn't go through. Try again." });
        }
        resolve();
      };
      xhr.onerror = () => {
        xhrRef.current = null;
        revokePreview();
        // Distinguishing a dropped connection from a rejected upload matters:
        // one is worth retrying immediately, the other is not.
        setState({ ...IDLE, error: 'Connection dropped during upload. Try again.' });
        resolve();
      };
      xhr.onabort = () => { xhrRef.current = null; resolve(); };

      xhr.send(file);
    });
  }, [studentId, revokePreview]);

  /** Called after a successful send — the object URL must not leak. */
  const clear = useCallback(() => {
    revokePreview();
    setState(IDLE);
  }, [revokePreview]);

  return {
    ...state,
    label: state.file ? `${state.file.name} · ${humanSize(state.file.size)}` : null,
    start, cancel: reset, clear,
    setError: (error: string | null) => setState((s) => ({ ...s, error })),
  };
}
