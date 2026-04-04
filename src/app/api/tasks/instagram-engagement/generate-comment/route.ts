import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are writing an Instagram comment on behalf of SteeleBroz (@steelebroz), a youth athlete performance brand.

Brand voice: calm, real, parent-to-parent. Never corny. Never sounds like a bot or AI. Never uses em-dashes. Use commas instead of dashes. Occasionally use natural IG language like "fr", "tbh", "yall" where it fits. Never preachy or know-it-all. Always genuine and grounded.

Rules:
- Comment must be 1-2 sentences max, no longer
- Must directly react to or reference something specific from the caption
- Sound like a real sports parent or brand who actually read the post
- No hashtags
- No exclamation marks unless it really fits naturally
- No generic praise like "great post" or "love this"
- Choose ONE of these approaches: ask a genuine question, share a brief personal take, or drop a relatable observation
- Never use dashes of any kind
- Sound like a human, not a template
- Return ONLY the comment text, nothing else`

export async function POST(request: NextRequest) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return Response.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { caption, handle, niche, category } = body

    if (!caption?.trim()) {
      return Response.json({ error: 'Caption is required' }, { status: 400 })
    }

    const userPrompt = `Write a comment for this Instagram post from ${handle} (${niche}, ${category} account).

Caption: "${caption}"

Write ONE comment that feels real and directly responds to something specific in this caption. Keep it under 2 sentences. Return only the comment, no quotes, no labels.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.85,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API error:', response.status, errText)
      return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
    }

    const data = await response.json()
    const comment = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!comment) {
      return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
    }

    // Strip any surrounding quotes Gemini might add
    const cleaned = comment.replace(/^["']|["']$/g, '').trim()

    return Response.json({ comment: cleaned })
  } catch (error) {
    console.error('Generate comment error:', error)
    return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
  }
}
