export interface ChatMessage {
  id: string;
  student_id: string;
  buddy_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** One optional attachment per message. The file itself lives in private storage. */
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_kind?: 'image' | 'document' | null;
  /** Soft delete: set when the sender deleted this message for everyone. */
  deleted_at?: string | null;
}
