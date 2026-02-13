'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Folder, Task, CalendarEvent, WeeklyNote, FOLDERS_TABLE, TASKS_TABLE } from '@/lib/supabase'

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
  const [activeTab, setActiveTab] = useState<'jaclyn' | 'river' | 'digest' | 'sendouts'>('jaclyn')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'year'>('month')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [hideCompleted, setHideCompleted] = useState<Record<string, boolean>>({ 
    jaclyn: false, 
    river: false, 
    digest: false, 
    sendouts: false 
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  
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
      
      const [{ data: f }, { data: t }, { data: e }, { data: n }] = await Promise.all([
        supabase.from(FOLDERS_TABLE).select('*').order('id'),
        supabase.from(TASKS_TABLE)
          .select('*')
          .eq('week_start', weekStartDate), // Only exact week match - no fallback
        supabase.from('posts').select('*').eq('platform', 'calendar').order('scheduled_for'),
        supabase.from('posts').select('*').eq('platform', 'weekly-notes').order('created_at', { ascending: false })
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
          sort_order: 0,
          week_start: task.week_start // Don't override - use exact DB value
        }))
        setTasks(mappedTasks)
        console.log('🔍 Mapped tasks:', mappedTasks.length, 'tasks for week', weekStartDate)
      }
      if (e) {
        // Map posts table to calendar events
        const mappedEvents = e.map(post => ({
          id: post.id,
          title: post.title,
          description: post.folder, // Store folder name for color coding
          date: post.scheduled_for?.split('T')[0] || new Date().toISOString().split('T')[0],
          time: post.scheduled_for?.split('T')[1]?.substring(0, 5),
          created_at: post.created_at
        }))
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

  // Date helpers for America/New_York timezone
  const getTodayNY = () => {
    const now = new Date()
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    return nyTime.toISOString().split('T')[0] // YYYY-MM-DD format
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
      const mappedEvent = {
        id: data.id,
        title: data.title,
        description: data.folder, // Store folder name for color coding
        date: data.scheduled_for?.split('T')[0] || date,
        time: data.scheduled_for?.split('T')[1]?.substring(0, 5),
        created_at: data.created_at
      }
      setEvents(prev => [...prev, mappedEvent])
    }
  }

  const editEvent = async (event: CalendarEvent) => {
    const title = prompt('Event title:', event.title)
    if (!title) return
    
    const time = prompt('Time (HH:MM, leave empty for all-day):', event.time || '')
    
    let folder = 'PERSONAL'
    if (folders.length > 0) {
      const folderOptions = folders.map(f => f.name).join(', ')
      const selectedFolder = prompt(`Category (${folderOptions}):`, 'PERSONAL')
      if (selectedFolder?.trim()) folder = selectedFolder.trim()
    }
    
    const scheduledFor = time?.trim() 
      ? `${event.date}T${time}:00`
      : `${event.date}T12:00:00`
    
    const { data } = await supabase.from('posts')
      .update({
        title: title.trim(),
        folder: folder,
        scheduled_for: scheduledFor
      })
      .eq('id', event.id)
      .select()
      .single()
    
    if (data) {
      const mappedEvent = {
        id: data.id,
        title: data.title,
        description: data.folder, // Store folder name for color coding
        date: data.scheduled_for?.split('T')[0] || event.date,
        time: data.scheduled_for?.split('T')[1]?.substring(0, 5),
        created_at: data.created_at
      }
      setEvents(prev => prev.map(e => e.id === event.id ? mappedEvent : e))
    }
  }

  const deleteEvent = async (eventId: number) => {
    if (!confirm('Delete this event?')) return
    await supabase.from('posts').delete().eq('id', eventId)
    setEvents(prev => prev.filter(e => e.id !== eventId))
  }

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
    return t
  }

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const { dates: weekDates, weekRange, weekStartDate } = getWeekDates(selectedWeek)

  const getThisWeekEvents = () => {
    const startDate = weekDates[0].toISOString().split('T')[0]
    const endDate = weekDates[6].toISOString().split('T')[0]
    return events
      .filter(event => event.date >= startDate && event.date <= endDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
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
    const date = new Date(dateStr)
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
      <div className="bg-[#16213e] rounded-xl p-6 mt-6">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Calendar</h2>
            <div className="flex gap-1 bg-[#1a1a2e] rounded-lg p-1">
              {(['month', 'week', 'day', 'year'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setCalendarView(view)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-all ${
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
          
          <div className="flex items-center gap-4">
            <div className="text-lg font-medium text-white">{getCalendarTitle()}</div>
            <div className="flex gap-1">
              <button
                onClick={() => navigateCalendar('prev')}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                ←
              </button>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="px-3 py-1 text-sm bg-[#1a1a2e] text-gray-400 hover:text-white rounded transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => navigateCalendar('next')}
                className="p-2 text-gray-400 hover:text-white transition-colors"
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
              <div className="grid grid-cols-7 gap-px">
                {generateCalendarDays().map((day, index) => {
                  const dayEvents = getEventsForDate(day)
                  return (
                    <div
                      key={index}
                      className={`min-h-[100px] p-2 bg-[#1a1a2e] border border-gray-700 cursor-pointer hover:bg-[#202040] transition-colors ${
                        !isCurrentMonth(day) ? 'opacity-50' : ''
                      } ${isToday(day) ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => addEvent(day.toISOString().split('T')[0])}
                    >
                      <div className={`text-sm mb-1 ${isToday(day) ? 'font-bold text-blue-400' : 'text-gray-300'}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            className="text-xs p-1 rounded truncate cursor-pointer"
                            style={{ backgroundColor: getFolderColor(event.description || 'PERSONAL') + '40', color: getFolderColor(event.description || 'PERSONAL') }}
                            onClick={(e) => { e.stopPropagation(); editEvent(event) }}
                          >
                            {event.time && `${event.time} `}{event.title}
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
                    <div key={index} className="bg-[#1a1a2e] rounded-lg p-3">
                      <div className={`text-center mb-3 ${isToday(day) ? 'font-bold text-blue-400' : 'text-gray-300'}`}>
                        <div className="text-xs">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className="text-lg">{day.getDate()}</div>
                      </div>
                      <div className="space-y-1 min-h-[200px]">
                        {dayEvents.map(event => (
                          <div
                            key={event.id}
                            className="text-xs p-2 rounded cursor-pointer"
                            style={{ backgroundColor: getFolderColor(event.description || 'PERSONAL') + '40', color: getFolderColor(event.description || 'PERSONAL') }}
                            onClick={() => editEvent(event)}
                          >
                            {event.time && `${event.time} `}{event.title}
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
                    style={{ backgroundColor: getFolderColor(event.description || 'PERSONAL') + '20', borderLeft: `4px solid ${getFolderColor(event.description || 'PERSONAL')}` }}
                    onClick={() => editEvent(event)}
                  >
                    <div>
                      <div className="font-medium text-white">{event.title}</div>
                      {event.time && <div className="text-sm text-gray-400">{event.time}</div>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteEvent(event.id) }}
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
    <div className="w-80 bg-[#16213e] rounded-xl p-4 h-fit">
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

      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">This Week's Events</h4>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {getThisWeekEvents().map(event => (
            <div 
              key={event.id} 
              className="p-2 bg-[#1a1a2e] rounded-lg border-l-4 cursor-pointer hover:bg-[#202040] transition-colors"
              style={{ borderLeftColor: getFolderColor(event.description || 'PERSONAL') }}
              onClick={() => editEvent(event)}
            >
              <div className="font-medium text-white text-sm">{event.title}</div>
              <div className="text-xs text-gray-400">
                {formatEventDate(event.date)}
                {event.time && ` • ${event.time}`}
              </div>
            </div>
          ))}
          {getThisWeekEvents().length === 0 && (
            <div className="text-sm text-gray-500 italic">No events this week</div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => addEvent()}
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
      <div className="bg-[#16213e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
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
      <div className="space-y-6">
        {/* Today's RSS Digest */}
        <div className="bg-[#16213e] rounded-xl p-4">
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
          <div className="bg-[#16213e] rounded-xl p-4">
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
      <div className="space-y-6">
        {/* Today's Send Outs */}
        <div className="bg-[#16213e] rounded-xl p-4">
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
          <div className="bg-[#16213e] rounded-xl p-4">
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
    <div className="bg-[#16213e] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white capitalize">{board}</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateWeek('prev')}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Previous week"
            >
              ◀
            </button>
            <span 
              className="text-sm text-gray-400 cursor-pointer hover:text-white transition-colors" 
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
          </div>
          <button
            onClick={() => setHideCompleted(prev => ({ ...prev, [board]: !prev[board] }))}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {hideCompleted[board] ? 'Show' : 'Hide'} completed
          </button>
        </div>
      </div>

      {/* Weekly Notes Section */}
      {renderWeeklyNotes(board)}

      <div className="space-y-3">
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
                className="w-full flex items-center justify-between p-3 hover:bg-[#202040] transition-colors"
              >
                <div className="text-left">
                  <div className="font-medium text-white text-sm">{DAY_LABELS[day]}</div>
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
                <div className="px-3 pb-3 space-y-2">
                  {tasksForDay.map(task => (
                    <div key={task.id} className="group flex items-center gap-3 p-2 hover:bg-[#252545] rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleComplete(task)}
                        className="w-4 h-4 rounded border-gray-600 bg-[#1a1a2e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {task.priority !== 'none' && (
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                        )}
                        <span
                          onClick={() => setEditingTask(task)}
                          className={`text-sm cursor-pointer flex-1 ${
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

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">Command HQ</h1>
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
      <div className="bg-[#16213e] rounded-xl p-4 mb-6">
        <div className="text-center">
          <div className="text-gray-400 text-xs italic mb-2">Vision Statement</div>
          <div className="text-white text-sm leading-relaxed max-w-2xl mx-auto">
            I am building forever financial freedom and a multi-millionaire life rooted in love, connection, calm, health, and joy. I am becoming the strongest, healthiest, most aligned version of myself so I can lead my boys and my family to become the strongest, healthiest, happiest versions of themselves.
          </div>
        </div>
      </div>

      {/* Folder Tiles */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 snap-x snap-mandatory scrollbar-thin">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => router.push(`/folder/${f.name.toLowerCase().replace(/\s+/g, '-')}`)}
            className="snap-start shrink-0 px-4 py-2 rounded-full text-white text-sm font-medium transition-all opacity-80 hover:opacity-100 hover:scale-105"
            style={{ backgroundColor: f.color }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Main Layout - Left Content + Right Calendar */}
      <div className="flex gap-6">
        {/* Main Workspace */}
        <div className="flex-1 space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-[#16213e] rounded-xl p-1">
          {[
            { id: 'jaclyn', label: 'Jaclyn' },
            { id: 'river', label: 'River' },
            { id: 'digest', label: 'Daily Digest' },
            { id: 'sendouts', label: 'Send Outs' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
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
        {activeTab === 'digest' && renderDailyDigest()}
        {activeTab === 'sendouts' && renderSendOuts()}
        </div>

        {/* Calendar Panel */}
        {renderCalendarPanel()}
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
    </main>
  )
}
