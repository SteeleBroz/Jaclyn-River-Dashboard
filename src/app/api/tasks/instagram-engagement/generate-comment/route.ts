import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are writing an Instagram comment on behalf of SteeleBroz (@steelebroz), a youth athlete performance brand.

Brand voice: calm, real, parent-to-parent. Never corny. Never sounds like a bot or AI. Never uses em-dashes (—). Use commas instead of dashes. Occasionally use natural IG language like "fr", "tbh", "yall" where it fits. Never preachy or know-it-all. Always genuine and grounded.

Rules:
- Comment must be 1-2 sentences max, no longer
- Must directly react to or reference something specific from the caption
- Sound like a real sports parent or brand who actually read the post
- No hashtags
- No exclamation marks unless it really fits
- No generic praise like "great post" or "love this"
- Choose ONE of these approaches: ask a genuine question, share a brief personal take, or drop a relatable observation
- Never use dashes of any kind
- Sound like a human, not a template`

export async function POST(request: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { caption, handle, niche, category, accountName } = body

    if (!caption?.trim()) {
      return Response.json({ error: 'Caption is required' }, { status: 400 })
    }

    const userPrompt = `Write a comment for this Instagram post from ${handle} (${niche}, ${category} account).

Caption: "${caption}"

Write ONE comment that feels real and directly responds to something in this caption. Keep it under 2 sentences.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    })

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text())
      return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
    }

    const data = await response.json()
    const comment = data.choices?.[0]?.message?.content?.trim()

    if (!comment) {
      return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
    }

    return Response.json({ comment })
  } catch (error) {
    console.error('Generate comment error:', error)
    return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
  }
}
