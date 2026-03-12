import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date } = body
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 })
    }
    
    // Validate it's a weekday (Mon-Fri)
    const targetDate = new Date(date + 'T12:00:00')
    const dayOfWeek = targetDate.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ error: 'Instagram engagement tasks are only created for weekdays' }, { status: 400 })
    }
    
    // Calculate week_start (Monday of the target date's week)
    const weekStart = new Date(targetDate)
    const currentDay = weekStart.getDay()
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
    weekStart.setDate(weekStart.getDate() - daysFromMonday)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    
    // Map day number to day name
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[dayOfWeek]
    
    // Format task title
    const dateObj = new Date(date + 'T12:00:00')
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York'
    })
    const taskTitle = `Instagram Engagement - ${formattedDate}`
    
    // Check for duplicate (same week_start + assignee + title pattern)
    const { data: existingTasks, error: checkError } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('week_start', weekStartStr)
      .eq('assignee', 'jaclyn')
      .ilike('title', 'Instagram Engagement%')
    
    if (checkError) {
      console.error('Error checking for duplicates:', checkError)
      return NextResponse.json({ error: 'Failed to check for duplicates' }, { status: 500 })
    }
    
    // Check if task for this exact date already exists
    const duplicateExists = existingTasks?.some(task => task.title === taskTitle)
    if (duplicateExists) {
      return NextResponse.json({ 
        message: 'Task already exists',
        taskTitle,
        skipped: true 
      }, { status: 200 })
    }
    
    // Create the task
    const { data: newTask, error: createError } = await supabase
      .from('tasks')
      .insert({
        title: taskTitle,
        description: '', // Blank for now - Phase 2 will add Google Sheet link
        folder: 'SteeleBroz',
        assignee: 'jaclyn',
        status: 'pending',
        priority: 'medium',
        week_start: weekStartStr,
        day_of_week: dayName,
        sort_order: 0
      })
      .select()
      .single()
    
    if (createError) {
      console.error('Error creating task:', createError)
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }
    
    return NextResponse.json({
      message: 'Instagram engagement task created successfully',
      task: {
        id: newTask.id,
        title: newTask.title,
        date: date,
        day_of_week: dayName,
        week_start: weekStartStr
      }
    })
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}// Force rebuild
