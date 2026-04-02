import { NextRequest, NextResponse } from 'next/server'

async function getGoogleAuthToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google API environment variables')
  }
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  
  const data = await response.json()
  return data.access_token
}

const MASTER_TRACKER_SHEET_ID = '1Rt8ckpGPGu1esmL1_HIHIHkWZypXUSOl5dhAbTab2mY'

export async function POST(request: NextRequest) {
  try {
    const { action, accounts } = await request.json()
    const accessToken = await getGoogleAuthToken()
    
    if (action === 'read') {
      // Read current tracker data
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/Tracker!A1:L100`
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } })
      const data = await res.json()
      return NextResponse.json({ rows: data.values || [] })
    }
    
    if (action === 'replace') {
      // Replace entire tracker with new data
      // accounts = array of arrays (each row)
      const allRows = [
        ['Account Name', 'Handle', 'Category', 'Niche', 'Follower Count', 'Date Added', 'Last Engaged Date', 'Engagement Count', 'Engagement Type', 'Response/Outcome', 'Status', 'Notes'],
        ...accounts
      ]
      
      // Clear existing data
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/Tracker!A1:L100:clear`
      await fetch(clearUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      })
      
      // Write new data
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_TRACKER_SHEET_ID}/values/Tracker!A1:L${allRows.length}?valueInputOption=USER_ENTERED`
      const writeRes = await fetch(writeUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: allRows })
      })
      
      const writeData = await writeRes.json()
      return NextResponse.json({ success: true, updatedRows: allRows.length - 1, details: writeData })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
