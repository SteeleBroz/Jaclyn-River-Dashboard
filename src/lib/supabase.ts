import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type Folder = {
  id: number
  name: string
  description: string | null
  voice_persona: string | null
  color: string
  created_at: string
}

export const FOLDERS_TABLE = 'folders'
export const TASKS_TABLE = 'tasks'

export type Task = {
  id: number
  title: string
  description: string | null
  folder: string
  assignee: string
  status: string
  priority: string
  due_date: string | null
  depends_on_task_id: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
  // Virtual fields for dashboard functionality
  day_of_week?: string
  board?: string
  owner?: string
  completed?: boolean
  notes?: string
  sort_order?: number
}

export type CalendarEvent = {
  id: number
  title: string
  description: string | null
  date: string
  time?: string
  created_at: string
}

export type WeeklyNote = {
  id: number
  content: string
  author: string
  week_start: string
  created_at: string
  seen: boolean
}
