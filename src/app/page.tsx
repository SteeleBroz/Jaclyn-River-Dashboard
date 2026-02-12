'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Folder, Task } from '@/lib/supabase'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','overflow'] as const
const DAY_LABELS: Record<string, string> = {
  monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
  friday:'Fri', saturday:'Sat', sunday:'Sun', overflow:'Overflow'
}
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-blue-500'
}

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState<Record<string, boolean>>({ jaclyn: false, river: false })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const [{ data: f }, { data: t }] = await Promise.all([
      supabase.from('folders').select('*').order('sort_order'),
      supabase.from('tasks').select('*').order('sort_order')
    ])
    if (f) setFolders(f)
    if (t) setTasks(t)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleComplete = async (task: Task) => {
    const updated = !task.completed
    await supabase.from('tasks').update({ completed: updated }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: updated } : t))
  }

  const addTask = async (board: string, day: string) => {
    const title = prompt('Task title:')
    if (!title?.trim()) return
    const { data } = await supabase.from('tasks').insert({
      title: title.trim(), day_of_week: day, board, owner: board, priority: 'none', sort_order: 0
    }).select().single()
    if (data) setTasks(prev => [...prev, data])
  }

  const saveTask = async (task: Task) => {
    const { id, created_at, ...updates } = task
    await supabase.from('tasks').update(updates).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? task : t))
    setEditingTask(null)
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
    setEditingTask(null)
  }

  const filteredTasks = activeFolder
    ? tasks.filter(t => t.folder_id === activeFolder)
    : tasks

  const boardTasks = (board: string, day: string) => {
    let t = filteredTasks.filter(t => t.board === board && t.day_of_week === day)
    if (hideCompleted[board]) t = t.filter(t => !t.completed)
    return t
  }

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl text-gray-400 animate-pulse">Loading...</div>
    </div>
  )

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 text-center">
        Life Command Center
      </h1>

      {/* Folder Tiles */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 snap-x snap-mandatory scrollbar-thin">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(activeFolder === f.id ? null : f.id)}
            className={`snap-start shrink-0 px-4 py-2 rounded-full text-white text-sm font-medium transition-all ${
              activeFolder === f.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a2e] scale-105' : 'opacity-80 hover:opacity-100'
            }`}
            style={{ backgroundColor: f.color }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Boards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {['jaclyn', 'river'].map(board => (
          <div key={board} className="bg-[#16213e] rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white capitalize">{board}</h2>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideCompleted[board]}
                  onChange={() => setHideCompleted(prev => ({ ...prev, [board]: !prev[board] }))}
                  className="rounded"
                />
                Hide completed
              </label>
            </div>

            <div className="space-y-1">
              {DAYS.map(day => {
                const key = `${board}-${day}`
                const dayTasks = boardTasks(board, day)
                const isCollapsed = collapsed[key]
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleCollapse(key)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1a1a2e] hover:bg-[#1f2544] transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-300">
                        {DAY_LABELS[day]}
                        <span className="ml-2 text-xs text-gray-500">({dayTasks.length})</span>
                      </span>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {!isCollapsed && (
                      <div className="pl-2 pr-1 py-1 space-y-1">
                        {dayTasks.map(task => (
                          <div
                            key={task.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1f2544] group transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => toggleComplete(task)}
                              className="rounded shrink-0"
                            />
                            {task.priority !== 'none' && (
                              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                            )}
                            <span
                              onClick={() => setEditingTask({ ...task })}
                              className={`text-sm cursor-pointer flex-1 ${
                                task.completed ? 'line-through text-gray-500' : 'text-gray-200'
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.folder_id && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: folders.find(f => f.id === task.folder_id)?.color }}
                              />
                            )}
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
        ))}
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingTask(null)}>
          <div className="bg-[#16213e] rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Edit Task</h3>

            <input
              className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none"
              value={editingTask.title}
              onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              placeholder="Title"
            />

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
                value={editingTask.folder_id || ''}
                onChange={e => setEditingTask({ ...editingTask, folder_id: e.target.value || null })}
              >
                <option value="">None</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea
                className="w-full bg-[#1a1a2e] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 outline-none resize-none"
                rows={3}
                value={editingTask.notes || ''}
                onChange={e => setEditingTask({ ...editingTask, notes: e.target.value || null })}
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
