import { NextRequest, NextResponse } from 'next/server'

// Generates a single TTS audio file from all 5 weekend cards
// Uses OpenAI TTS with shimmer voice

export const maxDuration = 60 // Allow up to 60s for TTS generation

const OPENAI_KEY = process.env.OPENAI_API_KEY

export async function POST(req: NextRequest) {
  try {
    const { marriage, sons, healing, sports, gratitude } = await req.json()

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone: 'America/New_York'
    })

    // Truncate sports recap to keep total script under 4096 chars
    const sportsShort = (sports || 'No sports recap available this week.').slice(0, 800)

    // Build the full script read aloud
    const script = `
Good morning. Here are your weekend reflections for ${today}.

First — your marriage.
${marriage?.phrase ? marriage.phrase + '.' : 'Lead with love today.'}
${marriage?.full || ''}

Next — your boys.
${sons?.phrase ? sons.phrase + '.' : 'Meet them where they are.'}
${sons?.full || ''}

Now — something for you. Your healing practice this weekend.
${healing?.phrase ? healing.phrase + '.' : 'One step toward healing.'}
${healing?.full || ''}

Sports recap — so you're in the conversation.
${sportsShort}

And finally — your gratitude practice.
${gratitude?.phrase ? gratitude.phrase + '.' : 'Practice gratitude today.'}
${gratitude?.full || ''}

That's your weekend. You've got this.
`.trim().slice(0, 4000)

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'shimmer',
        input: script,
        response_format: 'mp3'
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI TTS error:', err)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
    }

    const audioBuffer = await res.arrayBuffer()

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-store'
      }
    })
  } catch (err) {
    console.error('Weekend audio error:', err)
    return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 })
  }
}
