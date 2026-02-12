'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Folder, Task, FOLDERS_TABLE, TASKS_TABLE } from '@/lib/supabase'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','overflow'] as const
const DAY_LABELS: Record<string, string> = {
  monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
  friday:'Fri', saturday:'Sat', sunday:'Sun', overflow:'Overflow'
}
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-blue-500'
}

// Get current week dates in EST timezone
const getCurrentWeekDates = () => {
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const currentDay = est.getDay()
  const startOfWeek = new Date(est)
  startOfWeek.setDate(est.getDate() - (currentDay === 0 ? 6 : currentDay - 1))
  
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
    weekRange: `${weekStart} - ${weekEnd}`
  }
}

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'jaclyn' | 'river' | 'digest' | 'sendouts'>('jaclyn')
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

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setSyncing(true)
    try {
      const [{ data: f }, { data: t }] = await Promise.all([
        supabase.from(FOLDERS_TABLE).select('*').order('id'),
        supabase.from(TASKS_TABLE).select('*')
      ])
      if (f) setFolders(f)
      if (t) {
        // Map existing schema to expected dashboard format
        const mappedTasks = t.map(task => ({
          ...task,
          owner: task.assignee,
          completed: !!task.completed_at,
          notes: task.description,
          day_of_week: 'monday', // Default for existing tasks
          board: task.assignee === 'jaclyn' ? 'jaclyn' : 'river',
          sort_order: 0
        }))
        setTasks(mappedTasks)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => { 
    fetchData()
    
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

    // Backup periodic refresh every 30 seconds
    const intervalRefresh = setInterval(() => {
      fetchData(true)
    }, 30000)

    return () => {
      taskSubscription.unsubscribe()
      folderSubscription.unsubscribe()
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
    const { data } = await supabase.from(TASKS_TABLE).insert({
      title: title.trim(),
      description: '',
      folder: 'PERSONAL',
      assignee: board,
      status: 'pending',
      priority: 'medium'
    }).select().single()
    if (data) {
      const mappedTask = {
        ...data,
        owner: data.assignee,
        completed: false,
        notes: data.description,
        day_of_week: day,
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

  const saveTask = async (task: Task) => {
    const { id, created_at, owner, completed, notes, day_of_week, board, sort_order, ...updates } = task
    // Map dashboard fields back to database schema
    const dbUpdates = {
      ...updates,
      assignee: owner,
      description: notes,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
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

  const filteredTasks = activeFolder
    ? tasks.filter(t => t.folder === activeFolder)
    : tasks

  const boardTasks = (board: string, day: string) => {
    let t = filteredTasks.filter(t => t.board === board && t.day_of_week === day)
    if (hideCompleted[board]) t = t.filter(t => !t.completed)
    return t
  }

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const { dates: weekDates, weekRange } = getCurrentWeekDates()

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

  const renderWeeklyBoard = (board: 'jaclyn' | 'river') => (
    <div className="bg-[#16213e] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white capitalize">{board}</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{weekRange}</span>
          <button
            onClick={() => setHideCompleted(prev => ({ ...prev, [board]: !prev[board] }))}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {hideCompleted[board] ? 'Show' : 'Hide'} completed
          </button>
        </div>
      </div>

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
    <main className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1"></div>
        <h1 className="text-2xl md:text-3xl font-bold text-white text-center">
          Life Command Center
        </h1>
        <div className="flex-1 flex justify-end items-center gap-3">
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

      {/* Folder Tiles */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 snap-x snap-mandatory scrollbar-thin">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(activeFolder === f.name ? null : f.name)}
            className={`snap-start shrink-0 px-4 py-2 rounded-full text-white text-sm font-medium transition-all ${
              activeFolder === f.name ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a2e] scale-105' : 'opacity-80 hover:opacity-100'
            }`}
            style={{ backgroundColor: f.color }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Main Workspace */}
      <div className="space-y-6">
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
        {activeTab === 'digest' && renderChecklist('daily-digest', 'Daily Digest')}
        {activeTab === 'sendouts' && renderChecklist('send-outs', 'Send Outs')}
      </div>

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
