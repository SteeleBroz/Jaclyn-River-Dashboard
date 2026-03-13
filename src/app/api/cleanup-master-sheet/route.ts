import { NextRequest, NextResponse } from 'next/server'

const MASTER_SHEET_ID = '1wiMC0DjAfeTKFaBTuK0wdE-OUDBVPttkGzSwsjpYXso' // From successful test

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

export async function POST(request: NextRequest) {
  try {
    const accessToken = await getGoogleAuthToken()
    
    // Get all sheets/tabs
    const sheetsApiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}`
    const sheetInfoResponse = await fetch(sheetsApiUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!sheetInfoResponse.ok) {
      throw new Error(`Failed to get sheet info: ${sheetInfoResponse.statusText}`)
    }
    
    const sheetInfo = await sheetInfoResponse.json()
    const existingSheets = sheetInfo.sheets || []
    
    console.log('Current tabs:', existingSheets.map((sheet: any) => sheet.properties.title))
    
    // Find tabs to delete (Mar 31 onwards test tabs)
    const tabsToDelete = existingSheets.filter((sheet: any) => {
      const title = sheet.properties.title
      return title.includes('Mar') || title.includes('Apr') || title.includes('May')
    })
    
    if (tabsToDelete.length === 0) {
      return NextResponse.json({ message: 'No test tabs to delete', tabsFound: existingSheets.map((s: any) => s.properties.title) })
    }
    
    console.log('Deleting tabs:', tabsToDelete.map((sheet: any) => sheet.properties.title))
    
    // Create batch delete requests
    const deleteRequests = tabsToDelete.map((sheet: any) => ({
      deleteSheet: {
        sheetId: sheet.properties.sheetId
      }
    }))
    
    // Execute batch delete
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}:batchUpdate`
    const deleteResponse = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: deleteRequests
      })
    })
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      console.error('Delete failed:', errorText)
      throw new Error(`Failed to delete tabs: ${deleteResponse.statusText}`)
    }
    
    return NextResponse.json({ 
      message: `Successfully deleted ${tabsToDelete.length} test tabs`,
      deletedTabs: tabsToDelete.map((s: any) => s.properties.title),
      remainingTabs: existingSheets.filter((s: any) => !tabsToDelete.includes(s)).map((s: any) => s.properties.title)
    })
    
  } catch (error) {
    console.error('Cleanup failed:', error)
    return NextResponse.json({ 
      error: 'Cleanup failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}