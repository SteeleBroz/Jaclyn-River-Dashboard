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
  week_start?: string | null  // New field for week navigation
  day_of_week?: string | null // Now persisted, not just virtual
  // Virtual fields for dashboard functionality
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
  folder: string
  date: string
  time?: string
  endTime?: string
  created_at: string
  recurrence_type?: string | null
  recurrence_interval?: number | null
  recurrence_end_date?: string | null
  recurrence_parent_id?: number | null
}

export type WeeklyNote = {
  id: number
  content: string
  author: string
  week_start: string
  created_at: string
  seen: boolean
}

export type DashboardSettings = {
  id: number
  vision_statement: string
  header_words: string
  profile_image_url: string | null
  created_at: string
  updated_at: string
}
