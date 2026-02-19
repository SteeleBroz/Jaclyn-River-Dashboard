'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Folder, Task, CalendarEvent, WeeklyNote, DashboardSettings, GroceryItem, FOLDERS_TABLE, TASKS_TABLE } from '@/lib/supabase'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','overflow'] as const
const DAY_LABELS: Record<string, string> = {
  monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
  friday:'Fri', saturday:'Sat', sunday:'Sun', overflow:'Overflow'
}
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-blue-500'
}

// Get week dates for a specific date in NY timezone
const getWeekDates = (referenceDate: Date) => {
  // Create a new Date to avoid mutating the original
  const workingDate = new Date(referenceDate)
  
  // Convert to NY timezone and get the day
  const nyDateStr = workingDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD format
  const nyDate = new Date(nyDateStr + 'T12:00:00') // Parse as local date at noon to avoid timezone shifts
  const currentDay = nyDate.getDay()
  
  // Calculate Monday of this week
  const startOfWeek = new Date(nyDate)
  startOfWeek.setDate(nyDate.getDate() - (currentDay === 0 ? 6 : currentDay - 1)) // Monday start
  
  const weekDates = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    weekDates.push(date)
  }
  
  const weekStart = weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  const weekEnd = weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  
  return {
    dates: weekDates,
    weekRange: `${weekStart} - ${weekEnd}`,
    weekStartDate: startOfWeek.toISOString().split('T')[0] // Monday as YYYY-MM-DD
  }
}

export default function Home() {
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [weeklyNotes, setWeeklyNotes] = useState<WeeklyNote[]>([])
  const [activeTab, setActiveTab] = useState<'jaclyn' | 'river' | 'grocery' | 'digest' | 'sendouts'>('jaclyn')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'year'>('month')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [hideCompleted, setHideCompleted] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      return {
        jaclyn: localStorage.getItem('hideCompleted_jaclyn') === 'true',
        river: localStorage.getItem('hideCompleted_river') === 'true', 
        digest: false, 
        sendouts: false 
      }
    }
    return { jaclyn: false, river: false, digest: false, sendouts: false }
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [hidePastThisWeek, setHidePastThisWeek] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  
  // Drag & Drop state for weekly tasks
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [draggedElement, setDraggedElement] = useState<HTMLElement | null>(null)
  
  // Grocery List state
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([])
  const [draggedGroceryItem, setDraggedGroceryItem] = useState<GroceryItem | null>(null)
  const [draggedGroceryElement, setDraggedGroceryElement] = useState<HTMLElement | null>(null)
  const [hideCheckedGrocery, setHideCheckedGrocery] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hideCheckedGrocery') === 'true'
    }
    return false
  })
  
  
  // Daily Digest state
  const [dailyDigest, setDailyDigest] = useState<{
    date: string;
    item_world: string;
    item_culture: string; 
    item_prosports: string;
    item_tampa: string;
    item_athlete: string;
    read_world: boolean;
    read_culture: boolean;
    read_prosports: boolean;
    read_tampa: boolean;
    read_athlete: boolean;
  } | null>(null)
  const [savedDigestItems, setSavedDigestItems] = useState<{
    id: number;
    date_saved: string;
    category: string;
    text: string;
    source_url?: string;
    notes?: string;
  }[]>([])
  const [savedFilter, setSavedFilter] = useState<string>('All')
  const [hideRead, setHideRead] = useState<boolean>(true)
  
  // Send Outs state
  const [sendOuts, setSendOuts] = useState<{
    date: string;
    message_stryker: string | null;
    message_jet: string | null;
    message_parents: string | null;
    message_friends: string | null;
    sent_stryker: boolean;
    sent_jet: boolean;
    sent_parents: boolean;
    sent_friends: boolean;
  } | null>(null)
  const [savedSendOuts, setSavedSendOuts] = useState<{
    id: number;
    category: string;
    text: string;
    date_saved: string;
  }[]>([])
  const [hideSent, setHideSent] = useState<boolean>(true)
  
  // Hide past events state
  const [hidePastEvents, setHidePastEvents] = useState<boolean>(true)
  
  // Temporary debug state for mobile
  const [debugInfo, setDebugInfo] = useState<string>('')
  
  // Recurring event state
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'weekly' | 'every4weeks'>('none')
  const [weeklyDays, setWeeklyDays] = useState<string[]>([])
  const [recurrenceEndType, setRecurrenceEndType] = useState<'date' | 'count'>('date')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('')
  const [recurrenceCount, setRecurrenceCount] = useState<number>(10)
  
  // Admin Mode state
  const [adminMode, setAdminMode] = useState<boolean>(false)
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings | null>(null)
  const [editingVision, setEditingVision] = useState<boolean>(false)
  const [editingHeader, setEditingHeader] = useState<boolean>(false)
  const [visionText, setVisionText] = useState<string>('')
  const [headerWords, setHeaderWords] = useState<string>('')
  const [uploadingImage, setUploadingImage] = useState<boolean>(false)
  const headerWordsRef = useRef<HTMLDivElement>(null)
  const tapCountRef = useRef<number>(0)
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Week navigation state - persist across page refreshes
  const [selectedWeek, setSelectedWeek] = useState<Date>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedWeek')
      if (stored) {
        const date = new Date(stored)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
    return new Date()
  })

  // Save selectedWeek to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedWeek', selectedWeek.toISOString())
    }
  }, [selectedWeek])

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setSyncing(true)
    try {
      const { weekStartDate } = getWeekDates(selectedWeek)
      console.log('🔍 Selected Week:', selectedWeek.toISOString())
      console.log('🔍 Computed week_start for query:', weekStartDate)
      
      const [{ data: f }, { data: t }, { data: e }, { data: n }, groceryResult] = await Promise.all([
        supabase.from(FOLDERS_TABLE).select('*').order('id'),
        supabase.from(TASKS_TABLE)
          .select('*')
          .eq('week_start', weekStartDate), // Only exact week match - no fallback
        supabase.from('posts').select('*').eq('platform', 'calendar').order('scheduled_for'),
        supabase.from('posts').select('*').eq('platform', 'weekly-notes').order('created_at', { ascending: false }),
        supabase.from('grocery_items').select('*').order('sort_order').then(
          result => result, 
          error => ({ data: null, error }) // Handle missing table gracefully
        )
      ])
      if (f) setFolders(f)
      if (t) {
        console.log('🔍 Raw tasks from DB:', t.length, 'tasks')
        console.log('🔍 First task sample:', t[0])
        
        // Map existing schema to expected dashboard format
        const mappedTasks = t.map(task => ({
          ...task,
          owner: task.assignee,
          completed: !!task.completed_at,
          notes: task.description,
          day_of_week: task.day_of_week || 'monday', // Use stored value or default
          board: task.assignee === 'jaclyn' ? 'jaclyn' : 'river',
          // DON'T override sort_order - preserve DB value
          week_start: task.week_start // Don't override - use exact DB value
        }))
        
        console.log('📥 FETCHED TASKS with sort_order:', mappedTasks.map(t => ({ 
          id: t.id, 
          title: t.title, 
          sort_order: t.sort_order 
        })))
        setTasks(mappedTasks)
        console.log('🔍 Mapped tasks:', mappedTasks.length, 'tasks for week', weekStartDate)
      }
      if (e) {
        // Map posts table to calendar events
        const mappedEvents = e.map(post => {          
          // Parse scheduled_for for start time
          const date = post.scheduled_for?.split('T')[0] || new Date().toISOString().split('T')[0]
          const time = post.scheduled_for?.split('T')[1]?.substring(0, 5)
          
          return {
            id: post.id,
            title: post.title,
            description: post.content || '', // Raw content as description
            folder: post.folder || 'PERSONAL', // Folder name for color coding
            date,
            time,
            endTime: undefined, // End time disabled for now
            created_at: post.created_at
          }
        })
        setEvents(mappedEvents)
      }
      if (n) {
        // Map posts table to weekly notes
        const mappedNotes = n.map(post => ({
          id: post.id,
          content: post.content || '',
          author: post.folder || '',
          week_start: post.title || '',
          created_at: post.created_at,
          seen: post.status === 'seen'
        }))
        setWeeklyNotes(mappedNotes)
      }
      if (groceryResult.data) {
        setGroceryItems(groceryResult.data)
      } else if (groceryResult.error) {
        console.warn('Grocery items table not found - please create it:', groceryResult.error.message)
        setGroceryItems([]) // Set empty array as fallback
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [selectedWeek]) // Include selectedWeek in dependencies

  // Week navigation functions
  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedWeek(prev => {
      const newWeek = new Date(prev)
      newWeek.setDate(prev.getDate() + (direction === 'next' ? 7 : -7))
      return newWeek
    })
  }

  const goToCurrentWeek = () => {
    setSelectedWeek(new Date())
  }

  // Dashboard Settings functions
  const fetchDashboardSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('dashboard_settings')
        .select('*')
        .eq('id', 1)
        .single()
      
      if (error) {
        console.warn('Dashboard settings not available:', error)
        // Set default values if table doesn't exist yet
        setDashboardSettings({
          id: 1,
          vision_statement: 'Living with purpose, intention, love, and calm. Building wealth, deep connections, and time freedom while raising boys into confident, disciplined men.',
          header_words: 'FAMILY · WEALTH · LOVE · CONNECTION · HEALTH · PEACE · HAPPINESS',
          profile_image_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        return
      }
      
      if (data) {
        setDashboardSettings(data)
        setVisionText(data.vision_statement)
        setHeaderWords(data.header_words)
      }
    } catch (error) {
      console.warn('Failed to fetch dashboard settings:', error)
    }
  }, [])

  // Admin Mode functions
  const handleHeaderWordsClick = () => {
    tapCountRef.current += 1
    
    // Clear existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current)
    }
    
    // Set timeout to reset tap count
    tapTimeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0
    }, 500) // 500ms window for triple-tap
    
    // Check for triple-tap
    if (tapCountRef.current >= 3) {
      setAdminMode(!adminMode)
      tapCountRef.current = 0
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
      }
    }
  }

  const saveVisionStatement = async () => {
    if (!dashboardSettings) return
    
    try {
      const { error } = await supabase
        .from('dashboard_settings')
        .update({
          vision_statement: visionText,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
      
      if (error) throw error
      
      setDashboardSettings(prev => prev ? { ...prev, vision_statement: visionText } : null)
      setEditingVision(false)
    } catch (error) {
      console.error('Failed to save vision statement:', error)
      alert('Failed to save vision statement. Please try again.')
    }
  }

  const saveHeaderWords = async () => {
    if (!dashboardSettings) return
    
    try {
      const { error } = await supabase
        .from('dashboard_settings')
        .update({
          header_words: headerWords,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
      
      if (error) throw error
      
      setDashboardSettings(prev => prev ? { ...prev, header_words: headerWords } : null)
      setEditingHeader(false)
    } catch (error) {
      console.error('Failed to save header words:', error)
      alert('Failed to save header words. Please try again.')
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }
    
    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB.')
      return
    }
    
    setUploadingImage(true)
    
    try {
      // Generate unique filename
      const timestamp = Date.now()
      const extension = file.name.split('.').pop()
      const filename = `profile/family-${timestamp}.${extension}`
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('dashboard-assets')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (uploadError) throw uploadError
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('dashboard-assets')
        .getPublicUrl(filename)
      
      if (!urlData.publicUrl) throw new Error('Failed to get public URL')
      
      // Update dashboard settings
      const { error: updateError } = await supabase
        .from('dashboard_settings')
        .update({
          profile_image_url: urlData.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
      
      if (updateError) throw updateError
      
      setDashboardSettings(prev => prev ? { 
        ...prev, 
        profile_image_url: urlData.publicUrl 
      } : null)
      
    } catch (error) {
      console.error('Failed to upload image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  // NY Timezone Helpers
  const toNYDateKey = (scheduled_for: string) => {
    // Parse UTC timestamp and convert to NY date (YYYY-MM-DD)
    const utcDate = new Date(scheduled_for)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
    return formatter.format(utcDate) // Returns YYYY-MM-DD in NY timezone
  }

  const toNYTimeDisplay = (scheduled_for: string) => {
    // Parse UTC timestamp and convert to NY time display (h:mm AM/PM)
    const utcDate = new Date(scheduled_for)
    return utcDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit', 
      hour12: true,
      timeZone: 'America/New_York'
    })
  }

  // Date helpers for America/New_York timezone
  const getTodayNY = () => {
    const now = new Date()
    // Use Intl.DateTimeFormat to avoid timezone shift issues
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
    return formatter.format(now) // Returns YYYY-MM-DD directly
  }

  const getCurrentNYTime = () => {
    const now = new Date()
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  }

  const isPastEvent = (event: CalendarEvent) => {
    const currentNY = getCurrentNYTime()
    
    // Use end time if available, otherwise start time
    let cutoffTime = event.time || '12:00' // Default to noon if no start time
    if (event.endTime) {
      cutoffTime = event.endTime
    }
    
    // Combine event date with cutoff time
    const eventCutoff = new Date(`${event.date}T${cutoffTime}:00`)
    return currentNY > eventCutoff
  }

  const isPastDay = (dayDate: string) => {
    const todayNY = getTodayNY()
    return dayDate < todayNY
  }

  const formatDateNY = (dateString: string) => {
    // Parse date and format in NY timezone
    const date = new Date(dateString + 'T12:00:00') // Add noon to avoid timezone edge cases
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric',
      timeZone: 'America/New_York'
    })
  }

  const formatEventTime = (time24: string) => {
    // Convert 24-hour format (HH:mm) to 12-hour format with AM/PM
    const [hours, minutes] = time24.split(':')
    
    // Create a date in a neutral way to avoid timezone shift issues
    const date = new Date(2000, 0, 1, parseInt(hours), parseInt(minutes), 0, 0)
    
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit', 
      hour12: true,
      timeZone: 'America/New_York'
    })
  }

  // Duplicate isPastEvent function removed

  // Daily Digest functions
  const fetchDigestData = useCallback(async () => {
    try {
      // Fetch today's digest using NY timezone
      const todayNY = getTodayNY()
      console.log('Daily Digest - Querying for NY date:', todayNY)
      const { data: digestData } = await supabase
        .from('daily_digest_today')
        .select('*')
        .eq('date', todayNY)
        .single()
      
      if (digestData) {
        setDailyDigest(digestData)
      }
      
      // Fetch saved items
      const { data: savedData } = await supabase
        .from('saved_digest_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (savedData) {
        setSavedDigestItems(savedData)
      }
    } catch (error) {
      console.warn('Daily digest data not available:', error)
      // Fail silently - digest feature is optional
    }
  }, [])

  const saveDigestItem = async (text: string, category: string) => {
    try {
      const { data, error } = await supabase
        .from('saved_digest_items')
        .insert({
          text,
          category,
          date_saved: getTodayNY()
        })
        .select()
        .single()
      
      if (error) throw error
      
      if (data) {
        setSavedDigestItems(prev => [data, ...prev])
      }
    } catch (error) {
      console.error('Failed to save digest item:', error)
      alert('Failed to save item. Please try again.')
    }
  }

  const markDigestItemRead = async (category: string, isRead: boolean) => {
    if (!dailyDigest) return
    
    try {
      // Proper mapping from category to database field
      const categoryToReadField: Record<string, string> = {
        'World': 'read_world',
        'Culture': 'read_culture',
        'Pro Sports': 'read_prosports',
        'Tampa Local': 'read_tampa',
        'Athlete Dev': 'read_athlete'
      }
      
      const readField = categoryToReadField[category]
      if (!readField) {
        console.error('Unknown category for read field:', category)
        return
      }
      
      const { error } = await supabase
        .from('daily_digest_today')
        .update({ [readField]: isRead })
        .eq('date', dailyDigest.date)
      
      if (error) throw error
      
      setDailyDigest(prev => prev ? { ...prev, [readField]: isRead } : null)
    } catch (error) {
      console.error('Failed to mark item as read:', error)
    }
  }

  const deleteSavedItem = async (itemId: number) => {
    if (!confirm('Delete this saved item?')) return
    
    try {
      const { error } = await supabase
        .from('saved_digest_items')
        .delete()
        .eq('id', itemId)
      
      if (error) throw error
      
      setSavedDigestItems(prev => prev.filter(item => item.id !== itemId))
    } catch (error) {
      console.error('Failed to delete saved item:', error)
      alert('Failed to delete item. Please try again.')
    }
  }

  // Send Outs functions
  const fetchSendOutsData = useCallback(async () => {
    try {
      // Fetch today's send outs using NY timezone
      const todayNY = getTodayNY()
      console.log('Send Outs - Querying for NY date:', todayNY)
      const { data: sendOutsData } = await supabase
        .from('send_out_today')
        .select('*')
        .eq('date', todayNY)
        .single()
      
      if (sendOutsData) {
        setSendOuts(sendOutsData)
      }
      
      // Fetch saved send outs
      const { data: savedData } = await supabase
        .from('saved_send_outs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (savedData) {
        setSavedSendOuts(savedData)
      }
    } catch (error) {
      console.warn('Send outs data not available:', error)
      // Fail silently - send outs feature is optional
    }
  }, [])

  const saveSendOutMessage = async (text: string, category: string) => {
    try {
      const { data, error } = await supabase
        .from('saved_send_outs')
        .insert({
          text,
          category,
          date_saved: getTodayNY()
        })
        .select()
        .single()
      
      if (error) throw error
      
      if (data) {
        setSavedSendOuts(prev => [data, ...prev])
      }
    } catch (error) {
      console.error('Failed to save send out message:', error)
      alert('Failed to save message. Please try again.')
    }
  }

  const markSendOutSent = async (recipient: string, isSent: boolean) => {
    if (!sendOuts) return
    
    try {
      const sentField = `sent_${recipient.toLowerCase()}`
      const { error } = await supabase
        .from('send_out_today')
        .update({ [sentField]: isSent })
        .eq('date', sendOuts.date)
      
      if (error) throw error
      
      setSendOuts(prev => prev ? { ...prev, [sentField]: isSent } : null)
    } catch (error) {
      console.error('Failed to mark send out as sent:', error)
    }
  }

  const deleteSavedSendOut = async (itemId: number) => {
    if (!confirm('Delete this saved message?')) return
    
    try {
      const { error } = await supabase
        .from('saved_send_outs')
        .delete()
        .eq('id', itemId)
      
      if (error) throw error
      
      setSavedSendOuts(prev => prev.filter(item => item.id !== itemId))
    } catch (error) {
      console.error('Failed to delete saved send out:', error)
      alert('Failed to delete message. Please try again.')
    }
  }

  useEffect(() => { 
    fetchData()
    fetchDigestData()
    fetchSendOutsData()
    fetchDashboardSettings()
    
    // Set up real-time subscriptions
    const taskSubscription = supabase
      .channel('tasks-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: TASKS_TABLE },
        (payload) => {
          console.log('Task change:', payload)
          fetchData(true) // Refresh with sync indicator
        }
      )
      .subscribe()

    const folderSubscription = supabase
      .channel('folders-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: FOLDERS_TABLE },
        (payload) => {
          console.log('Folder change:', payload)
          fetchData(true)
        }
      )
      .subscribe()

    const eventSubscription = supabase
      .channel('events-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        (payload) => {
          console.log('Event change:', payload)
          fetchData(true)
        }
      )
      .subscribe()

    // Backup periodic refresh every 30 seconds
    const intervalRefresh = setInterval(() => {
      fetchData(true)
    }, 30000)

    return () => {
      taskSubscription.unsubscribe()
      folderSubscription.unsubscribe()
      eventSubscription.unsubscribe()
      clearInterval(intervalRefresh)
    }
  }, [fetchData])

  const toggleComplete = async (task: Task) => {
    const updated = !task.completed
    const updateData = updated 
      ? { completed_at: new Date().toISOString(), status: 'completed' }
      : { completed_at: null, status: 'pending' }
    await supabase.from(TASKS_TABLE).update(updateData).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: updated, completed_at: updateData.completed_at } : t))
  }

  const addTask = async (board: string, day: string) => {
    const title = prompt('Task title:')
    if (!title?.trim()) return
    
    const { weekStartDate } = getWeekDates(selectedWeek)
    
    const { data } = await supabase.from(TASKS_TABLE).insert({
      title: title.trim(),
      description: '',
      folder: 'PERSONAL',
      assignee: board,
      status: 'pending',
      priority: 'medium',
      week_start: weekStartDate,
      day_of_week: day
    }).select().single()
    
    if (data) {
      const mappedTask = {
        ...data,
        owner: data.assignee,
        completed: false,
        notes: data.description,
        day_of_week: data.day_of_week,
        week_start: data.week_start,
        board,
        sort_order: 0
      }
      setTasks(prev => [...prev, mappedTask])
    }
  }

  const addChecklistItem = async (type: 'daily-digest' | 'send-outs') => {
    const title = prompt('Item:')
    if (!title?.trim()) return
    const { data } = await supabase.from(TASKS_TABLE).insert({
      title: title.trim(),
      description: '',
      folder: type,
      assignee: 'jaclyn',
      status: 'pending',
      priority: 'none'
    }).select().single()
    if (data) {
      const mappedTask = {
        ...data,
        owner: data.assignee,
        completed: false,
        notes: data.description,
        day_of_week: 'monday',
        board: 'jaclyn',
        sort_order: 0
      }
      setTasks(prev => [...prev, mappedTask])
    }
  }

  const addEvent = async (selectedDate?: string, selectedFolder?: string) => {
    const title = prompt('Event title:')
    if (!title?.trim()) return
    
    const date = selectedDate || prompt('Date (YYYY-MM-DD):')
    if (!date?.trim()) return
    
    // Prevent creating new events on past days
    if (isPastDay(date)) {
      alert('Cannot create new events on past days. Past events remain editable.')
      return
    }
    
    const time = prompt('Time (optional, HH:MM):')
    
    // Show folder options if available
    let folder = selectedFolder || 'PERSONAL'
    if (folders.length > 0) {
      const folderOptions = folders.map(f => f.name).join(', ')
      const selectedFolderName = prompt(`Category (${folderOptions}):`, folder)
      if (selectedFolderName?.trim()) folder = selectedFolderName.trim()
    }
    
    const scheduledFor = time?.trim() 
      ? `${date}T${time}:00`
      : `${date}T12:00:00`
    
    const { data } = await supabase.from('posts').insert({
      title: title.trim(),
      content: '',
      folder: folder,
      platform: 'calendar',
      status: 'published',
      scheduled_for: scheduledFor
    }).select().single()
    
    if (data) {
      // Parse scheduled_for for start time
      const mappedDate = data.scheduled_for?.split('T')[0] || date
      const mappedTime = data.scheduled_for?.split('T')[1]?.substring(0, 5)
      
      const mappedEvent = {
        id: data.id,
        title: data.title,
        description: data.content || '', // Raw content as description
        folder: data.folder || 'PERSONAL', // Folder name for color coding
        date: mappedDate,
        time: mappedTime,
        endTime: undefined, // End time disabled for now
        created_at: data.created_at
      }
      setEvents(prev => [...prev, mappedEvent])
    }
  }

  const editEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setDebugInfo('') // Clear debug info when opening modal
  }

  const saveEvent = async (eventData: CalendarEvent) => {
    try {
      // TEMP DEBUG: Track execution path
      setDebugInfo('')
      
      const isRecurring = recurrenceType !== 'none'
      const debugPath = isRecurring ? 'SAVE PATH: recurring' : 'SAVE PATH: one-time'
      setDebugInfo(prev => prev + debugPath + '\n')
      console.log('🔍 DEBUG:', debugPath)
      
      // TEMP DEBUG: Check common validation blockers
      setDebugInfo(prev => prev + `STEP 1: Validation check\n`)
      setDebugInfo(prev => prev + `  - Date: ${eventData.date}\n`)
      setDebugInfo(prev => prev + `  - Time: ${eventData.time || 'none'}\n`)
      setDebugInfo(prev => prev + `  - Title: ${eventData.title}\n`)
      setDebugInfo(prev => prev + `  - RecurrenceType: ${recurrenceType}\n`)
      if (isRecurring && recurrenceType === 'weekly') {
        setDebugInfo(prev => prev + `  - WeeklyDays: ${weeklyDays.length} selected: ${weeklyDays.join(',')}\n`)
      }
      setDebugInfo(prev => prev + `  - RecurrenceEndType: ${recurrenceEndType}\n`)
      setDebugInfo(prev => prev + `  - RecurrenceEndDate: ${recurrenceEndDate}\n`)
      
      // Store start time in scheduled_for as normal timestamp
      setDebugInfo(prev => prev + `STEP 2: Building scheduledFor\n`)
      let scheduledFor = `${eventData.date}T12:00:00`
      if (eventData.time?.trim()) {
        scheduledFor = `${eventData.date}T${eventData.time}:00`
      }
      setDebugInfo(prev => prev + `  - ScheduledFor: ${scheduledFor}\n`)
      
      // Store description in content field (end time disabled for now)
      let contentField = eventData.description || ''
      
      let data, error
      
      if (eventData.id === 0) {
        setDebugInfo(prev => prev + `STEP 3: Creating new event\n`)
        
        // Create new event (with recurring fields for parent)
        // SINGLE SOURCE OF TRUTH: Use current state directly
        const repeatEnabled = recurrenceType !== 'none'
        const eventPayload = {
          title: eventData.title.trim(),
          content: contentField,
          folder: eventData.folder || 'PERSONAL',
          platform: 'calendar',
          status: 'published',
          scheduled_for: scheduledFor,
          recurrence_type: repeatEnabled ? recurrenceType : null,
          recurrence_interval: repeatEnabled ? 1 : null,
          recurrence_end_date: repeatEnabled && recurrenceEndType === 'date' ? recurrenceEndDate : null,
          recurrence_parent_id: null // This is the parent
        }
        
        setDebugInfo(prev => prev + `STEP 4: Payload built\n`)
        
        // State snapshot for debugging
        setDebugInfo(prev => prev + `STATE SNAPSHOT: repeatEnabled=${repeatEnabled} recurrenceType=${recurrenceType} weeklyDays=[${weeklyDays.join(',')}] endType=${recurrenceEndType} count=${recurrenceCount} until=${recurrenceEndDate}\n`)
        
        setDebugInfo(prev => prev + `ACTUAL PARENT PAYLOAD:\n${JSON.stringify(eventPayload, null, 2)}\n`)
        console.log('🔍 PARENT INSERT PAYLOAD:', JSON.stringify(eventPayload, null, 2))
        
        setDebugInfo(prev => prev + `STEP 5: Calling supabase insert\n`)
        const parentInsert = await supabase.from('posts')
          .insert(eventPayload)
          .select()
          .single()
        
        setDebugInfo(prev => prev + `STEP 6: Insert completed\n`)
        setDebugInfo(prev => prev + `PARENT INSERT RESULT:\n${JSON.stringify(parentInsert.data, null, 2)}\n`)
        if (parentInsert.error) {
          setDebugInfo(prev => prev + `PARENT INSERT ERROR: ${parentInsert.error.message}\n`)
        }
        console.log('🔍 PARENT INSERT DATA:', parentInsert.data)
        console.log('🔍 PARENT INSERT ERROR:', parentInsert.error)
        
        // Surface errors in modal immediately
        if (parentInsert.error) {
          setDebugInfo(prev => prev + `PARENT INSERT FAILED:\n${JSON.stringify(parentInsert.error, null, 2)}\n`)
          alert(`Parent event creation failed: ${parentInsert.error.message}`)
          return // Stop execution - do not attempt child generation
        }
        
        // Confirm parent data exists
        if (!parentInsert.data) {
          setDebugInfo(prev => prev + 'PARENT INSERT FAILED: No data returned\n')
          alert('Parent event creation failed: No data returned from database')
          return
        }
        
        setDebugInfo(prev => prev + `STEP 7: Parent created, ID: ${parentInsert.data.id}\n`)
        
        data = parentInsert.data
        error = parentInsert.error
        
        // If recurring event, generate child events
        if (!error && data && recurrenceType !== 'none') {
          setDebugInfo(prev => prev + `STEP 8: Generating child events\n`)
          
          const childEvents: any[] = []
          
          // TEMP DEBUG: Log recurrence parameters
          const selectedWeekdays = weeklyDays // Current weekday selection
          setDebugInfo(prev => prev + `  - selectedWeekdays: [${selectedWeekdays.join(', ')}] (${selectedWeekdays.length} selected)\n`)
          
          // Calculate end date for generation
          let endDate: Date
          if (recurrenceEndType === 'date' && recurrenceEndDate) {
            endDate = new Date(recurrenceEndDate + 'T23:59:59')
          } else {
            // Generate based on count
            endDate = new Date(eventData.date + 'T00:00:00')
            if (recurrenceType === 'weekly') {
              endDate.setDate(endDate.getDate() + (recurrenceCount * 7))
            } else if (recurrenceType === 'every4weeks') {
              endDate.setDate(endDate.getDate() + (recurrenceCount * 28))
            }
          }
          
          const startDate = new Date(eventData.date + 'T00:00:00')
          
          // TEMP DEBUG: Log date boundaries
          const startDateNY = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
          const endDateNY = endDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
          setDebugInfo(prev => prev + `  - startDateNY: ${startDateNY}\n`)
          setDebugInfo(prev => prev + `  - endDateNY: ${endDateNY}\n`)
          
          if (recurrenceType === 'weekly' && weeklyDays.length > 0) {
            // Generate weekly recurring events for selected days
            const dayMap = {
              'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
              'friday': 5, 'saturday': 6, 'sunday': 0
            }
            
            let currentWeekStart = new Date(startDate)
            currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1) // Go to Monday of first week
            
            // TEMP DEBUG: Generation parameters
            setDebugInfo(prev => prev + `WEEKLY GENERATION:\n`)
            setDebugInfo(prev => prev + `  - requested count: ${recurrenceCount}\n`)
            setDebugInfo(prev => prev + `  - startDate: ${startDate.toISOString().split('T')[0]}\n`)
            
            let generatedCount = 0 // Track child events generated
            const firstOccurrenceDate = new Date(startDate).toISOString().split('T')[0]
            
            while (currentWeekStart <= endDate) {
              for (const day of weeklyDays) {
                const eventDate = new Date(currentWeekStart)
                eventDate.setDate(currentWeekStart.getDate() + dayMap[day as keyof typeof dayMap] - 1)
                
                const eventDateStr = eventDate.toISOString().split('T')[0]
                
                // Skip if before start date or after end date
                if (eventDate < startDate || eventDate > endDate) continue
                
                // CRITICAL FIX: Skip the parent event date (already created as parent)
                if (eventDateStr === firstOccurrenceDate) {
                  setDebugInfo(prev => prev + `  - skipping parent date: ${eventDateStr}\n`)
                  continue
                }
                
                // CRITICAL FIX: For count-based recurrence, limit child generation
                if (recurrenceEndType === 'count' && generatedCount >= (recurrenceCount - 1)) {
                  setDebugInfo(prev => prev + `  - reached count limit: ${recurrenceCount - 1} children\n`)
                  break
                }
                
                // Guarantee valid scheduled_for timestamp
                let timeStr = '12:00:00' // Default
                if (eventData.time?.trim() && eventData.time.trim() !== '') {
                  const cleanTime = eventData.time.trim()
                  timeStr = cleanTime.includes(':') ? `${cleanTime}:00` : `${cleanTime}:00:00`
                }
                const childScheduledFor = `${eventDateStr}T${timeStr}`
                
                childEvents.push({
                  title: eventData.title.trim(),
                  content: contentField,
                  folder: eventData.folder || 'PERSONAL',
                  platform: 'calendar',
                  status: 'published',
                  scheduled_for: childScheduledFor,
                  recurrence_type: recurrenceType,
                  recurrence_interval: 1,
                  recurrence_end_date: recurrenceEndType === 'date' ? recurrenceEndDate : null,
                  recurrence_parent_id: data.id
                })
                
                generatedCount++
                setDebugInfo(prev => prev + `  - generated child ${generatedCount}: ${eventDateStr}\n`)
              }
              
              // Break early if we've reached the count limit
              if (recurrenceEndType === 'count' && generatedCount >= (recurrenceCount - 1)) {
                break
              }
              
              currentWeekStart.setDate(currentWeekStart.getDate() + 7) // Next week
            }
            
            // TEMP DEBUG: Final results
            setDebugInfo(prev => prev + `GENERATION COMPLETE:\n`)
            setDebugInfo(prev => prev + `  - children generated: ${generatedCount}\n`)
            setDebugInfo(prev => prev + `  - first generated date: ${childEvents.length > 0 ? childEvents[0].scheduled_for.split('T')[0] : 'none'}\n`)
          } else if (recurrenceType === 'every4weeks') {
            // Generate every 4 weeks recurring events
            let currentDate = new Date(startDate)
            currentDate.setDate(currentDate.getDate() + 28) // Start from 4 weeks after parent
            
            while (currentDate <= endDate) {
              // Guarantee valid scheduled_for timestamp
              let timeStr = '12:00:00' // Default
              if (eventData.time?.trim() && eventData.time.trim() !== '') {
                const cleanTime = eventData.time.trim()
                timeStr = cleanTime.includes(':') ? `${cleanTime}:00` : `${cleanTime}:00:00`
              }
              const childScheduledFor = `${currentDate.toISOString().split('T')[0]}T${timeStr}`
              
              childEvents.push({
                title: eventData.title.trim(),
                content: contentField,
                folder: eventData.folder || 'PERSONAL',
                platform: 'calendar',
                status: 'published',
                scheduled_for: childScheduledFor,
                recurrence_type: recurrenceType,
                recurrence_interval: 1,
                recurrence_end_date: recurrenceEndType === 'date' ? recurrenceEndDate : null,
                recurrence_parent_id: data.id
              })
              
              currentDate.setDate(currentDate.getDate() + 28) // Add 4 weeks
            }
          }
          
          // TEMP DEBUG: Log occurrence results
          setDebugInfo(prev => prev + `  - occurrenceDates.length: ${childEvents.length}\n`)
          if (childEvents.length > 0) {
            const first5Dates = childEvents.slice(0, 5).map(event => event.scheduled_for)
            setDebugInfo(prev => prev + `  - first 5 dates: ${first5Dates.join(', ')}\n`)
            
            // Log first child payload example
            setDebugInfo(prev => prev + `STEP 9: Example child payload:\n`)
            const firstChild = childEvents[0]
            setDebugInfo(prev => prev + `  - title: "${firstChild.title}"\n`)
            setDebugInfo(prev => prev + `  - folder: "${firstChild.folder}"\n`)
            setDebugInfo(prev => prev + `  - platform: "${firstChild.platform}"\n`)
            setDebugInfo(prev => prev + `  - scheduled_for: "${firstChild.scheduled_for}"\n`)
            setDebugInfo(prev => prev + `  - recurrence_parent_id: ${firstChild.recurrence_parent_id}\n`)
          }
          
          // Insert all child events at once with proper error handling
          setDebugInfo(prev => prev + `CHILD PAYLOAD COUNT: ${childEvents.length} `)
          if (childEvents.length === 0) return;

          // Log full payload for debugging
          setDebugInfo(prev => prev + `FULL CHILD PAYLOADS:\n`)
          childEvents.forEach((child, i) => {
            setDebugInfo(prev => prev + `  [${i}] title:"${child.title}" platform:"${child.platform}" status:"${child.status}" scheduled_for:"${child.scheduled_for}"\n`)
          })

          // Hard guard: ensure no child has null/undefined scheduled_for
          const invalidChildren = childEvents.filter((child, i) => {
            if (!child.scheduled_for) {
              setDebugInfo(prev => prev + `CHILD BLOCKED: missing scheduled_for for index ${i} payload=${JSON.stringify(child)}\n`)
              return true
            }
            return false
          })
          if (invalidChildren.length > 0) {
            return // Do not insert - blocked children detected
          }

          const childInsert = await supabase
            .from('posts')
            .insert(childEvents)
            .select('id, scheduled_for, recurrence_parent_id');

          const insertedCount = childInsert.data?.length || 0
          const firstChildScheduledFor = childInsert.data?.[0]?.scheduled_for || 'none'
          setDebugInfo(prev => prev + `CHILD INSERTED: ${insertedCount} + first child scheduled_for: ${firstChildScheduledFor} `)

          if (childInsert.error) {
            setDebugInfo(prev => prev + `CHILD INSERT ERROR: ${childInsert.error.message} `)
            throw childInsert.error
          }

          // Refresh calendar data to show new child events
          await fetchData(true)
        }
        
      } else {
        // Update existing event (no recurring logic for updates yet)
        const result = await supabase.from('posts')
          .update({
            title: eventData.title.trim(),
            content: contentField,
            folder: eventData.folder || 'PERSONAL',
            scheduled_for: scheduledFor
          })
          .eq('id', eventData.id)
          .select()
          .single()
        
        data = result.data
        error = result.error
      }
      
      if (error) throw error
      
      if (data) {
        // Parse scheduled_for for start time
        const date = data.scheduled_for?.split('T')[0] || eventData.date
        const time = data.scheduled_for?.split('T')[1]?.substring(0, 5)
        
        const mappedEvent: CalendarEvent = {
          id: data.id,
          title: data.title,
          description: data.content || '', // Raw content as description
          folder: data.folder || 'PERSONAL',
          date,
          time,
          endTime: undefined, // End time disabled for now
          created_at: data.created_at,
          recurrence_type: data.recurrence_type,
          recurrence_interval: data.recurrence_interval,
          recurrence_end_date: data.recurrence_end_date,
          recurrence_parent_id: data.recurrence_parent_id
        }
        
        if (eventData.id === 0) {
          // Add new event to state - the child events will be fetched on next data refresh
          setEvents(prev => [...prev, mappedEvent])
        } else {
          // Update existing event in state
          setEvents(prev => prev.map(e => e.id === eventData.id ? mappedEvent : e))
        }
      }
      
      setEditingEvent(null)
      
      // Force refresh to show all created events
      fetchData(true)
      
      // Reset recurring form state AFTER successful save
      setRecurrenceType('none')
      setWeeklyDays([])
      setRecurrenceEndDate('')
      setRecurrenceCount(10)
      
    } catch (error) {
      console.error('Failed to save event:', error)
      
      // TEMP DEBUG: Surface runtime errors in modal
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : 'No stack trace'
      setDebugInfo(prev => prev + `\n❌ RUNTIME ERROR: ${errorMessage}\n${errorStack}\n`)
      
      alert('Failed to save event. Please try again.')
    }
  }

  const deleteEventById = async (eventId: number) => {
    if (!confirm('Delete this event?')) return
    
    try {
      const { error } = await supabase.from('posts').delete().eq('id', eventId)
      if (error) throw error
      
      setEvents(prev => prev.filter(e => e.id !== eventId))
      setEditingEvent(null)
    } catch (error) {
      console.error('Failed to delete event:', error)
      alert('Failed to delete event. Please try again.')
    }
  }

  // deleteEvent function removed - using deleteEventById instead

  const getWeeklyNotes = (author: string) => {
    return weeklyNotes
      .filter(note => note.author === author && note.week_start === weekStartDate)
      .slice(0, 4) // Show max 4 recent notes
  }

  const addWeeklyNote = async (author: string) => {
    const content = prompt('Add note:')
    if (!content?.trim()) return
    
    const { data } = await supabase.from('posts').insert({
      title: weekStartDate,
      content: content.trim(),
      folder: author,
      platform: 'weekly-notes',
      status: 'pending'
    }).select().single()
    
    if (data) {
      const mappedNote = {
        id: data.id,
        content: data.content || '',
        author: data.folder || '',
        week_start: data.title || '',
        created_at: data.created_at,
        seen: false
      }
      setWeeklyNotes(prev => [mappedNote, ...prev])
    }
  }

  const markNoteSeen = async (note: WeeklyNote) => {
    const newStatus = note.seen ? 'pending' : 'seen'
    await supabase.from('posts').update({ status: newStatus }).eq('id', note.id)
    setWeeklyNotes(prev => prev.map(n => n.id === note.id ? { ...n, seen: !n.seen } : n))
  }

  const deleteWeeklyNote = async (noteId: number) => {
    if (!confirm('Delete this note?')) return
    await supabase.from('posts').delete().eq('id', noteId)
    setWeeklyNotes(prev => prev.filter(n => n.id !== noteId))
  }

  // Mobile event move functions
  const moveEventToTomorrow = async (event: CalendarEvent) => {
    try {
      // Get original scheduled_for from DB
      const { data: originalEvent, error: fetchError } = await supabase
        .from('posts')
        .select('scheduled_for')
        .eq('id', event.id)
        .single()

      if (fetchError || !originalEvent) throw new Error('Failed to fetch original event')

      // Parse existing scheduled_for into Date object
      const original = new Date(originalEvent.scheduled_for)
      
      // Add one day using Date API
      const updated = new Date(original)
      updated.setDate(updated.getDate() + 1)
      
      // Save using toISOString() and format standardization
      const newScheduledFor = updated.toISOString().replace('Z', '+00:00')
      
      // Update debug info
      setDebugInfo(`Event ID: ${event.id}\nOld: ${originalEvent.scheduled_for}\nNew: ${newScheduledFor}`)
      
      // Update in Supabase with select to confirm update
      const updateResult = await supabase
        .from('posts')
        .update({ scheduled_for: newScheduledFor })
        .eq('id', event.id)
        .select('id, scheduled_for')
        .single()
      
      // Update debug info with results
      if (updateResult.error) {
        setDebugInfo(prev => `${prev}\nStatus: ERROR\nError: ${updateResult.error.message}`)
        throw updateResult.error
      } else {
        setDebugInfo(prev => `${prev}\nStatus: SUCCESS\nDB Result: ${updateResult.data?.scheduled_for || 'none'}`)
        
        // Update local editing event state immediately
        if (updateResult.data) {
          const newDate = updateResult.data.scheduled_for.split('T')[0]
          const newTime = updateResult.data.scheduled_for.split('T')[1]?.substring(0, 5)
          
          setEditingEvent((prev) => prev ? {
            ...prev,
            date: newDate,
            time: newTime || prev.time,
            // Keep all other fields the same
          } : null)
        }
      }

      // Force immediate re-fetch and UI update
      await fetchData(true)
    } catch (error) {
      console.error('Tomorrow button error:', error)
      setDebugInfo(prev => `${prev}\nFailed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const moveEventToNextWeek = async (event: CalendarEvent) => {
    try {
      // Get original scheduled_for from DB - same pattern as Tomorrow
      const { data: originalEvent, error: fetchError } = await supabase
        .from('posts')
        .select('scheduled_for')
        .eq('id', event.id)
        .single()

      if (fetchError || !originalEvent) throw new Error('Failed to fetch original event')

      // Parse existing scheduled_for into Date object
      const original = new Date(originalEvent.scheduled_for)
      
      // Add 7 days using Date API
      const updated = new Date(original)
      updated.setDate(updated.getDate() + 7)
      
      // Save using toISOString() and format standardization
      const newScheduledFor = updated.toISOString().replace('Z', '+00:00')
      
      // Update in Supabase - exact same pattern as Tomorrow
      const updateResult = await supabase
        .from('posts')
        .update({ scheduled_for: newScheduledFor })
        .eq('id', event.id)
        .select('id, scheduled_for')
        .single()

      if (updateResult.error) throw updateResult.error
      
      // Update local editing event state immediately
      if (updateResult.data) {
        const newDate = updateResult.data.scheduled_for.split('T')[0]
        const newTime = updateResult.data.scheduled_for.split('T')[1]?.substring(0, 5)
        
        setEditingEvent((prev) => prev ? {
          ...prev,
          date: newDate,
          time: newTime || prev.time,
        } : null)
      }

      // Force immediate re-fetch and UI update
      await fetchData(true)
    } catch (error) {
      console.error('Next Week button error:', error)
      alert(`Next Week failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openDatePicker = (event: CalendarEvent) => {
    const newDate = prompt('Enter new date (YYYY-MM-DD):', event.date)
    if (newDate && newDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      moveEventToDate(event, newDate)
    }
  }

  const duplicateEvent = async (event: CalendarEvent, type: 'next-week' | 'pick-date') => {
    try {
      let targetDate: string
      
      if (type === 'next-week') {
        // Add 7 days to current event date
        const currentDate = new Date(event.date + 'T12:00:00')
        currentDate.setDate(currentDate.getDate() + 7)
        targetDate = currentDate.toISOString().split('T')[0]
      } else {
        // Pick date
        const newDate = prompt('Enter new date (YYYY-MM-DD):', event.date)
        if (!newDate || !newDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return
        }
        targetDate = newDate
      }
      
      // Block duplicating to past dates
      const currentNYDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (targetDate < currentNYDate) {
        alert('Cannot create events on past dates.')
        return
      }
      
      // Build scheduled_for timestamp with same time as original
      let scheduledFor = `${targetDate}T12:00:00`
      if (event.time?.trim()) {
        scheduledFor = `${targetDate}T${event.time}:00`
      }
      
      // Create new event
      const { data, error } = await supabase.from('posts').insert({
        title: event.title,
        content: event.description || '',
        folder: event.folder || 'PERSONAL',
        platform: 'calendar',
        status: 'published',
        scheduled_for: scheduledFor
        // Note: recurrence fields are left NULL (ignored as per requirements)
      }).select().single()
      
      if (error) throw error
      
      if (data) {
        // Parse scheduled_for for display
        const newDate = data.scheduled_for?.split('T')[0] || targetDate
        const newTime = data.scheduled_for?.split('T')[1]?.substring(0, 5)
        
        const newEvent: CalendarEvent = {
          id: data.id,
          title: data.title,
          description: data.content || '',
          folder: data.folder || 'PERSONAL',
          date: newDate,
          time: newTime,
          endTime: undefined,
          created_at: data.created_at
        }
        
        // Add to state and refresh
        setEvents(prev => [...prev, newEvent])
        
        // Open the new event in the modal
        setEditingEvent(newEvent)
        
        // Refresh data to ensure consistency
        fetchData(true)
      }
      
    } catch (error) {
      console.error('Failed to duplicate event:', error)
      alert('Failed to duplicate event. Please try again.')
    }
  }

  const moveEventToDate = async (event: CalendarEvent, targetDateStr: string) => {
    // Block moving to past dates (using NY timezone)
    const currentNYDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    if (targetDateStr < currentNYDate) {
      alert('Cannot move events to past dates.')
      return
    }

    // If same date, do nothing
    if (event.date === targetDateStr) {
      return
    }

    try {
      // Find the original event in DB to get exact scheduled_for timestamp
      const { data: originalEvent, error: fetchError } = await supabase
        .from('posts')
        .select('scheduled_for')
        .eq('id', event.id)
        .single()

      if (fetchError || !originalEvent) throw new Error('Failed to fetch original event')

      // Parse original UTC timestamp
      const originalUtc = new Date(originalEvent.scheduled_for)
      
      // Convert to NY time to extract local time components
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      
      const nyTimeString = formatter.format(originalUtc) // "YYYY-MM-DD, HH:mm"
      const [, timeOnly] = nyTimeString.split(', ') // Extract "HH:mm"
      
      // Create new date with target date + same NY local time
      const [hours, minutes] = timeOnly.split(':').map(Number)
      const targetDateObj = new Date(targetDateStr + 'T00:00:00Z')
      targetDateObj.setUTCHours(hours + 5, minutes, 0, 0) // Add 5 hours to convert NY to UTC (EST)
      
      // Account for DST if needed
      const isDst = (date: Date) => {
        const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset()
        const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset()
        return Math.max(jan, jul) !== date.getTimezoneOffset()
      }
      
      const targetIsDst = isDst(new Date(targetDateStr))
      if (targetIsDst) {
        targetDateObj.setUTCHours(targetDateObj.getUTCHours() - 1) // Subtract 1 hour for EDT
      }

      const utcIsoString = targetDateObj.toISOString().replace('Z', '+00:00')

      // Update only scheduled_for in Supabase
      const { error } = await supabase
        .from('posts')
        .update({ 
          scheduled_for: utcIsoString
        })
        .eq('id', event.id)

      if (error) throw error

      // Update events in state
      setEvents(prev => prev.map(e => 
        e.id === event.id 
          ? { 
              ...e, 
              date: targetDateStr,
              time: timeOnly
            }
          : e
      ))

      // Update the editing event if it's the same event
      if (editingEvent && editingEvent.id === event.id) {
        setEditingEvent(prev => prev ? { ...prev, date: targetDateStr, time: timeOnly } : null)
      }

    } catch (error) {
      console.error('Failed to move event:', error)
      alert('Failed to move event. Please try again.')
    }
  }

  // Drag & Drop functionality for calendar events
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null)

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    setDraggedEvent(event)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (draggedEvent) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault()
    if (!draggedEvent) return

    const targetDateStr = targetDate.toISOString().split('T')[0]
    
    // Block dropping into past days
    if (isPastDay(targetDateStr)) {
      alert('Cannot reschedule events to past dates.')
      setDraggedEvent(null)
      return
    }

    // If dropping on the same date, do nothing
    if (draggedEvent.date === targetDateStr) {
      setDraggedEvent(null)
      return
    }

    try {
      // Find the original event in the DB to get the exact scheduled_for timestamp
      const { data: originalEvent, error: fetchError } = await supabase
        .from('posts')
        .select('scheduled_for')
        .eq('id', draggedEvent.id)
        .single()

      if (fetchError || !originalEvent) throw new Error('Failed to fetch original event')

      // Parse original UTC timestamp
      const originalUtc = new Date(originalEvent.scheduled_for)
      
      // Convert to NY time to extract local time components
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      
      const nyTimeString = formatter.format(originalUtc) // "YYYY-MM-DD, HH:mm"
      const [, timeOnly] = nyTimeString.split(', ') // Extract "HH:mm"
      
      // Create new date with target date + same NY local time
      const newDateTimeInNY = `${targetDateStr}, ${timeOnly}`
      
      // Parse back to Date object in NY timezone
      const newUtc = new Date(`${targetDateStr}T${timeOnly}:00-05:00`) // EST assumption, will adjust for DST
      
      // Let's use a more direct approach - build the new UTC timestamp
      const [hours, minutes] = timeOnly.split(':').map(Number)
      const targetDateObj = new Date(targetDateStr + 'T00:00:00Z')
      targetDateObj.setUTCHours(hours + 5, minutes, 0, 0) // Add 5 hours to convert NY to UTC (EST)
      
      // Account for DST if needed - check if the original date was in DST
      const isDst = (date: Date) => {
        const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset()
        const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset()
        return Math.max(jan, jul) !== date.getTimezoneOffset()
      }
      
      const targetIsDst = isDst(new Date(targetDateStr))
      if (targetIsDst) {
        targetDateObj.setUTCHours(targetDateObj.getUTCHours() - 1) // Subtract 1 hour for EDT
      }

      const utcIsoString = targetDateObj.toISOString().replace('Z', '+00:00')

      // Update only scheduled_for in Supabase
      const { error } = await supabase
        .from('posts')
        .update({ 
          scheduled_for: utcIsoString
        })
        .eq('id', draggedEvent.id)

      if (error) throw error

      // Update events in state
      setEvents(prev => prev.map(e => 
        e.id === draggedEvent.id 
          ? { 
              ...e, 
              date: targetDateStr,
              time: timeOnly
            }
          : e
      ))

    } catch (error) {
      console.error('Failed to move event:', error)
      alert('Failed to move event. Please try again.')
    }

    setDraggedEvent(null)
  }

  const formatNoteTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const saveTask = async (task: Task) => {
    const { id, created_at, owner, completed, notes, board, sort_order, ...updates } = task
    // Map dashboard fields back to database schema
    const dbUpdates = {
      ...updates,
      assignee: owner,
      description: notes,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      day_of_week: task.day_of_week, // Persist day_of_week
      week_start: task.week_start     // Persist week_start
    }
    await supabase.from(TASKS_TABLE).update(dbUpdates).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? task : t))
    setEditingTask(null)
  }

  const deleteTask = async (id: number) => {
    if (!confirm('Delete this task?')) return
    await supabase.from(TASKS_TABLE).delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
    setEditingTask(null)
  }

  const boardTasks = (board: string, day: string) => {
    let t = tasks.filter(t => t.board === board && t.day_of_week === day)
    if (hideCompleted[board]) t = t.filter(t => !t.completed)
    // Sort by sort_order ASC, fallback to created_at ASC
    const sorted = t.sort((a, b) => {
      if (a.sort_order !== null && a.sort_order !== undefined && 
          b.sort_order !== null && b.sort_order !== undefined) {
        return a.sort_order - b.sort_order
      }
      if ((a.sort_order !== null && a.sort_order !== undefined) && 
          (b.sort_order === null || b.sort_order === undefined)) return -1
      if ((a.sort_order === null || a.sort_order === undefined) && 
          (b.sort_order !== null && b.sort_order !== undefined)) return 1
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    
    console.log(`📋 SORTED TASKS for ${board}-${day}:`, sorted.map(t => ({ 
      id: t.id, 
      title: t.title, 
      sort_order: t.sort_order 
    })))
    
    return sorted
  }

  // Grocery List functions
  const getGroceryItemsByStore = (store: 'costco' | 'publix' | 'random') => {
    let items = groceryItems.filter(item => item.store === store)
    if (hideCheckedGrocery) {
      items = items.filter(item => !item.checked)
    }
    return items.sort((a, b) => a.sort_order - b.sort_order)
  }

  const addGroceryItem = async (store: 'costco' | 'publix' | 'random', text: string) => {
    if (!text.trim()) return
    
    const maxSortOrder = Math.max(...groceryItems.filter(item => item.store === store).map(item => item.sort_order), 0)
    
    const { data, error } = await supabase.from('grocery_items').insert({
      store,
      text: text.trim(),
      sort_order: maxSortOrder + 1,
      checked: false
    }).select().single()
    
    if (error) {
      console.error('Failed to add grocery item:', error)
      return
    }
    
    if (data) {
      setGroceryItems(prev => [...prev, data])
    }
  }

  const toggleGroceryItemChecked = async (id: number, checked: boolean) => {
    const { error } = await supabase.from('grocery_items').update({ checked }).eq('id', id)
    if (error) {
      console.error('Failed to toggle grocery item:', error)
      return
    }
    setGroceryItems(prev => prev.map(item => item.id === id ? { ...item, checked } : item))
  }

  const deleteGroceryItem = async (id: number) => {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from('grocery_items').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete grocery item:', error)
      return
    }
    setGroceryItems(prev => prev.filter(item => item.id !== id))
  }

  const updateGroceryItemStore = async (id: number, newStore: 'costco' | 'publix' | 'random') => {
    const maxSortOrder = Math.max(...groceryItems.filter(item => item.store === newStore).map(item => item.sort_order), 0)
    
    const { error } = await supabase.from('grocery_items')
      .update({ 
        store: newStore,
        sort_order: maxSortOrder + 1
      })
      .eq('id', id)
    
    if (error) {
      console.error('Failed to update grocery item store:', error)
      return
    }
    
    setGroceryItems(prev => prev.map(item => 
      item.id === id 
        ? { ...item, store: newStore, sort_order: maxSortOrder + 1 }
        : item
    ))
  }

  const updateGroceryItemOrder = async (draggedId: number, targetId: number, store: 'costco' | 'publix' | 'random') => {
    const storeItems = groceryItems.filter(item => item.store === store).sort((a, b) => a.sort_order - b.sort_order)
    const draggedIndex = storeItems.findIndex(item => item.id === draggedId)
    const targetIndex = storeItems.findIndex(item => item.id === targetId)
    
    if (draggedIndex === -1 || targetIndex === -1) return
    
    // Reorder the items array
    const reorderedItems = [...storeItems]
    const [draggedItem] = reorderedItems.splice(draggedIndex, 1)
    reorderedItems.splice(targetIndex, 0, draggedItem)
    
    // Update sort_order for all items in this store
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      sort_order: index + 1
    }))
    
    try {
      // Update all items in batch
      for (const update of updates) {
        await supabase.from('grocery_items')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id)
      }
      
      // Update local state
      setGroceryItems(prev => prev.map(item => {
        const update = updates.find(u => u.id === item.id)
        return update ? { ...item, sort_order: update.sort_order } : item
      }))
      
    } catch (error) {
      console.error('Failed to update grocery item order:', error)
    }
  }

  const toggleHideCheckedGrocery = () => {
    const newValue = !hideCheckedGrocery
    setHideCheckedGrocery(newValue)
    localStorage.setItem('hideCheckedGrocery', newValue.toString())
  }

  // Drag & Drop handlers for weekly tasks
  const handleTaskPointerDown = (e: React.PointerEvent, task: Task) => {
    const element = e.currentTarget as HTMLElement
    element.setPointerCapture(e.pointerId)
    setDraggedTask(task)
    setDraggedElement(element)
    element.style.opacity = '0.5'
    element.style.cursor = 'grabbing'
    element.style.pointerEvents = 'none' // Allow elementFromPoint to see through
  }

  const handleTaskPointerMove = (e: React.PointerEvent) => {
    if (!draggedTask) return
    e.preventDefault()
  }

  const handleTaskPointerUp = (e: React.PointerEvent) => {
    if (!draggedTask || !draggedElement) return
    
    draggedElement.style.opacity = '1'
    draggedElement.style.cursor = 'grab'
    draggedElement.style.pointerEvents = 'auto' // Restore pointer events
    
    // Find drop target using pointer coordinates
    const dropEl = document.elementFromPoint(e.clientX, e.clientY)
    console.log('Drop element:', dropEl) // Debug logging
    
    const dropContainer = dropEl?.closest('[data-drop-day]')
    const targetTaskElement = dropEl?.closest('[data-task-id]')
    
    console.log('Drop container:', dropContainer) // Debug logging
    console.log('Target task element:', targetTaskElement) // Debug logging
    
    if (dropContainer) {
      const newDay = dropContainer.getAttribute('data-drop-day')
      const sourceDay = draggedTask.day_of_week
      
      const targetTaskId = targetTaskElement ? parseInt(targetTaskElement.getAttribute('data-task-id') || '0') : 0
      
      if (newDay && newDay !== sourceDay) {
        // Cross-day move (existing behavior)
        updateTaskDay(draggedTask, newDay)
      } else if (newDay === sourceDay && targetTaskElement) {
        // Same-day reordering
        const targetTaskDay = targetTaskElement.getAttribute('data-day')
        
        console.log('Reorder check:', { sourceDay, targetTaskDay, targetTaskId, draggedId: draggedTask.id }) // Debug logging
        
        if (targetTaskDay === sourceDay && targetTaskId !== draggedTask.id) {
          const targetTask = tasks.find(t => t.id === targetTaskId)
          if (targetTask) {
            console.log('Triggering reorder') // Debug logging
            updateTaskOrder(draggedTask, targetTask)
          }
        }
      }
    } else {
    }
    
    setDraggedTask(null)
    setDraggedElement(null)
  }

  const updateTaskDay = async (task: Task, newDay: string) => {
    try {
      const { error } = await supabase
        .from(TASKS_TABLE)
        .update({ day_of_week: newDay })
        .eq('id', task.id)
      
      if (error) throw error
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, day_of_week: newDay } : t
      ))
    } catch (error) {
      console.error('Failed to update task day:', error)
    }
  }

  const updateTaskOrder = async (draggedTask: Task, targetTask: Task) => {
    try {
      // Get all tasks for the same day, board, and week
      const dayTasks = tasks.filter(t => 
        t.board === draggedTask.board && 
        t.day_of_week === draggedTask.day_of_week && 
        t.week_start === draggedTask.week_start
      ).sort((a, b) => {
        if (a.sort_order !== null && a.sort_order !== undefined && 
            b.sort_order !== null && b.sort_order !== undefined) {
          return a.sort_order - b.sort_order
        }
        if ((a.sort_order !== null && a.sort_order !== undefined) && 
            (b.sort_order === null || b.sort_order === undefined)) return -1
        if ((a.sort_order === null || a.sort_order === undefined) && 
            (b.sort_order !== null && b.sort_order !== undefined)) return 1
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      // Remove dragged task and find target position
      const filteredTasks = dayTasks.filter(t => t.id !== draggedTask.id)
      const targetIndex = filteredTasks.findIndex(t => t.id === targetTask.id)
      
      // Insert dragged task at target position
      const reorderedTasks = [...filteredTasks]
      reorderedTasks.splice(targetIndex, 0, draggedTask)

      // Update sort_order for all tasks in this day (renumber 1, 2, 3...)
      const updates = reorderedTasks.map((task, index) => ({
        id: task.id,
        title: task.title, // For logging
        sort_order: index + 1
      }))

      console.log('🔄 REORDER PAYLOAD:', updates)

      // Update database in batch
      for (const update of updates) {
        const { error } = await supabase.from(TASKS_TABLE)
          .update({ sort_order: update.sort_order })
          .eq('id', update.id)
        
        if (error) {
          console.error(`❌ UPDATE FAILED for task ${update.id}:`, error)
        } else {
          console.log(`✅ UPDATED task ${update.id} (${update.title}) to sort_order ${update.sort_order}`)
        }
      }

      // Update local state
      setTasks(prev => prev.map(task => {
        const update = updates.find(u => u.id === task.id)
        return update ? { ...task, sort_order: update.sort_order } : task
      }))

      // Force re-fetch to confirm database persistence
      console.log('🔄 CALLING fetchData(true) to verify persistence')
      await fetchData(true)

    } catch (error) {
      console.error('Failed to update task order:', error)
    }
  }

  // Grocery List Drag & Drop handlers
  const handleGroceryPointerDown = (e: React.PointerEvent, item: GroceryItem) => {
    const element = e.currentTarget as HTMLElement
    element.setPointerCapture(e.pointerId)
    setDraggedGroceryItem(item)
    setDraggedGroceryElement(element)
    element.style.opacity = '0.5'
    element.style.cursor = 'grabbing'
  }

  const handleGroceryPointerMove = (e: React.PointerEvent) => {
    if (!draggedGroceryItem) return
    e.preventDefault()
  }

  const handleGroceryPointerUp = (e: React.PointerEvent) => {
    if (!draggedGroceryItem || !draggedGroceryElement) return
    
    draggedGroceryElement.style.opacity = '1'
    draggedGroceryElement.style.cursor = 'grab'
    
    // Find drop target
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
    const dropContainer = elementBelow?.closest('[data-grocery-drop-store]')
    
    if (dropContainer) {
      const newStore = dropContainer.getAttribute('data-grocery-drop-store') as 'costco' | 'publix' | 'random'
      if (newStore && newStore !== draggedGroceryItem.store) {
        // Moving to different store
        updateGroceryItemStore(draggedGroceryItem.id, newStore)
      } else if (newStore === draggedGroceryItem.store) {
        // Reordering within same store - find target position
        const targetItem = elementBelow?.closest('[data-grocery-item-id]')
        if (targetItem) {
          const targetId = parseInt(targetItem.getAttribute('data-grocery-item-id') || '0')
          if (targetId !== draggedGroceryItem.id) {
            updateGroceryItemOrder(draggedGroceryItem.id, targetId, newStore)
          }
        }
      }
    }
    
    setDraggedGroceryItem(null)
    setDraggedGroceryElement(null)
  }

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const toggleHideCompleted = (board: 'jaclyn' | 'river') => {
    const newValue = !hideCompleted[board]
    setHideCompleted(prev => ({ ...prev, [board]: newValue }))
    localStorage.setItem(`hideCompleted_${board}`, newValue.toString())
  }

  const { dates: weekDates, weekRange, weekStartDate } = getWeekDates(selectedWeek)

  const getThisWeekEvents = () => {
    const weekStartNY = weekDates[0].toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
    const weekEndNY = weekDates[6].toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
    
    return events
      .filter(event => {
        // Convert event's scheduled_for to NY date key and filter by week range
        const eventNYDate = toNYDateKey(event.date + 'T12:00:00') // Use consistent format for date conversion
        return eventNYDate >= weekStartNY && eventNYDate <= weekEndNY
      })
      .sort((a, b) => {
        // Sort by NY date keys
        const dateA = toNYDateKey(a.date + 'T12:00:00')
        const dateB = toNYDateKey(b.date + 'T12:00:00')
        return dateA.localeCompare(dateB)
      })
  }

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return events.filter(event => event.date === dateStr)
  }

  const getFolderColor = (folderName: string) => {
    const folder = folders.find(f => f.name === folderName)
    return folder?.color || '#6B7280' // Default gray
  }

  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00')
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Today'
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
  }

  const renderFullCalendar = () => {
    const currentDate = new Date(calendarDate)
    
    const generateCalendarDays = () => {
      if (calendarView === 'month') {
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        const startDate = new Date(firstDay)
        startDate.setDate(startDate.getDate() - firstDay.getDay()) // Start from Sunday
        
        const days = []
        for (let i = 0; i < 42; i++) { // 6 weeks
          const day = new Date(startDate)
          day.setDate(startDate.getDate() + i)
          days.push(day)
        }
        return days
      } else if (calendarView === 'week') {
        const startOfWeek = new Date(currentDate)
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
        const days = []
        for (let i = 0; i < 7; i++) {
          const day = new Date(startOfWeek)
          day.setDate(startOfWeek.getDate() + i)
          days.push(day)
        }
        return days
      } else if (calendarView === 'day') {
        return [new Date(currentDate)]
      } else { // year
        const months = []
        for (let i = 0; i < 12; i++) {
          months.push(new Date(currentDate.getFullYear(), i, 1))
        }
        return months
      }
    }

    const navigateCalendar = (direction: 'prev' | 'next') => {
      const newDate = new Date(calendarDate)
      if (calendarView === 'month') {
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
      } else if (calendarView === 'week') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
      } else if (calendarView === 'day') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
      } else { // year
        newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
      }
      setCalendarDate(newDate)
    }

    const getCalendarTitle = () => {
      if (calendarView === 'month') {
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      } else if (calendarView === 'week') {
        const startOfWeek = new Date(currentDate)
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      } else if (calendarView === 'day') {
        return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      } else {
        return currentDate.getFullYear().toString()
      }
    }

    const isToday = (date: Date) => {
      const today = new Date()
      return date.toDateString() === today.toDateString()
    }

    const isCurrentMonth = (date: Date) => {
      return date.getMonth() === currentDate.getMonth()
    }

    return (
      <div className="bg-[#16213e] rounded-xl p-3 md:p-6 mt-3 md:mt-6">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-2 md:mb-6">
          <div className="flex items-center gap-1 md:gap-4">
            <h2 className="text-base md:text-xl font-bold text-white">Calendar</h2>
            <div className="flex gap-1 bg-[#1a1a2e] rounded-lg p-1">
              {(['month', 'week', 'day', 'year'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setCalendarView(view)}
                  className={`px-1 md:px-3 py-0.5 md:py-1 rounded text-xs md:text-sm font-medium transition-all ${
                    calendarView === view 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-[#252545]'
                  }`}
                >
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-4">
            <div className="text-xs md:text-lg font-medium text-white">{getCalendarTitle()}</div>
            <div className="flex gap-1">
              <button
                onClick={() => navigateCalendar('prev')}
                className="p-1 md:p-2 text-gray-400 hover:text-white transition-colors"
              >
                ←
              </button>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="px-2 md:px-3 py-0.5 md:py-1 text-xs md:text-sm bg-[#1a1a2e] text-gray-400 hover:text-white rounded transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => navigateCalendar('next')}
                className="p-1 md:p-2 text-gray-400 hover:text-white transition-colors"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="calendar-grid">
          {calendarView === 'month' && (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-px mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-gray-400">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-0.5 md:gap-px">
                {generateCalendarDays().map((day, index) => {
                  const dayEvents = getEventsForDate(day)
                  const isPastDate = isPastDay(day.toISOString().split('T')[0])
                  return (
                    <div
                      key={index}
                      className={`min-h-[80px] md:min-h-[100px] p-1 md:p-2 bg-[#1a1a2e] border border-gray-700 cursor-pointer hover:bg-[#202040] transition-colors ${
                        !isCurrentMonth(day) ? 'opacity-50' : ''
                      } ${isToday(day) ? 'ring-2 ring-blue-500' : ''} ${
                        isPastDate ? 'bg-gray-900 opacity-60' : ''
                      } ${draggedEvent && !isPastDate ? 'border-blue-500 border-2' : ''}`}
                      onClick={() => addEvent(day.toISOString().split('T')[0])}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, day)}
                    >
                      <div className={`text-xs md:text-sm mb-1 ${isToday(day) ? 'font-bold text-blue-400' : isPastDate ? 'text-gray-500' : 'text-gray-300'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            draggable={calendarView === 'month'}
                            onDragStart={(e) => handleDragStart(e, event)}
                            className={`text-xs p-1 rounded truncate cursor-pointer ${
                              calendarView === 'month' ? 'cursor-move hover:opacity-80' : ''
                            } ${draggedEvent?.id === event.id ? 'opacity-50' : ''}`}
                            style={{ backgroundColor: getFolderColor(event.folder || 'PERSONAL') + '40', color: getFolderColor(event.folder || 'PERSONAL') }}
                            onClick={(e) => { e.stopPropagation(); editEvent(event) }}
                            title={calendarView === 'month' ? 'Drag to reschedule or click to edit' : 'Click to edit'}
                          >
                            <span className={isPastEvent(event) ? 'line-through text-gray-400 opacity-60' : ''}>
                              {event.time && `${formatEventTime(event.time)} `}{event.title}
                            </span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {calendarView === 'week' && (
            <>
              <div className="grid grid-cols-7 gap-4">
                {generateCalendarDays().map((day, index) => {
                  const dayEvents = getEventsForDate(day)
                  return (
                    <div key={index} className={`bg-[#1a1a2e] rounded-lg p-3 ${
                      isPastDay(day.toISOString().split('T')[0]) ? 'bg-gray-900 opacity-60' : ''
                    }`}>
                      <div className={`text-center mb-3 ${isToday(day) ? 'font-bold text-blue-400' : isPastDay(day.toISOString().split('T')[0]) ? 'text-gray-500' : 'text-gray-300'}`}>
                        <div className="text-xs">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className="text-lg">{day.getDate()}</div>
                      </div>
                      <div className="space-y-1 min-h-[200px]">
                        {dayEvents.map(event => (
                          <div
                            key={event.id}
                            className="text-xs p-2 rounded cursor-pointer"
                            style={{ backgroundColor: getFolderColor(event.folder || 'PERSONAL') + '40', color: getFolderColor(event.folder || 'PERSONAL') }}
                            onClick={() => editEvent(event)}
                          >
                            <span className={isPastEvent(event) ? 'line-through text-gray-400 opacity-60' : ''}>
                              {event.time && `${formatEventTime(event.time)} `}{event.title}
                            </span>
                          </div>
                        ))}
                        <button
                          onClick={() => addEvent(day.toISOString().split('T')[0])}
                          className="w-full text-xs text-gray-500 hover:text-gray-300 p-1 transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {calendarView === 'day' && (
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <div className="mb-4">
                <div className="text-lg font-medium text-white">
                  {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div className="space-y-2">
                {getEventsForDate(currentDate).map(event => (
                  <div
                    key={event.id}
                    className="p-3 rounded-lg cursor-pointer flex items-center justify-between hover:bg-[#252545] transition-colors"
                    style={{ backgroundColor: getFolderColor(event.folder || 'PERSONAL') + '20', borderLeft: `4px solid ${getFolderColor(event.folder || 'PERSONAL')}` }}
                    onClick={() => editEvent(event)}
                  >
                    <div>
                      <div className={`font-medium ${isPastEvent(event) ? 'line-through text-gray-400 opacity-60' : 'text-white'}`}>
                        {event.title}
                      </div>
                      {event.time && <div className="text-sm text-gray-400">{formatEventTime(event.time)}</div>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteEventById(event.id) }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addEvent(currentDate.toISOString().split('T')[0])}
                  className="w-full p-3 text-gray-500 hover:text-white bg-[#1a1a2e] hover:bg-[#252545] rounded-lg transition-colors border-2 border-dashed border-gray-600"
                >
                  + Add Event
                </button>
              </div>
            </div>
          )}

          {calendarView === 'year' && (
            <div className="grid grid-cols-3 gap-4">
              {generateCalendarDays().map((month, index) => {
                const monthEvents = events.filter(event => {
                  const eventDate = new Date(event.date)
                  return eventDate.getFullYear() === month.getFullYear() && 
                         eventDate.getMonth() === month.getMonth()
                })
                return (
                  <div 
                    key={index} 
                    className="bg-[#1a1a2e] rounded-lg p-3 cursor-pointer hover:bg-[#202040] transition-colors"
                    onClick={() => {
                      setCalendarDate(month)
                      setCalendarView('month')
                    }}
                  >
                    <div className="font-medium text-white mb-2">
                      {month.toLocaleDateString('en-US', { month: 'long' })}
                    </div>
                    <div className="text-sm text-gray-400">
                      {monthEvents.length} events
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderCalendarPanel = () => (
    <div className="w-full md:w-80 bg-[#16213e] rounded-xl p-3 md:p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            ‹
          </button>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-300">This Week's Events</h4>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={hidePastThisWeek}
              onChange={(e) => setHidePastThisWeek(e.target.checked)}
              className="w-3 h-3 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Hide Past
          </label>
        </div>
        <div className="flex-1 max-h-[320px] overflow-y-auto space-y-2">
          {getThisWeekEvents()
            .filter(event => !hidePastThisWeek || !isPastEvent(event))
            .map(event => {
              const isPast = isPastEvent(event)
              return (
                <div 
                  key={event.id} 
                  className={`p-2 bg-[#1a1a2e] rounded-lg border-l-4 cursor-pointer hover:bg-[#202040] transition-colors ${isPast ? 'opacity-60' : ''}`}
                  style={{ borderLeftColor: getFolderColor(event.folder || 'PERSONAL') }}
                  onClick={() => editEvent(event)}
                >
                  <div className={`font-medium text-sm ${isPast ? 'line-through text-gray-400 opacity-60' : 'text-white'}`}>
                    {event.title}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatEventDate(event.date)}
                    {event.time && ` • ${toNYTimeDisplay(event.date + 'T' + event.time + ':00')}`}
                  </div>
                </div>
              )
            })}
          {getThisWeekEvents().filter(event => !hidePastEvents || !isPastEvent(event)).length === 0 && (
            <div className="text-sm text-gray-500 italic">
              {hidePastEvents ? 'No upcoming events this week' : 'No events this week'}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <button
          onClick={() => {
            // Create a new event template and open Event Details modal
            const todayNY = getTodayNY()
            const newEvent: CalendarEvent = {
              id: 0, // Temporary ID for new event
              title: '',
              description: '',
              folder: 'PERSONAL', // Default folder
              date: todayNY, // Today in NY timezone
              time: '',
              endTime: undefined,
              created_at: new Date().toISOString()
            }
            setEditingEvent(newEvent)
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
        >
          Add Event
        </button>
        <button className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors">
          Full Calendar
        </button>
      </div>
    </div>
  )

  const getChecklistItems = (type: 'daily-digest' | 'send-outs') => {
    let items = tasks.filter(t => t.folder === type)
    if (hideCompleted[type === 'daily-digest' ? 'digest' : 'sendouts']) {
      items = items.filter(t => !t.completed)
    }
    return items
  }

  const renderChecklist = (type: 'daily-digest' | 'send-outs', title: string) => {
    const items = getChecklistItems(type)
    const tabKey = type === 'daily-digest' ? 'digest' : 'sendouts'
    
    return (
      <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-white">{title}</h2>
          <button
            onClick={() => setHideCompleted(prev => ({ ...prev, [tabKey]: !prev[tabKey] }))}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {hideCompleted[tabKey] ? 'Show' : 'Hide'} completed
          </button>
        </div>

        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-[#1a1a2e] rounded-lg transition-colors group">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => toggleComplete(item)}
                className="w-4 h-4 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span
                onClick={() => setEditingTask(item)}
                className={`text-sm cursor-pointer flex-1 ${
                  item.completed ? 'line-through text-gray-500' : 'text-gray-200'
                }`}
              >
                {item.title}
              </span>
            </div>
          ))}
          
          <button
            onClick={() => addChecklistItem(type)}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-2 py-2 transition-colors"
          >
            + Add item...
          </button>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl text-gray-400 animate-pulse">Loading...</div>
    </div>
  )

  const renderWeeklyNotes = (author: string) => {
    const notes = getWeeklyNotes(author)
    
    return (
      <div className="bg-[#1a1a2e] rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-300">Weekly Notes</h3>
          <button
            onClick={() => addWeeklyNote(author)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            + Add note
          </button>
        </div>
        
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {notes.map(note => (
            <div key={note.id} className="flex items-start gap-2 p-2 bg-[#16213e] rounded text-xs">
              <input
                type="checkbox"
                checked={note.seen}
                onChange={() => markNoteSeen(note)}
                className="w-3 h-3 mt-0.5 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    note.author === 'jaclyn' ? 'bg-pink-900 text-pink-200' : 'bg-blue-900 text-blue-200'
                  }`}>
                    {note.author}
                  </span>
                  <span className="text-gray-500 text-xs">{formatNoteTime(note.created_at)}</span>
                  <button
                    onClick={() => deleteWeeklyNote(note.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors ml-auto"
                    title="Delete note"
                  >
                    ×
                  </button>
                </div>
                <p className={`text-gray-200 text-xs leading-relaxed ${note.seen ? 'opacity-60' : ''}`}>
                  {note.content}
                </p>
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-xs text-gray-500 italic py-2">No notes this week</div>
          )}
        </div>
      </div>
    )
  }

  const renderDailyDigest = () => {
    const categories = [
      { key: 'item_world', label: 'World', category: 'World', readKey: 'read_world' },
      { key: 'item_culture', label: 'Culture/Entrepreneurship/Streetwear', category: 'Culture', readKey: 'read_culture' },
      { key: 'item_prosports', label: 'Pro Sports (NBA/MLB/NFL)', category: 'Pro Sports', readKey: 'read_prosports' },
      { key: 'item_tampa', label: 'Tampa Local HS/MS Football & Baseball', category: 'Tampa Local', readKey: 'read_tampa' },
      { key: 'item_athlete', label: 'Athlete Development', category: 'Athlete Dev', readKey: 'read_athlete' }
    ]
    
    const filteredSavedItems = savedFilter === 'All' 
      ? savedDigestItems 
      : savedDigestItems.filter(item => item.category === savedFilter)
    
    // Filter out read items if hideRead is enabled
    const visibleCategories = hideRead && dailyDigest 
      ? categories.filter(({ readKey }) => !dailyDigest[readKey as keyof typeof dailyDigest])
      : categories
    
    return (
      <div className="space-y-3 md:space-y-6">
        {/* Today's RSS Digest */}
        <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Daily Digest</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={hideRead}
                  onChange={(e) => setHideRead(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                Hide Read
              </label>
              <div className="text-xs text-gray-400">
                {dailyDigest ? formatDateNY(dailyDigest.date) : 'Loading...'}
              </div>
            </div>
          </div>

          {dailyDigest ? (
            <div className="space-y-3">
              {visibleCategories.map(({ key, label, category, readKey }) => {
                const text = dailyDigest[key as keyof typeof dailyDigest] as string
                const isRead = dailyDigest[readKey as keyof typeof dailyDigest] as boolean
                return (
                  <div key={key} className="flex items-start gap-3 p-3 bg-[#1a1a2e] rounded-lg">
                    <input
                      type="checkbox"
                      checked={isRead}
                      onChange={(e) => markDigestItemRead(category, e.target.checked)}
                      className="w-4 h-4 mt-1 rounded border-gray-600 bg-[#16213e] text-green-500 focus:ring-green-500 focus:ring-offset-0 shrink-0"
                      title="Mark as read"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-400 mb-1 font-medium">{label}</div>
                      <div className="text-gray-200 text-sm leading-relaxed">{text}</div>
                    </div>
                    <button
                      onClick={() => saveDigestItem(text, category)}
                      className="text-yellow-500 hover:text-yellow-400 transition-colors p-1 shrink-0"
                      title={`Save ${category} item`}
                    >
                      ⭐
                    </button>
                  </div>
                )
              })}
              {visibleCategories.length === 0 && hideRead && (
                <div className="text-center text-gray-400 py-4">
                  <div className="text-sm">All items marked as read</div>
                  <div className="text-xs mt-1">Uncheck "Hide Read" to see them</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <div className="text-sm">Digest generates daily at 5:00 AM ET</div>
              <div className="text-xs mt-1">Next update: {new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
            </div>
          )}
        </div>

        {/* Saved Items */}
        {savedDigestItems.length > 0 && (
          <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold text-white">Saved</h3>
              <select
                value={savedFilter}
                onChange={(e) => setSavedFilter(e.target.value)}
                className="bg-[#1a1a2e] text-white rounded px-2 py-1 text-xs border border-gray-700 outline-none"
              >
                <option value="All">All Categories</option>
                <option value="World">World</option>
                <option value="Culture">Culture</option>
                <option value="Pro Sports">Pro Sports</option>
                <option value="Tampa Local">Tampa Local</option>
                <option value="Athlete Dev">Athlete Dev</option>
              </select>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredSavedItems.map(item => (
                <div key={item.id} className="p-3 bg-[#1a1a2e] rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs text-blue-400 font-medium">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {new Date(item.date_saved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={() => deleteSavedItem(item.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete saved item"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="text-gray-200 text-sm leading-relaxed">{item.text}</div>
                </div>
              ))}
              {filteredSavedItems.length === 0 && (
                <div className="text-center text-gray-500 py-4 text-sm">
                  No saved items in {savedFilter === 'All' ? 'any category' : savedFilter}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Existing Task Checklist */}
        {renderChecklist('daily-digest', 'Task Checklist')}
      </div>
    )
  }

  const renderSendOuts = () => {
    const recipients = [
      { key: 'message_stryker', label: 'Stryker', category: 'Stryker', sentKey: 'sent_stryker' },
      { key: 'message_jet', label: 'Jet', category: 'Jet', sentKey: 'sent_jet' },
      { key: 'message_parents', label: 'Parents', category: 'Parents', sentKey: 'sent_parents' },
      { key: 'message_friends', label: 'Friends/Family', category: 'Friends', sentKey: 'sent_friends' }
    ]
    
    // Only show recipients that have messages for today
    const activeRecipients = recipients.filter(({ key }) => 
      sendOuts && sendOuts[key as keyof typeof sendOuts]
    )
    
    // Filter out sent messages if hideSent is enabled
    const visibleRecipients = hideSent && sendOuts 
      ? activeRecipients.filter(({ sentKey }) => !sendOuts[sentKey as keyof typeof sendOuts])
      : activeRecipients
    
    return (
      <div className="space-y-3 md:space-y-6">
        {/* Today's Send Outs */}
        <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Send Outs</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={hideSent}
                  onChange={(e) => setHideSent(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                Hide Sent
              </label>
              <div className="text-xs text-gray-400">
                {sendOuts ? formatDateNY(sendOuts.date) : 'Loading...'}
              </div>
            </div>
          </div>

          {sendOuts ? (
            <div className="space-y-3">
              {visibleRecipients.map(({ key, label, category, sentKey }) => {
                const text = sendOuts[key as keyof typeof sendOuts] as string
                const isSent = sendOuts[sentKey as keyof typeof sendOuts] as boolean
                return (
                  <div key={key} className="flex items-start gap-3 p-3 bg-[#1a1a2e] rounded-lg">
                    <input
                      type="checkbox"
                      checked={isSent}
                      onChange={(e) => markSendOutSent(category.toLowerCase(), e.target.checked)}
                      className="w-4 h-4 mt-1 rounded border-gray-600 bg-[#16213e] text-green-500 focus:ring-green-500 focus:ring-offset-0 shrink-0"
                      title="Mark as sent"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-400 mb-1 font-medium">{label}</div>
                      <div className="text-gray-200 text-sm leading-relaxed">{text}</div>
                    </div>
                    <button
                      onClick={() => saveSendOutMessage(text, category)}
                      className="text-yellow-500 hover:text-yellow-400 transition-colors p-1 shrink-0"
                      title={`Save ${category} message`}
                    >
                      ⭐
                    </button>
                  </div>
                )
              })}
              {visibleRecipients.length === 0 && activeRecipients.length > 0 && hideSent && (
                <div className="text-center text-gray-400 py-4">
                  <div className="text-sm">All messages marked as sent</div>
                  <div className="text-xs mt-1">Uncheck "Hide Sent" to see them</div>
                </div>
              )}
              {activeRecipients.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-sm">No messages scheduled for today</div>
                  <div className="text-xs mt-1">Messages generate weekdays at 5:00 AM ET</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <div className="text-sm">Messages generate weekdays at 5:00 AM ET</div>
              <div className="text-xs mt-1">Next generation: Monday morning</div>
            </div>
          )}
        </div>

        {/* Saved Messages */}
        {savedSendOuts.length > 0 && (
          <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold text-white">Saved</h3>
              <div className="text-xs text-gray-400">{savedSendOuts.length} saved messages</div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {savedSendOuts.map(item => (
                <div key={item.id} className="p-3 bg-[#1a1a2e] rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs text-purple-400 font-medium">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {new Date(item.date_saved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={() => deleteSavedSendOut(item.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete saved message"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="text-gray-200 text-sm leading-relaxed">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing Task Checklist */}
        {renderChecklist('send-outs', 'Task Checklist')}
      </div>
    )
  }

  const renderWeeklyBoard = (board: 'jaclyn' | 'river') => (
    <div className="bg-[#16213e] rounded-xl p-3 md:p-4">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h2 className="text-base md:text-lg font-bold text-white capitalize">{board}</h2>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={() => navigateWeek('prev')}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Previous week"
            >
              ◀
            </button>
            <span 
              className="text-xs md:text-sm text-gray-400 cursor-pointer hover:text-white transition-colors" 
              onClick={goToCurrentWeek}
              title="Go to current week"
            >
              {weekRange}
            </span>
            <button
              onClick={() => navigateWeek('next')}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Next week"
            >
              ▶
            </button>
            <button
              onClick={goToCurrentWeek}
              className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded"
              title="Go to current week"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => toggleHideCompleted(board)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {hideCompleted[board] ? 'Show' : 'Hide'} completed
          </button>
        </div>
      </div>


      {/* Weekly Notes Section */}
      {renderWeeklyNotes(board)}

      <div className="space-y-2 md:space-y-3">
        {DAYS.map(day => {
          const isOverflow = day === 'overflow'
          const dayIndex = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].indexOf(day)
          const dateForDay = !isOverflow && dayIndex !== -1 ? weekDates[dayIndex] : null
          const tasksForDay = boardTasks(board, day)
          const isCollapsed = collapsed[`${board}-${day}`]

          return (
            <div key={day} className="bg-[#1a1a2e] rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCollapse(`${board}-${day}`)}
                className="w-full flex items-center justify-between p-2 md:p-3 hover:bg-[#202040] transition-colors"
              >
                <div className="text-left">
                  <div className="font-medium text-white text-xs md:text-sm">{DAY_LABELS[day]}</div>
                  {dateForDay && (
                    <div className="text-xs text-gray-400">
                      {dateForDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{tasksForDay.length}</span>
                  <span className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="px-2 md:px-3 pb-2 md:pb-3 space-y-1 md:space-y-2" data-drop-day={day}>
                  {tasksForDay.map(task => (
                    <div 
                      key={task.id}
                      data-task-id={task.id}
                      data-day={day}
                      className="group relative flex items-center gap-2 md:gap-3 p-1 md:p-2 hover:bg-[#252545] rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleComplete(task)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <div 
                        className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing px-1 text-xs select-none"
                        onPointerDown={(e) => handleTaskPointerDown(e, task)}
                        onPointerMove={handleTaskPointerMove}
                        onPointerUp={handleTaskPointerUp}
                        style={{ touchAction: 'none' }}
                        title="Drag to move"
                      >
                        ⋮⋮
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {task.priority !== 'none' && (
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                        )}
                        <span
                          onClick={() => setEditingTask(task)}
                          className={`text-xs md:text-sm cursor-pointer flex-1 ${
                            task.completed ? 'line-through text-gray-500' : 'text-gray-200'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.folder && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: folders.find(f => f.name === task.folder)?.color }}
                          />
                        )}
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 shrink-0"
                        title="Delete task"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addTask(board, day)}
                    className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-colors"
                  >
                    + Add item...
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderGroceryList = () => {
    const stores: Array<{ key: 'costco' | 'publix' | 'random'; label: string; color: string }> = [
      { key: 'costco', label: 'Costco', color: '#dc2626' },
      { key: 'publix', label: 'Publix', color: '#16a34a' },
      { key: 'random', label: 'Random', color: '#2563eb' }
    ]

    return (
      <div>
        {/* Header with toggle */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Grocery List</h2>
          <button
            onClick={toggleHideCheckedGrocery}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {hideCheckedGrocery ? 'Show' : 'Hide'} checked
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {stores.map(store => (
          <div key={store.key} className="bg-[#16213e] rounded-xl p-4 h-fit">
            <div className="flex items-center gap-2 mb-4">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: store.color }}
              />
              <h3 className="text-lg font-bold text-white">{store.label}</h3>
              <span className="text-sm text-gray-400">
                ({getGroceryItemsByStore(store.key).length})
              </span>
            </div>

            <div className="space-y-2 mb-4" data-grocery-drop-store={store.key}>
              {getGroceryItemsByStore(store.key).map(item => (
                <div 
                  key={item.id}
                  data-grocery-item-id={item.id}
                  className="group flex items-center gap-3 p-2 hover:bg-[#1a1a2e] rounded-lg transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => toggleGroceryItemChecked(item.id, e.target.checked)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div 
                    className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing px-1 text-xs select-none"
                    onPointerDown={(e) => handleGroceryPointerDown(e, item)}
                    onPointerMove={handleGroceryPointerMove}
                    onPointerUp={handleGroceryPointerUp}
                    style={{ touchAction: 'none' }}
                    title="Drag to move"
                  >
                    ⋮⋮
                  </div>
                  <span
                    className={`flex-1 text-sm ${
                      item.checked ? 'line-through text-gray-500' : 'text-gray-200'
                    }`}
                  >
                    {item.text}
                  </span>
                  <button
                    onClick={() => deleteGroceryItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                    title="Delete item"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add item..."
                className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement
                    addGroceryItem(store.key, target.value)
                    target.value = ''
                  }
                }}
              />
              <button
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling as HTMLInputElement
                  addGroceryItem(store.key, input.value)
                  input.value = ''
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        ))}
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-3 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="text-center mb-3 md:mb-4 relative">
        <div 
          ref={headerWordsRef}
          className="text-gray-500 text-xs font-light uppercase tracking-widest cursor-pointer select-none"
          onClick={handleHeaderWordsClick}
        >
          {dashboardSettings?.header_words || 'FAMILY · WEALTH · LOVE · CONNECTION · HEALTH · PEACE · HAPPINESS'}
        </div>
        
        {/* Admin Mode Indicators */}
        {adminMode && (
          <div className="absolute top-0 right-0 flex items-center gap-2">
            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">ADMIN</span>
            <button
              onClick={() => setEditingHeader(true)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Edit header words"
            >
              ⚙️
            </button>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <div></div>
        <div className="flex items-center gap-3">
          {syncing && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Syncing...</span>
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={syncing}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Vision Statement */}
      <div className="bg-[#16213e] rounded-xl p-2 md:p-3 mb-3 md:mb-4 relative">
        <div className="text-center">
          <div className="text-gray-400 text-xs italic mb-1 md:mb-3">Vision Statement</div>
          <div className="flex items-center gap-2 md:gap-4">
            {/* Left - Family Photo */}
            <div className="flex justify-center flex-shrink-0 relative">
              {dashboardSettings?.profile_image_url ? (
                <img 
                  src={dashboardSettings.profile_image_url} 
                  alt="Family" 
                  className="rounded-full object-cover" 
                  style={{ width: '68px', height: '68px' }}
                />
              ) : (
                <div className="rounded-full bg-gray-600 flex items-center justify-center" style={{ width: '68px', height: '68px' }}>
                  <span className="text-gray-400 text-xs">👨‍👩‍👦‍👦</span>
                </div>
              )}
              
              {/* Admin Mode - Image Upload */}
              {adminMode && (
                <div className="absolute -bottom-1 -right-1">
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors">
                    {uploadingImage ? '⏳' : '📷'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploadingImage}
                    />
                  </label>
                </div>
              )}
            </div>
            
            {/* Right - Vision Text */}
            <div className="flex-1 text-white text-xs md:text-sm leading-tight md:leading-relaxed min-w-0">
              {dashboardSettings?.vision_statement || 'Living with purpose, intention, love, and calm. Building wealth, deep connections, and time freedom while raising boys into confident, disciplined men.'}
            </div>
          </div>
        </div>
        
        {/* Admin Mode - Edit Vision Button */}
        {adminMode && (
          <button
            onClick={() => setEditingVision(true)}
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors p-1"
            title="Edit vision statement"
          >
            ✏️
          </button>
        )}
      </div>

      {/* Folder Tiles */}
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-3 mb-3 md:mb-6 snap-x snap-mandatory scrollbar-thin">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => {
              // Route PERSONAL folder to File Hub, others to standard folder view
              if (f.name === 'PERSONAL') {
                router.push('/personal')
              } else {
                router.push(`/folder/${f.name.toLowerCase().replace(/\s+/g, '-')}`)
              }
            }}
            className="snap-start shrink-0 px-3 md:px-4 py-2 rounded-full text-white text-xs md:text-sm font-medium transition-all opacity-80 hover:opacity-100 hover:scale-105 whitespace-nowrap"
            style={{ backgroundColor: f.color }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Main Layout - Left Content + Right Calendar */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-6 md:items-stretch">
        {/* Main Workspace */}
        <div className="flex-1 space-y-3 md:space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-[#16213e] rounded-xl p-1">
          {[
            { id: 'jaclyn', label: 'Jaclyn' },
            { id: 'river', label: 'River' },
            { id: 'grocery', label: 'Grocery List' },
            { id: 'digest', label: 'Daily Digest' },
            { id: 'sendouts', label: 'Send Outs' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 md:py-3 px-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-[#1a1a2e] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e]/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'jaclyn' && renderWeeklyBoard('jaclyn')}
        {activeTab === 'river' && renderWeeklyBoard('river')}
        {activeTab === 'grocery' && renderGroceryList()}
        {activeTab === 'digest' && renderDailyDigest()}
        {activeTab === 'sendouts' && renderSendOuts()}
        </div>

        {/* Calendar Panel */}
        <div className="w-full md:w-80 md:flex-shrink-0 h-full flex flex-col">
          {renderCalendarPanel()}
        </div>
      </div>

      {/* Full Calendar View */}
      {renderFullCalendar()}

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingTask(null)}>
          <div className="bg-[#16213e] rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">
              {editingTask.folder === 'daily-digest' || editingTask.folder === 'send-outs' ? 'Edit Item' : 'Edit Task'}
            </h3>

            <input
              className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none"
              value={editingTask.title}
              onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              placeholder="Title"
            />

            {/* Only show task-specific fields for regular tasks */}
            {editingTask.folder !== 'daily-digest' && editingTask.folder !== 'send-outs' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Priority</label>
                    <select
                      className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                      value={editingTask.priority}
                      onChange={e => setEditingTask({ ...editingTask, priority: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Owner</label>
                    <select
                      className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                      value={editingTask.owner}
                      onChange={e => setEditingTask({ ...editingTask, owner: e.target.value })}
                    >
                      <option value="jaclyn">Jaclyn</option>
                      <option value="river">River</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
                  <input
                    type="date"
                    className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                    value={editingTask.due_date || ''}
                    onChange={e => setEditingTask({ ...editingTask, due_date: e.target.value || null })}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Folder</label>
                  <select
                    className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                    value={editingTask.folder || ''}
                    onChange={e => setEditingTask({ ...editingTask, folder: e.target.value || '' })}
                  >
                    <option value="">None</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none resize-none"
                rows={3}
                value={editingTask.notes || ''}
                onChange={e => setEditingTask({ ...editingTask, notes: e.target.value || '' })}
                placeholder="Notes..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => saveTask(editingTask)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => deleteTask(editingTask.id)}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingEvent(null)}>
          <div className="bg-[#16213e] w-full max-w-md max-h-[90vh] flex flex-col rounded-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">Event Details</h3>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Title</label>
              <input
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none"
                value={editingEvent.title}
                onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                placeholder="Event title"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Folder</label>
                <select
                  className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                  value={editingEvent.folder || 'PERSONAL'}
                  onChange={e => setEditingEvent({ ...editingEvent, folder: e.target.value })}
                >
                  {folders.map(f => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Date</label>
                <input
                  type="date"
                  className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                  value={editingEvent.date}
                  onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Start Time</label>
                <input
                  type="time"
                  className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                  value={editingEvent.time || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, time: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">End Time</label>
                <input
                  type="time"
                  className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                  value={editingEvent.endTime || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, endTime: e.target.value })}
                  placeholder="Optional"
                />
                <div className="text-xs text-gray-500 mt-1">Optional</div>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Description</label>
              <textarea
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none resize-none"
                rows={3}
                value={editingEvent.description || ''}
                onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                placeholder="Event notes..."
              />
            </div>

            {/* Repeat Section */}
            <div className="border-t border-gray-700 pt-4">
              <label className="text-xs text-gray-400 mb-2 block">Repeat</label>
              <select
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none mb-3"
                value={recurrenceType}
                onChange={e => setRecurrenceType(e.target.value as 'none' | 'weekly' | 'every4weeks')}
              >
                <option value="none">None</option>
                <option value="weekly">Weekly</option>
                <option value="every4weeks">Every 4 Weeks</option>
              </select>

              {recurrenceType === 'weekly' && (
                <div className="mb-3">
                  <label className="text-xs text-gray-400 mb-2 block">Days</label>
                  <div className="grid grid-cols-7 gap-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                      const dayValue = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][index]
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setWeeklyDays(prev => 
                              prev.includes(dayValue) 
                                ? prev.filter(d => d !== dayValue)
                                : [...prev, dayValue]
                            )
                          }}
                          className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                            weeklyDays.includes(dayValue)
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-gray-600'
                          }`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {recurrenceType !== 'none' && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">End Condition</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setRecurrenceEndType('date')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        recurrenceEndType === 'date'
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-gray-600'
                      }`}
                    >
                      Until Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecurrenceEndType('count')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        recurrenceEndType === 'count'
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-gray-600'
                      }`}
                    >
                      # of Times
                    </button>
                  </div>
                  {recurrenceEndType === 'date' ? (
                    <input
                      type="date"
                      className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                      value={recurrenceEndDate}
                      onChange={e => setRecurrenceEndDate(e.target.value)}
                    />
                  ) : (
                    <input
                      type="number"
                      className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none"
                      value={recurrenceCount}
                      onChange={e => setRecurrenceCount(parseInt(e.target.value) || 1)}
                      min="1"
                      max="100"
                      placeholder="Number of occurrences"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Mobile-only Move Section */}
            <div className="md:hidden border-t border-gray-700 pt-4 pointer-events-auto">
              <label className="text-xs text-gray-400 mb-2 block">Move Event</label>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    moveEventToTomorrow(editingEvent)
                  }}
                  className="flex-1 bg-[#1a1a2e] hover:bg-[#252545] text-white rounded-lg py-2 text-xs font-medium transition-colors border border-gray-600 touch-manipulation"
                  style={{ touchAction: 'manipulation' }}
                >
                  Tomorrow
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    moveEventToNextWeek(editingEvent)
                  }}
                  className="flex-1 bg-[#1a1a2e] hover:bg-[#252545] text-white rounded-lg py-2 text-xs font-medium transition-colors border border-gray-600 touch-manipulation"
                  style={{ touchAction: 'manipulation' }}
                >
                  Next Week
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openDatePicker(editingEvent)
                  }}
                  className="flex-1 bg-[#1a1a2e] hover:bg-[#252545] text-white rounded-lg py-2 text-xs font-medium transition-colors border border-gray-600 touch-manipulation"
                  style={{ touchAction: 'manipulation' }}
                >
                  Pick Date
                </button>
              </div>
              
              {/* TEMP: On-screen debug info */}
              {debugInfo && (
                <div className="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-300 font-mono whitespace-pre-line">
                  {debugInfo}
                </div>
              )}
            </div>

            {/* Debug info - Always visible */}
            {debugInfo && (
              <div className="p-3 bg-gray-800 rounded text-xs text-gray-300 font-mono whitespace-pre-line max-h-40 overflow-y-auto">
                {debugInfo}
              </div>
            )}

            {/* Duplicate Section */}
            <div className="border-t border-gray-700 pt-4">
              <label className="text-xs text-gray-400 mb-2 block">Duplicate</label>
              <div className="flex gap-2">
                <button
                  onClick={() => duplicateEvent(editingEvent, 'next-week')}
                  className="flex-1 bg-[#1a1a2e] hover:bg-[#252545] text-white rounded-lg py-2 text-xs font-medium transition-colors border border-gray-600"
                >
                  Next Week
                </button>
                <button
                  onClick={() => duplicateEvent(editingEvent, 'pick-date')}
                  className="flex-1 bg-[#1a1a2e] hover:bg-[#252545] text-white rounded-lg py-2 text-xs font-medium transition-colors border border-gray-600"
                >
                  Pick Date
                </button>
              </div>
            </div>
            </div>

            {/* Sticky Footer */}
            <div className="p-6 border-t border-gray-700 bg-[#16213e]">
              <div className="flex gap-3">
                <button
                  onClick={() => saveEvent(editingEvent)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => deleteEventById(editingEvent.id)}
                  className="bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vision Statement Modal */}
      {editingVision && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingVision(false)}>
          <div className="bg-[#16213e] rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Edit Vision Statement</h3>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Vision Statement</label>
              <textarea
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-3 text-sm border border-gray-700 focus:border-blue-500 outline-none resize-none"
                rows={6}
                value={visionText}
                onChange={e => setVisionText(e.target.value)}
                placeholder="Enter your vision statement..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveVisionStatement}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setVisionText(dashboardSettings?.vision_statement || '')
                  setEditingVision(false)
                }}
                className="bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Header Words Modal */}
      {editingHeader && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingHeader(false)}>
          <div className="bg-[#16213e] rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Edit Header Words</h3>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Header Words (separated by ·)</label>
              <input
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-3 text-sm border border-gray-700 focus:border-blue-500 outline-none"
                value={headerWords}
                onChange={e => setHeaderWords(e.target.value)}
                placeholder="FAMILY · WEALTH · LOVE · CONNECTION · HEALTH · PEACE · HAPPINESS"
              />
              <div className="text-xs text-gray-500 mt-1">
                Tip: Use the · character to separate words (Alt+0183 or Option+Shift+9)
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveHeaderWords}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setHeaderWords(dashboardSettings?.header_words || '')
                  setEditingHeader(false)
                }}
                className="bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
