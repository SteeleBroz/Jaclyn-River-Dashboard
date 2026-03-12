import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Google API setup - using environment variables
const TEMPLATE_SHEET_ID = '1D74x4m2wkDIjmk7ELnfZmXE-v3iDdmOmkDRD1IljIYI'
const THUMB_EQUITY_FOLDER_ID = '1MHM1ezP6N1IoHezz2Lr0hDezZleW3PXH'

async function getGoogleAuthToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google API environment variables')
  }
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Failed to get Google auth token:', error)
    throw error
  }
}

async function createGoogleSheet(date: string, taskTitle: string) {
  try {
    const accessToken = await getGoogleAuthToken()
    
    // Format sheet name
    const dateObj = new Date(date + 'T12:00:00')
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York'
    })
    const sheetName = `SteeleBroz Daily Engagement - ${formattedDate}`
    
    // Check for existing sheet in Thumb Equity folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(sheetName)}' and '${THUMB_EQUITY_FOLDER_ID}' in parents&fields=files(id,name,webViewLink)`
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!searchResponse.ok) {
      throw new Error(`Failed to search for existing sheet: ${searchResponse.statusText}`)
    }
    
    const searchData = await searchResponse.json()
    
    // If sheet already exists, return its URL
    if (searchData.files && searchData.files.length > 0) {
      const existingSheet = searchData.files[0]
      console.log('Using existing sheet:', existingSheet.name)
      return existingSheet.webViewLink
    }
    
    // Copy the template sheet
    const copyUrl = `https://www.googleapis.com/drive/v3/files/${TEMPLATE_SHEET_ID}/copy`
    
    const copyResponse = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: sheetName,
        parents: [THUMB_EQUITY_FOLDER_ID]
      })
    })
    
    if (!copyResponse.ok) {
      throw new Error(`Failed to copy template sheet: ${copyResponse.statusText}`)
    }
    
    const copyData = await copyResponse.json()
    
    // Get the web view link
    const getUrl = `https://www.googleapis.com/drive/v3/files/${copyData.id}?fields=webViewLink`
    
    const getResponse = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!getResponse.ok) {
      throw new Error(`Failed to get sheet URL: ${getResponse.statusText}`)
    }
    
    const getData = await getResponse.json()
    console.log('Created new sheet:', sheetName, 'URL:', getData.webViewLink)
    
    return getData.webViewLink
    
  } catch (error) {
    console.error('Google Sheet creation failed:', error)
    throw error
  }
}

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
    
    // Create Google Sheet FIRST - if this fails, stop entirely
    let sheetUrl: string
    try {
      sheetUrl = await createGoogleSheet(date, taskTitle)
    } catch (sheetError) {
      console.error('Google Sheet creation failed, stopping task creation:', sheetError)
      return NextResponse.json({ 
        error: 'Failed to create Google Sheet - task creation stopped',
        details: sheetError instanceof Error ? sheetError.message : 'Unknown error'
      }, { status: 500 })
    }
    
    // Create the task with Google Sheet link in description
    const taskDescription = `Daily Instagram Engagement Sheet: ${sheetUrl}`
    
    const { data: newTask, error: createError } = await supabase
      .from('tasks')
      .insert({
        title: taskTitle,
        description: taskDescription,
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
      message: 'Instagram engagement task and Google Sheet created successfully',
      task: {
        id: newTask.id,
        title: newTask.title,
        description: newTask.description,
        date: date,
        day_of_week: dayName,
        week_start: weekStartStr,
        sheet_url: sheetUrl
      }
    })
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}// Force rebuild
// Trigger redeploy for env vars
