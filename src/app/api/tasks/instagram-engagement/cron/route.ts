import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Optional CRON_SECRET check
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get today's date in ET timezone
    const now = new Date()
    const etDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD

    // Check if it's a weekday
    const dateObj = new Date(etDate + 'T12:00:00')
    const dayOfWeek = dateObj.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ message: 'Skipped — weekend', date: etDate })
    }

    // Call the existing POST endpoint logic internally
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'

    const response = await fetch(`${baseUrl}/api/tasks/instagram-engagement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: etDate }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: 'POST route failed', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json({
      message: 'Cron executed successfully',
      date: etDate,
      result: data,
    })
  } catch (error) {
    console.error('Cron handler error:', error)
    return NextResponse.json(
      { error: 'Cron execution failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
