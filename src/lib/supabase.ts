import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type Folder = {
  id: string
  name: string
  color: string
  sort_order: number
}

export type Task = {
  id: string
  title: string
  day_of_week: string
  board: string
  priority: string
  due_date: string | null
  notes: string | null
  folder_id: string | null
  owner: string
  completed: boolean
  sort_order: number
  created_at: string
}
