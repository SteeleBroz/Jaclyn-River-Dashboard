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
    
    // Weighted scoring for smarter rotation
    const scoreAndSelect = (pool: any[], count: number) => {
      if (!Array.isArray(pool) || pool.length === 0) return []

      // Find max engagement count in pool for inverse scoring
      const maxEngagement = Math.max(...pool.map(a => parseInt(a[7] || '0')), 1)

      // Score each account
      const scored = pool.map(account => {
        const lastEngaged = account[6]
        let daysSinceEngaged = 30 // default for never-engaged accounts
        if (lastEngaged) {
          daysSinceEngaged = Math.max(0, Math.floor((Date.now() - new Date(lastEngaged).getTime()) / (1000 * 60 * 60 * 24)))
        }
        const engagementCount = parseInt(account[7] || '0')
        const score = (daysSinceEngaged * 2) + (maxEngagement - engagementCount)
        return { account, score, daysSinceEngaged }
      })

      // Sort by score descending (higher = more deserving of engagement)
      scored.sort((a, b) => b.score - a.score)

      // Take top 2N candidates, then randomly select N from them
      const candidateCount = Math.min(count * 2, scored.length)
      const candidates = scored.slice(0, candidateCount)

      // Fisher-Yates shuffle on candidates, then take first N
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
      }

      return candidates.slice(0, count).map(c => c.account)
    }

    // Force-include Relationship accounts not engaged in 4+ days
    const forceIncludeRelationship = relationshipAccounts.filter((account: any[]) => {
      const lastEngaged = account[6]
      if (!lastEngaged) return true // never engaged = force include
      const daysSince = Math.floor((Date.now() - new Date(lastEngaged).getTime()) / (1000 * 60 * 60 * 24))
      return daysSince >= 4
    })

    // Select Relationship: force-include overdue ones, fill remaining slots with scoring
    let selectedRelationship: any[] = []
    const forceCount = Math.min(forceIncludeRelationship.length, 4)
    const forcedAccounts = forceIncludeRelationship.slice(0, forceCount)
    selectedRelationship = [...forcedAccounts]

    if (selectedRelationship.length < 4) {
      const remainingPool = relationshipAccounts.filter(
        (a: any[]) => !selectedRelationship.some((s: any[]) => s[0] === a[0])
      )
      const additional = scoreAndSelect(remainingPool, 4 - selectedRelationship.length)
      selectedRelationship = [...selectedRelationship, ...additional]
    }

    const selectedDiscovery = scoreAndSelect(discoveryAccounts, 4)
    const selectedCommunity = scoreAndSelect(communityAccounts, 2)
    
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

// Comment pools by niche — each has questions, personal takes, and tag prompts
const COMMENT_POOLS: Record<string, { questions: string[]; personalTakes: string[]; tagPrompts: string[] }> = {
  'Sports Media': {
    questions: [
      "How early are you seeing kids start to really lock in on one position?",
      "What's been the most surprising trend you've noticed in youth baseball this year?",
      "Curious — do you think travel ball helps or hurts long-term development?",
      "At what age do you think the mental game starts mattering more than the physical?",
      "What would you tell a parent who's trying to figure out the right level for their kid?",
    ],
    personalTakes: [
      "We've seen this firsthand — the kids who stay process-focused end up going further than the ones chasing highlights",
      "This is the kind of content that actually helps families make better decisions for their athletes",
      "The behind-the-scenes of youth sports is where all the real growth happens — not the showcase clips",
      "We talk about this a lot at home — it's not about being the best at 12, it's about still loving it at 18",
    ],
    tagPrompts: [
      "Every sports parent needs to see this one",
      "This is the kind of perspective coaches should be sharing with their families",
    ],
  },
  'Baseball Organization': {
    questions: [
      "How early are you seeing kids start to really lock in on one position?",
      "What's been the most surprising trend you've noticed in youth baseball this year?",
      "Curious — do you think travel ball helps or hurts long-term development?",
      "At what age do you think the mental game starts mattering more than the physical?",
      "What would you tell a parent who's trying to figure out the right level for their kid?",
    ],
    personalTakes: [
      "We've seen this firsthand — the kids who stay process-focused end up going further than the ones chasing highlights",
      "This is the kind of content that actually helps families make better decisions for their athletes",
      "The behind-the-scenes of youth sports is where all the real growth happens — not the showcase clips",
      "We talk about this a lot at home — it's not about being the best at 12, it's about still loving it at 18",
    ],
    tagPrompts: [
      "Every sports parent needs to see this one",
      "This is the kind of perspective coaches should be sharing with their families",
    ],
  },
  'Youth Athlete': {
    questions: [
      "What does your pre-game routine look like? The mental side or just physical warmup?",
      "How long did it take to get that consistent? The reps behind this are real",
      "Do you work on this with a coach or is this self-taught? Either way it's impressive",
      "What's the one thing you'd tell someone just starting to take their training seriously?",
    ],
    personalTakes: [
      "You can tell this wasn't just for the camera — the focus is genuine",
      "This is what people don't see — the quiet work that builds real confidence",
      "The intention behind every rep here is what makes the difference",
      "This kind of discipline at your age is rare. Keep building",
    ],
    tagPrompts: [
      "Any young athletes need to see what consistent work actually looks like",
    ],
  },
  'Baseball Creator': {
    questions: [
      "What does your pre-game routine look like? The mental side or just physical warmup?",
      "How long did it take to get that consistent? The reps behind this are real",
      "Do you work on this with a coach or is this self-taught? Either way it's impressive",
      "What's the one thing you'd tell someone just starting to take their training seriously?",
    ],
    personalTakes: [
      "You can tell this wasn't just for the camera — the focus is genuine",
      "This is what people don't see — the quiet work that builds real confidence",
      "The intention behind every rep here is what makes the difference",
      "This kind of discipline at your age is rare. Keep building",
    ],
    tagPrompts: [
      "Any young athletes need to see what consistent work actually looks like",
    ],
  },
  'Sports Parent': {
    questions: [
      "How do you balance supporting their goals without putting too much pressure on?",
      "What's been the hardest part of the sports parent journey for your family?",
      "Do your kids ever push back on the schedule or are they all-in?",
      "How did you know when it was time to take it to the next level?",
    ],
    personalTakes: [
      "This is the stuff that matters more than any tournament trophy",
      "We went through something similar — the journey teaches you as much as it teaches them",
      "The families that get this right are the ones who keep perspective on what really matters",
      "These moments go fast — glad you're capturing them",
    ],
    tagPrompts: [
      "Every sports family needs this reminder right now",
    ],
  },
  'Sports Parenting': {
    questions: [
      "How do you balance supporting their goals without putting too much pressure on?",
      "What's been the hardest part of the sports parent journey for your family?",
      "Do your kids ever push back on the schedule or are they all-in?",
      "How did you know when it was time to take it to the next level?",
    ],
    personalTakes: [
      "This is the stuff that matters more than any tournament trophy",
      "We went through something similar — the journey teaches you as much as it teaches them",
      "The families that get this right are the ones who keep perspective on what really matters",
      "These moments go fast — glad you're capturing them",
    ],
    tagPrompts: [
      "Every sports family needs this reminder right now",
    ],
  },
  'Coaching': {
    questions: [
      "At what age do you start introducing this concept? Or does it depend on the kid?",
      "How do you adjust this for different skill levels within the same group?",
      "What's the biggest mistake you see parents making when it comes to training at home?",
      "Do you find athletes retain this better through repetition or game situations?",
    ],
    personalTakes: [
      "This is the kind of coaching that builds athletes, not just players",
      "You can tell this comes from years of actually working with kids, not just theory",
      "The way you break this down makes it actionable for any family watching",
      "Fundamentals like this are what separate good development from chasing highlights",
    ],
    tagPrompts: [
      "Parents looking for the right kind of coaching — this is what it looks like",
    ],
  },
  'Training': {
    questions: [
      "At what age do you start introducing this concept? Or does it depend on the kid?",
      "How do you adjust this for different skill levels within the same group?",
      "What's the biggest mistake you see parents making when it comes to training at home?",
      "Do you find athletes retain this better through repetition or game situations?",
    ],
    personalTakes: [
      "This is the kind of coaching that builds athletes, not just players",
      "You can tell this comes from years of actually working with kids, not just theory",
      "The way you break this down makes it actionable for any family watching",
      "Fundamentals like this are what separate good development from chasing highlights",
    ],
    tagPrompts: [
      "Parents looking for the right kind of coaching — this is what it looks like",
    ],
  },
  'Sports Brand': {
    questions: [
      "What was the design process like for this? Did you get input from athletes?",
      "How does this hold up for kids who are training 4-5 days a week?",
      "What age group are you seeing the most demand from?",
    ],
    personalTakes: [
      "You can tell this was designed by people who actually understand what athletes need",
      "The attention to detail here shows — form meeting function",
      "We appreciate brands that build for performance, not just aesthetics",
    ],
    tagPrompts: [
      "Any athlete families looking for quality gear should check this out",
    ],
  },
  'Baseball Product': {
    questions: [
      "What was the design process like for this? Did you get input from athletes?",
      "How does this hold up for kids who are training 4-5 days a week?",
      "What age group are you seeing the most demand from?",
    ],
    personalTakes: [
      "You can tell this was designed by people who actually understand what athletes need",
      "The attention to detail here shows — form meeting function",
      "We appreciate brands that build for performance, not just aesthetics",
    ],
    tagPrompts: [
      "Any athlete families looking for quality gear should check this out",
    ],
  },
  'Local League': {
    questions: [
      "What age groups are playing this weekend? We love seeing the local scene",
      "How has the league been growing? Feels like more families are getting involved",
      "Any standout moments from the season so far?",
    ],
    personalTakes: [
      "This is what it's all about — community, competition, and kids having fun",
      "Love seeing the local youth sports scene thriving",
      "These grassroots programs are the foundation everything else is built on",
    ],
    tagPrompts: [
      "Local families need to know about this program",
    ],
  },
  'Community': {
    questions: [
      "What age groups are playing this weekend? We love seeing the local scene",
      "How has the league been growing? Feels like more families are getting involved",
      "Any standout moments from the season so far?",
    ],
    personalTakes: [
      "This is what it's all about — community, competition, and kids having fun",
      "Love seeing the local youth sports scene thriving",
      "These grassroots programs are the foundation everything else is built on",
    ],
    tagPrompts: [
      "Local families need to know about this program",
    ],
  },
}

const DEFAULT_COMMENT_POOL = {
  questions: [
    "What inspired this? Would love to hear the story behind it",
    "How has the response been from your community?",
    "What's next for you guys? Seems like momentum is building",
  ],
  personalTakes: [
    "The authenticity here stands out — you can tell this is genuine",
    "This kind of content creates real value for the people who need it",
    "There's a depth here that resonates with families who live this daily",
  ],
  tagPrompts: [
    "This deserves more attention from the community",
  ],
}

// Category-aware backup comment pools
const BACKUP_COMMENTS: Record<string, string[]> = {
  Relationship: [
    "We've been following your journey and it keeps getting better",
    "Always appreciate the perspective you bring to this space",
    "This is why we keep coming back to your content — it's real",
    "The consistency you show is something our family really respects",
  ],
  Discovery: [
    "Just came across this and had to stop scrolling — great stuff",
    "This popped up in our feed and it's exactly the kind of content we look for",
    "New to your page but this is a strong first impression",
    "The quality here is obvious — looking forward to seeing more",
  ],
  Community: [
    "Love seeing the local community rally around this",
    "This is the kind of grassroots energy that makes youth sports special",
    "Supporting programs like this is what it's all about",
  ],
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function generateEngagementComment(accountData: any[], accountType: string) {
  const [accountName, handle, , niche] = accountData

  // Get the comment pool for this niche, or use default
  const pool = COMMENT_POOLS[niche || ''] || DEFAULT_COMMENT_POOL

  // Randomly select comment type: question, personal take, or tag prompt
  const typeRoll = Math.random()
  let primaryComment: string
  if (typeRoll < 0.45) {
    primaryComment = pickRandom(pool.questions)
  } else if (typeRoll < 0.85) {
    primaryComment = pickRandom(pool.personalTakes)
  } else {
    primaryComment = pickRandom(pool.tagPrompts)
  }

  // Warm up Relationship comments — reference "we" and shared experiences
  if (accountType === 'Relationship' && Math.random() < 0.3) {
    const warmPrefixes = [
      "We see this a lot — ",
      "This resonates with us — ",
      "Our family relates to this — ",
    ]
    if (typeRoll >= 0.45 && typeRoll < 0.85) {
      // Only prepend to personal takes to keep questions clean
      primaryComment = pickRandom(warmPrefixes) + primaryComment.charAt(0).toLowerCase() + primaryComment.slice(1)
    }
  }

  // Category-aware backup
  const backupPool = BACKUP_COMMENTS[accountType] || BACKUP_COMMENTS['Discovery']
  const backupComment = pickRandom(backupPool)

  return {
    primary: primaryComment,
    backup: backupComment,
  }
}

async function createMasterEngagementSheet(date: string, taskTitle: string, selectedAccounts: any): Promise<{ sheetUrl: string; accountRows: any[] }> {
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
      
      const headerRange = `${tabName}!A1:L1`
      const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${encodeURIComponent(headerRange)}?valueInputOption=USER_ENTERED`
      
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
    const engagementData: string[][] = []
    const accountRows: any[] = [] // Structured data for Supabase

    // Process all selected accounts
    const relationshipAccounts = Array.isArray(selectedAccounts.relationship) ? selectedAccounts.relationship : []
    const discoveryAccounts = Array.isArray(selectedAccounts.discovery) ? selectedAccounts.discovery : []
    const communityAccounts = Array.isArray(selectedAccounts.community) ? selectedAccounts.community : []

    const allAccounts = [
      ...relationshipAccounts.map((acc: any) => ({ account: acc, category: 'Relationship' })),
      ...discoveryAccounts.map((acc: any) => ({ account: acc, category: 'Discovery' })),
      ...communityAccounts.map((acc: any) => ({ account: acc, category: 'Community' }))
    ]

    let sortOrder = 0
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

      // Set is_story_tap based on category:
      // Relationship = always true, Discovery = 30% chance, Community = false
      const isStoryTap = category === 'Relationship'
        ? true
        : category === 'Discovery'
          ? Math.random() < 0.3
          : false

      accountRows.push({
        date,
        account_name: accountName || '',
        handle: handle || '',
        category,
        niche: niche || null,
        follower_count: followerCount || null,
        instagram_link: instagramLink,
        primary_comment: comments.primary || '',
        backup_comment: comments.backup || null,
        why_selected: whySelected || null,
        content_summary: 'Recent posts analysis pending',
        is_story_tap: isStoryTap,
        completed: false,
        sort_order: sortOrder++,
      })
    }
    
    // Write engagement data to the daily tab
    if (engagementData.length === 0) {
      throw new Error('No engagement data to write')
    }
    
    const dataRange = `${tabName}!A2:L${engagementData.length + 1}`
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${encodeURIComponent(dataRange)}?valueInputOption=USER_ENTERED`
    
    console.log(`Writing ${engagementData.length} rows to range: ${dataRange}`)
    
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
      const errorText = await dataResponse.text()
      console.error('Google Sheets API Error:', errorText)
      throw new Error(`Failed to write engagement data: ${dataResponse.statusText} - ${errorText}`)
    }
    
    // Update Master Engagement Tracker with today's selections
    await updateMasterTracker(selectedAccounts, date)
    
    console.log(`✅ Created daily tab "${tabName}" with ${engagementData.length} engagement opportunities`)
    return { sheetUrl: `${masterSheetUrl}#gid=0`, accountRows }
    
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
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/G${rowIndex + 2}:H${rowIndex + 2}?valueInputOption=USER_ENTERED`
        
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
    let accountRows: any[] = []
    try {
      const accessToken = await getGoogleAuthToken()
      const selectedAccounts = await selectAccountsFromPools(accessToken)
      const result = await createMasterEngagementSheet(date, taskTitle, selectedAccounts)
      sheetUrl = result.sheetUrl
      accountRows = result.accountRows
    } catch (sheetError) {
      console.error('Master engagement sheet creation failed, stopping task creation:', sheetError)
      return NextResponse.json({
        error: 'Failed to create master engagement sheet - task creation stopped',
        details: sheetError instanceof Error ? sheetError.message : 'Unknown error'
      }, { status: 500 })
    }

    // Write engagement data to thumb_equity_daily Supabase table
    if (accountRows.length > 0) {
      const { error: teError } = await supabase
        .from('thumb_equity_daily')
        .insert(accountRows)
      if (teError) {
        console.error('Failed to insert thumb_equity_daily rows:', teError)
        // Non-blocking — Google Sheets is the primary store
      } else {
        console.log(`✅ Inserted ${accountRows.length} rows into thumb_equity_daily`)
      }
    }
    
    // Create the task with Master Sheet link in description
    const taskDescription = `Tap to open Thumb Equity tab`
    
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
