import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  email: string | null;
}

export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
});
