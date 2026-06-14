export interface ChatMessage {
  id: string;
  student_id: string;
  buddy_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
