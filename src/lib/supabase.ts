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
export const PERSONAL_HUB_TABLE = 'personal_hub_items'

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
  sort_order?: number | null  // For within-day task ordering
  // Virtual fields for dashboard functionality
  board?: string
  owner?: string
  completed?: boolean
  notes?: string
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

export type PersonalHubItem = {
  id: number
  type: 'folder' | 'doc' | 'sheet'
  title: string
  subtitle: string | null
  url: string | null
  notes: string | null
  parent_id: number | null
  created_at: string
  updated_at: string
}

export type GroceryItem = {
  id: number
  store: 'costco' | 'publix' | 'random'
  text: string
  sort_order: number
  checked: boolean
  created_at: string
}

export type IdeaItem = {
  id: number
  text: string
  list_key: 'ideas' | 'backlog' | 'goal_1m' | 'goal_3m' | 'goal_6m' | 'goal_1y' | 'goal_5y'
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
}

export type ThumbEquityItem = {
  id: number
  date: string
  account_name: string
  handle: string
  category: 'Relationship' | 'Discovery' | 'Community'
  niche: string | null
  follower_count: string | null
  instagram_link: string
  primary_comment: string
  backup_comment: string | null
  why_selected: string | null
  content_summary: string | null
  is_story_tap: boolean
  completed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type LifeAdminCard = {
  id: number
  title: string
  notes: string | null
  column_key: 'priority' | 'life-improvement' | 'ideas-business' | 'done'
  priority: string | null
  category: string | null
  sort_order: number
  completed: boolean
  tab_source: string
  created_at: string
  updated_at: string
}

export type ParkingLotCard = {
  id: number
  title: string
  description: string | null
  notes: string | null
  bucket: 'Vacations' | 'Family Fun Ideas' | 'Movies' | 'Shows' | 'Medical' | 'Unsorted'
  tag: string
  sort_order: number
  tab_source: string
  created_at: string
  updated_at: string
}

export type CardItem = {
  id: string
  card_id: number
  card_tab: 'life-admin' | 'parking-lot' | 'financial'
  label: string
  completed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type RoadmapTask = {
  id: number
  phase_index: number
  milestone_index: number
  milestone_id: number | null  // stable FK — null for legacy tasks
  title: string
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
}

export type WeeklyMission = {
  id: number
  week_start: string
  slot: number
  title: string
  source_type: string
  roadmap_task_id: number | null
  completed: boolean
  rolled_over: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type BillNote = {
  id: number
  content: string
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
}

export type RoadmapPhase = {
  id: number
  name: string
  goal: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type RoadmapMilestone = {
  id: number
  phase_id: number
  title: string
  completed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type PromptCard = {
  id: number
  title: string
  prompt: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type DayPlan = {
  id: string
  label: string
  emoji: string
  days: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type TimeBlock = {
  id: string
  day_plan_id: string
  time: string
  title: string
  note: string | null
  variant: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type BlockOption = {
  id: string
  time_block_id: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type DayTarget = {
  id: string
  day_plan_id: string
  bottles_target: string
  packets_target: number
  protein_g: number | null
  cal_floor: number | null
}

export type ShoppingItem = {
  id: string
  store: 'costco' | 'publix'
  category: string
  category_sort_order: number
  name: string
  note: string | null
  checked: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type HydrationLog = {
  id: string
  log_date: string
  day_plan_id: string | null
  bottles_count: number
  packets_count: number
}

export type LibraryCard = {
  id: string
  category: string
  title: string
  body: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type LibraryFile = {
  id: string
  card_id: string
  file_name: string
  file_type: string
  storage_path: string
  sort_order: number
  created_at: string
}

export type FinancialCard = {
  id: number
  category: string
  title: string
  notes: string | null
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
}
