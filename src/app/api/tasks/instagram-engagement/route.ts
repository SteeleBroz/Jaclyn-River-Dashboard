import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { google } from 'googleapis'
import path from 'path'
import fs from 'fs'

// Google API setup - using environment variables
const TEMPLATE_SHEET_ID = '1D74x4m2wkDIjmk7ELnfZmXE-v3iDdmOmkDRD1IljIYI'
const THUMB_EQUITY_FOLDER_ID = '1MHM1ezP6N1IoHezz2Lr0hDezZleW3PXH'
const ACCOUNT_POOLS_SHEET_ID = '1kkm06dyke9DbJK45MpWot_2Cahx-gBq94MfYoNCpgz8'
const MASTER_TRACKER_SHEET_ID = '1Rt8ckpGPGu1esmL1_HIHIHkWZypXUSOl5dhAbTab2mY'
const MASTER_ENGAGEMENT_SHEET_NAME = 'SteeleBroz Daily Engagement Master'

async function getGoogleAuth() {
  try {
    const CREDENTIALS_PATH = path.join(process.cwd(), 'google-tokens.json')
    
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error('Google tokens file not found')
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))
    
    const auth = new google.auth.OAuth2()
    auth.setCredentials(credentials)
    
    return auth
  } catch (error) {
    console.error('Google auth setup error:', error)
    throw error
  }
}

async function selectAccountsFromPools() {
  try {
    const auth = await getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    
    // Get current date for tracking
    const today = new Date().toISOString().split('T')[0]
    
    // Get accounts from Master Tracker to check last engaged dates
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_TRACKER_SHEET_ID,
      range: 'A2:L100'
    })
    
    const accounts = Array.isArray(response.data.values) ? response.data.values : []
    
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
    const auth = await getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const drive = google.drive({ version: 'v3', auth })
    
    // Format date for tab name
    const dateObj = new Date(date + 'T12:00:00')
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York'
    })
    const tabName = formattedDate // e.g., "Mar 12"
    
    // Check if master sheet exists
    const searchResponse = await drive.files.list({
      q: `name='${MASTER_ENGAGEMENT_SHEET_NAME}' and '${THUMB_EQUITY_FOLDER_ID}' in parents`,
      fields: 'files(id,name,webViewLink)'
    })
    
    let masterSheetId
    let masterSheetUrl
    
    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      // Master sheet exists
      masterSheetId = searchResponse.data.files[0].id
      masterSheetUrl = searchResponse.data.files[0].webViewLink
    } else {
      // Create master sheet from template
      const copyResponse = await drive.files.copy({
        fileId: TEMPLATE_SHEET_ID,
        requestBody: {
          name: MASTER_ENGAGEMENT_SHEET_NAME,
          parents: [THUMB_EQUITY_FOLDER_ID]
        }
      })
      
      masterSheetId = copyResponse.data.id
      
      // Get web view link
      const getResponse = await drive.files.get({
        fileId: masterSheetId,
        fields: 'webViewLink'
      })
      
      masterSheetUrl = getResponse.data.webViewLink
    }
    
    // Check if today's tab already exists
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: masterSheetId
    })
    
    const existingSheets = sheetInfo.data.sheets || []
    const tabExists = existingSheets.some((sheet: any) => sheet.properties.title === tabName)
    
    if (!tabExists) {
      // Create new tab for today
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSheetId,
        requestBody: {
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
        }
      })
      
      // Add headers to new tab
      const headers = [
        'Category', 'Account Name', 'Link', 'Comment', 'Handle', 
        'Follower Count', 'Content Type', 'Content Summary', 'Why Selected',
        'Backup Comment', 'Profiles To Visit', 'Notes'
      ]
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: masterSheetId,
        range: `${tabName}!A1:L1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      })
    }
    
    // Prepare engagement data
    const engagementData = []
    
    // Process all selected accounts
    const relationshipAccounts = Array.isArray(selectedAccounts.relationship) ? selectedAccounts.relationship : []
    const discoveryAccounts = Array.isArray(selectedAccounts.discovery) ? selectedAccounts.discovery : []
    const communityAccounts = Array.isArray(selectedAccounts.community) ? selectedAccounts.community : []
    
    const allAccounts = [
      ...relationshipAccounts.map((acc: any) => ({ account: acc, category: 'Relationship' })),
      ...discoveryAccounts.map((acc: any) => ({ account: acc, category: 'Discovery' })),
      ...communityAccounts.map((acc: any) => ({ account: acc, category: 'Community' }))
    ]
    
    for (const accountData of allAccounts) {
      const accountArray = accountData.account
      if (!Array.isArray(accountArray) || accountArray.length < 5) {
        console.warn('Invalid account data:', accountArray)
        continue
      }
      
      const [accountName, handle, , niche, followerCount] = accountArray
      const category = accountData.category
      
      // Generate comments
      const comments = await generateEngagementComment(accountArray, category)
      
      // Create Instagram link (direct to profile for now - would need browser automation for specific posts)
      const cleanHandle = (handle || '').replace('@', '')
      const instagramLink = `https://instagram.com/${cleanHandle}`
      
      // Determine why selected based on category
      const whySelected = category === 'Relationship' ? 'Relationship building - repeated engagement' :
                         category === 'Discovery' ? 'Testing new audience potential' :
                         'Community engagement - high follow-back potential'
      
      engagementData.push([
        category || '',
        accountName || '',
        instagramLink || '',
        comments.primary || '',
        handle || '',
        followerCount || '',
        'Profile', // Content Type - would be determined by browser automation
        'Recent posts analysis pending', // Content Summary - would be filled by browser automation
        whySelected || '',
        comments.backup || '',
        '', // Profiles To Visit
        `Niche: ${niche || ''}`
      ])
    }
    
    // Write engagement data to the daily tab
    if (engagementData.length === 0) {
      throw new Error('No engagement data to write')
    }
    
    const dataRange = `${tabName}!A2:L${engagementData.length + 1}`
    
    console.log(`Writing ${engagementData.length} rows to range: ${dataRange}`)
    
    // ISOLATED TEST SEQUENCE
    try {
      // Test A1 only
      console.log('🧪 A1 TEST START')
      const a1Params = {
        spreadsheetId: masterSheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['test']]
        }
      }
      console.log('🧪 A1 Method:', 'sheets.spreadsheets.values.update')
      console.log('🧪 A1 Params:', JSON.stringify(a1Params, null, 2))
      
      await sheets.spreadsheets.values.update(a1Params)
      console.log('✅ A1 TEST PASSED')
      
      // Test headers
      console.log('🧪 HEADERS TEST START')
      const headersParams = {
        spreadsheetId: masterSheetId,
        range: `${tabName}!A1:L1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Category', 'Account Name', 'Link', 'Comment', 'Handle', 'Follower Count', 'Content Type', 'Content Summary', 'Why Selected', 'Backup Comment', 'Profiles To Visit', 'Notes']]
        }
      }
      console.log('🧪 HEADERS Method:', 'sheets.spreadsheets.values.update')
      console.log('🧪 HEADERS Params:', JSON.stringify(headersParams, null, 2))
      
      await sheets.spreadsheets.values.update(headersParams)
      console.log('✅ HEADERS TEST PASSED')
      
      // Test one engagement row
      console.log('🧪 ONE ROW TEST START')
      const oneRowParams = {
        spreadsheetId: masterSheetId,
        range: `${tabName}!A2:L2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [engagementData[0] || ['test', 'test', 'test', 'test', 'test', 'test', 'test', 'test', 'test', 'test', 'test', 'test']]
        }
      }
      console.log('🧪 ONE ROW Method:', 'sheets.spreadsheets.values.update')
      console.log('🧪 ONE ROW Params:', JSON.stringify(oneRowParams, null, 2))
      
      await sheets.spreadsheets.values.update(oneRowParams)
      console.log('✅ ONE ROW TEST PASSED')
      
      // Test full batch
      console.log('🧪 FULL BATCH TEST START')
      
    } catch (testError: any) {
      console.error('🚨 TEST FAILED:', JSON.stringify(testError, null, 2))
      throw new Error(`Test failed: ${testError.message || 'Unknown test error'}`)
    }
    
    try {
      const updateParams = {
        spreadsheetId: masterSheetId,
        range: dataRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: engagementData
        }
      }
      
      console.log('🔍 RUNTIME DEBUG - Method:', 'sheets.spreadsheets.values.update')
      console.log('🔍 RUNTIME DEBUG - Params:', JSON.stringify(updateParams, null, 2))
      
      const updateResult = await sheets.spreadsheets.values.update(updateParams)
      console.log('Update successful:', updateResult.status)
    } catch (updateError: any) {
      console.error('Google Sheets Update Error:', JSON.stringify(updateError, null, 2))
      throw new Error(`Failed to write engagement data: ${updateError.message || 'Unknown error'}`)
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
    const auth = await getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    
    // Get current tracker data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_TRACKER_SHEET_ID,
      range: 'A2:L100'
    })
    
    const trackerData = response.data.values || []
    
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
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: MASTER_TRACKER_SHEET_ID,
          range: `G${rowIndex + 2}:H${rowIndex + 2}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[date, (currentCount + 1).toString()]]
          }
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
      const selectedAccounts = await selectAccountsFromPools()
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
