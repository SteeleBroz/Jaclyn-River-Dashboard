import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Google API setup - using environment variables
const TEMPLATE_SHEET_ID = '1D74x4m2wkDIjmk7ELnfZmXE-v3iDdmOmkDRD1IljIYI'
const THUMB_EQUITY_FOLDER_ID = '1MHM1ezP6N1IoHezz2Lr0hDezZleW3PXH'
const ACCOUNT_POOLS_SHEET_ID = '1kkm06dyke9DbJK45MpWot_2Cahx-gBq94MfYoNCpgz8'
const MASTER_TRACKER_SHEET_ID = '1Rt8ckpGPGu1esmL1_HIHIHkWZypXUSOl5dhAbTab2mY'
const MASTER_ENGAGEMENT_SHEET_NAME = 'SteeleBroz Daily Engagement Master'

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

async function selectAccountsFromPools(accessToken: string) {
  try {
    // Get current date for tracking
    const today = new Date().toISOString().split('T')[0]
    
    // Fetch all pools
    const poolsUrl = `https://www.googleapis.com/drive/v3/files/${ACCOUNT_POOLS_SHEET_ID}/export?mimeType=application/json`
    // Instead, let's use Google Sheets API directly
    
    // Get accounts from Master Tracker to check last engaged dates
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/A2:L100`
    
    const response = await fetch(sheetsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch account data: ${response.statusText}`)
    }
    
    const data = await response.json()
    const accounts = Array.isArray(data.values) ? data.values : []
    
    // Parse accounts and categorize
    const relationshipAccounts = accounts.filter((row: any[]) => row[2] === 'Relationship')
    const discoveryAccounts = accounts.filter((row: any[]) => row[2] === 'Discovery')  
    const communityAccounts = accounts.filter((row: any[]) => row[2] === 'Community')
    
    // Account selection with rotation logic
    const selectWithRotation = (pool: any[], count: number, maxDaysAgo: number = 3) => {
      if (!Array.isArray(pool) || pool.length === 0) return []
      
      // Filter accounts that haven't been engaged recently
      const available = pool.filter(account => {
        const lastEngaged = account[6] // Last Engaged Date column
        if (!lastEngaged) return true
        
        const daysSinceEngaged = Math.floor((Date.now() - new Date(lastEngaged).getTime()) / (1000 * 60 * 60 * 24))
        return daysSinceEngaged >= maxDaysAgo
      })
      
      // If not enough available, include all accounts
      const selectionPool = available.length >= count ? available : pool
      
      // Sort by engagement count (ascending) to prioritize least engaged
      selectionPool.sort((a, b) => parseInt(a[7] || '0') - parseInt(b[7] || '0'))
      
      return selectionPool.slice(0, count)
    }
    
    // Select accounts according to M-F system requirements
    const selectedRelationship = selectWithRotation(relationshipAccounts, 4, 2) // 2 days minimum gap
    const selectedDiscovery = selectWithRotation(discoveryAccounts, 4, 1) // 1 day minimum gap
    const selectedCommunity = selectWithRotation(communityAccounts, 2, 1) // 1 day minimum gap
    
    return {
      relationship: selectedRelationship || [],
      discovery: selectedDiscovery || [],
      community: selectedCommunity || []
    }
    
  } catch (error) {
    console.error('Account selection failed:', error)
    throw error
  }
}

async function generateEngagementComment(accountData: any[], accountType: string) {
  const [accountName, handle, category, niche, followerCount] = accountData
  
  // SteeleBroz voice guidelines from the document
  const steeleBrozVoice = {
    grounded: true,
    reflective: true,
    real: true,
    parentAware: true,
    emotionallyIntelligent: true,
    disciplined: true,
    neverLoud: true,
    neverCorny: true,
    neverGeneric: true,
    neverSalesy: true,
    neverAttentionSeeking: true
  }
  
  // Generate comments based on niche and account type
  let comments = []
  
  switch (niche) {
    case 'Sports Media':
    case 'Baseball Organization':
      comments = [
        "The way you highlight the process behind the performance matters. Families need to see what goes into building these moments.",
        "This kind of content helps parents understand what their kids are actually working toward. Real perspective.",
        "You captured something here that resonates with anyone who's been in these environments. Authentic approach.",
        "The detail you show in this matters more than the highlight itself. It's the foundation that counts."
      ]
      break
      
    case 'Youth Athlete':
    case 'Baseball Creator':
      comments = [
        "The discipline in this approach shows. You can tell this wasn't just for the camera.",
        "This is the kind of moment that builds real confidence. The work when no one's watching.",
        "You can see the intention behind every movement here. That's what separates commitment from just showing up.",
        "The focus in this is evident. This kind of preparation is what creates lasting results."
      ]
      break
      
    case 'Sports Parent':
    case 'Sports Parenting':
      comments = [
        "This captures what so many sports families actually experience. Real, not idealized.",
        "The way you approach this resonates with parents who understand the bigger picture.",
        "This kind of perspective helps other families navigate these moments with more clarity.",
        "You're highlighting something important that parents need to hear. Grounded wisdom."
      ]
      break
      
    case 'Coaching':
    case 'Training':
      comments = [
        "The way you break this down makes it accessible without oversimplifying. Real coaching approach.",
        "This kind of instruction builds understanding, not just performance. That's what creates lasting growth.",
        "The fundamentals you emphasize here are what separate good coaching from great coaching.",
        "You can tell this comes from experience, not just theory. That depth shows."
      ]
      break
      
    case 'Sports Brand':
    case 'Baseball Product':
      comments = [
        "The functionality behind this shows. You can tell this was built by people who understand the game.",
        "This kind of attention to detail in design reflects real understanding of what athletes need.",
        "The practical application here is clear. Built for performance, not just appearance.",
        "You can see the thought process that went into this. Form following function."
      ]
      break
      
    default:
      comments = [
        "The authenticity in this approach shows. Real connection with what matters.",
        "This kind of content creates genuine value for people who understand the process.",
        "The way you present this feels grounded and intentional. That makes a difference.",
        "You captured something here that resonates with families who live this daily."
      ]
  }
  
  // Add backup comments
  const backupComments = [
    "The intentionality behind this is clear. That kind of focus creates real results.",
    "This reflects the kind of thinking that builds lasting success. Process-focused approach.",
    "The depth in this perspective comes through. Experience-based wisdom.",
    "You're highlighting what actually matters in these moments. Real insight."
  ]
  
  // Return random selection with backup
  const primaryComment = comments[Math.floor(Math.random() * comments.length)]
  const backupComment = backupComments[Math.floor(Math.random() * backupComments.length)]
  
  return {
    primary: primaryComment,
    backup: backupComment
  }
}

async function createMasterEngagementSheet(date: string, taskTitle: string, selectedAccounts: any) {
  try {
    const accessToken = await getGoogleAuthToken()
    
    // Format date for tab name
    const dateObj = new Date(date + 'T12:00:00')
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York'
    })
    const tabName = formattedDate // e.g., "Mar 12"
    
    // Check if master sheet exists
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(MASTER_ENGAGEMENT_SHEET_NAME)}' and '${THUMB_EQUITY_FOLDER_ID}' in parents&fields=files(id,name,webViewLink)`
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!searchResponse.ok) {
      throw new Error(`Failed to search for master sheet: ${searchResponse.statusText}`)
    }
    
    const searchData = await searchResponse.json()
    let masterSheetId
    let masterSheetUrl
    
    if (searchData.files && searchData.files.length > 0) {
      // Master sheet exists
      masterSheetId = searchData.files[0].id
      masterSheetUrl = searchData.files[0].webViewLink
    } else {
      // Create master sheet from template
      const copyUrl = `https://www.googleapis.com/drive/v3/files/${TEMPLATE_SHEET_ID}/copy`
      
      const copyResponse = await fetch(copyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: MASTER_ENGAGEMENT_SHEET_NAME,
          parents: [THUMB_EQUITY_FOLDER_ID]
        })
      })
      
      if (!copyResponse.ok) {
        throw new Error(`Failed to create master sheet: ${copyResponse.statusText}`)
      }
      
      const copyData = await copyResponse.json()
      masterSheetId = copyData.id
      
      // Get web view link
      const getUrl = `https://www.googleapis.com/drive/v3/files/${masterSheetId}?fields=webViewLink`
      const getResponse = await fetch(getUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (!getResponse.ok) {
        throw new Error(`Failed to get master sheet URL: ${getResponse.statusText}`)
      }
      
      const getData = await getResponse.json()
      masterSheetUrl = getData.webViewLink
    }
    
    // Check if today's tab already exists
    const sheetsApiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}`
    const sheetInfoResponse = await fetch(sheetsApiUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!sheetInfoResponse.ok) {
      throw new Error(`Failed to get sheet info: ${sheetInfoResponse.statusText}`)
    }
    
    const sheetInfo = await sheetInfoResponse.json()
    const existingSheets = sheetInfo.sheets || []
    const tabExists = existingSheets.some((sheet: any) => sheet.properties.title === tabName)
    
    if (!tabExists) {
      // Create new tab for today
      const addSheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}:batchUpdate`
      
      const addSheetResponse = await fetch(addSheetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  rowCount: 20,
                  columnCount: 12
                }
              }
            }
          }]
        })
      })
      
      if (!addSheetResponse.ok) {
        throw new Error(`Failed to create daily tab: ${addSheetResponse.statusText}`)
      }
      
      // Add headers to new tab
      const headers = [
        'Category', 'Account Name', 'Link', 'Comment', 'Handle', 
        'Follower Count', 'Content Type', 'Content Summary', 'Why Selected',
        'Backup Comment', 'Profiles To Visit', 'Notes'
      ]
      
      const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${encodeURIComponent(tabName)}!A1:L1`
      
      await fetch(headersUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [headers]
        })
      })
    }
    
    // Prepare engagement data
    const engagementData = []
    
    // Process all selected accounts
    const allAccounts = [
      ...selectedAccounts.relationship.map((acc: any) => ({ ...acc, category: 'Relationship' })),
      ...selectedAccounts.discovery.map((acc: any) => ({ ...acc, category: 'Discovery' })),
      ...selectedAccounts.community.map((acc: any) => ({ ...acc, category: 'Community' }))
    ]
    
    for (const accountArray of allAccounts) {
      const [accountName, handle, , niche, followerCount] = accountArray
      const category = accountArray.category
      
      // Generate comments
      const comments = await generateEngagementComment(accountArray, category)
      
      // Create Instagram link (direct to profile for now - would need browser automation for specific posts)
      const instagramLink = `https://instagram.com/${handle.replace('@', '')}`
      
      // Determine why selected based on category
      const whySelected = category === 'Relationship' ? 'Relationship building - repeated engagement' :
                         category === 'Discovery' ? 'Testing new audience potential' :
                         'Community engagement - high follow-back potential'
      
      engagementData.push([
        category,
        accountName,
        instagramLink,
        comments.primary,
        handle,
        followerCount,
        'Profile', // Content Type - would be determined by browser automation
        'Recent posts analysis pending', // Content Summary - would be filled by browser automation
        whySelected,
        comments.backup,
        '', // Profiles To Visit
        `Niche: ${niche}`
      ])
    }
    
    // Write engagement data to the daily tab
    const dataRange = `${encodeURIComponent(tabName)}!A2:L${engagementData.length + 1}`
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${dataRange}`
    
    const dataResponse = await fetch(dataUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: engagementData
      })
    })
    
    if (!dataResponse.ok) {
      throw new Error(`Failed to write engagement data: ${dataResponse.statusText}`)
    }
    
    // Update Master Engagement Tracker with today's selections
    await updateMasterTracker(selectedAccounts, date)
    
    console.log(`✅ Created daily tab "${tabName}" with ${engagementData.length} engagement opportunities`)
    return `${masterSheetUrl}#gid=0` // Return master sheet URL
    
  } catch (error) {
    console.error('Master engagement sheet creation failed:', error)
    throw error
  }
}

async function updateMasterTracker(selectedAccounts: any, date: string) {
  try {
    const accessToken = await getGoogleAuthToken()
    
    // Get current tracker data
    const trackerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/A2:L100`
    const response = await fetch(trackerUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tracker data: ${response.statusText}`)
    }
    
    const data = await response.json()
    const trackerData = data.values || []
    
    // Update engagement tracking for selected accounts
    const allSelectedAccounts = [
      ...selectedAccounts.relationship,
      ...selectedAccounts.discovery,
      ...selectedAccounts.community
    ]
    
    for (const selectedAccount of allSelectedAccounts) {
      const accountName = selectedAccount[0]
      
      // Find matching row in tracker
      const rowIndex = trackerData.findIndex((row: any[]) => row[0] === accountName)
      if (rowIndex >= 0) {
        // Update last engaged date and increment engagement count
        const currentCount = parseInt(trackerData[rowIndex][7] || '0')
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/G${rowIndex + 2}:H${rowIndex + 2}`
        
        await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [[date, (currentCount + 1).toString()]]
          })
        })
      }
    }
    
    console.log('✅ Master tracker updated successfully')
    
  } catch (error) {
    console.error('Master tracker update failed:', error)
    // Don't throw - this is supplementary tracking
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
    
    // Select accounts and create master engagement sheet FIRST - if this fails, stop entirely
    let sheetUrl: string
    try {
      const accessToken = await getGoogleAuthToken()
      const selectedAccounts = await selectAccountsFromPools(accessToken)
      sheetUrl = await createMasterEngagementSheet(date, taskTitle, selectedAccounts)
    } catch (sheetError) {
      console.error('Master engagement sheet creation failed, stopping task creation:', sheetError)
      return NextResponse.json({ 
        error: 'Failed to create master engagement sheet - task creation stopped',
        details: sheetError instanceof Error ? sheetError.message : 'Unknown error'
      }, { status: 500 })
    }
    
    // Create the task with Master Sheet link in description
    const taskDescription = `Daily Instagram Engagement - ${formattedDate} Tab: ${sheetUrl}`
    
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
      message: 'Instagram engagement task and master sheet tab created successfully',
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
