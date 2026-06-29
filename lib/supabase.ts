import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Post {
  id: number;
  nickname: string;
  content: string;
  likes: number;
  created_at: string;
  comments?: Comment[];
}

export interface Comment {
  id: number;
  post_id: number;
  nickname: string;
  content: string;
  created_at: string;
}
