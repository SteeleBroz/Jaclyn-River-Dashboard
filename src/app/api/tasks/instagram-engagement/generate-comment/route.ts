import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are Jaclyn from SteeleBroz (@steelebroz), a real sports mom who also runs a youth athlete brand. You are NOT a brand account doing marketing. You are a parent in the comments who lives this life, has seen it all, and keeps it 100.

Think Wendy's on Twitter but for the youth sports parent world. Dry. Real. Occasionally funny. Never trying too hard. You can be blunt. You can laugh at the chaos of sports parenting. You can call something out with one line. You never sound like a press release.

Voice:
- Sports parent who has been through it, not easily impressed but genuinely in it
- Dry humor when it fits, like a locker room text to another parent
- Short and punchy, not a paragraph
- Natural IG slang when it fits: lol, fr, no cap, lowkey, ngl, tbh, lmao, bro, oof, yall, same
- Real unfiltered reactions like: "wait this is us every single weekend", "lol yep called it", "okay but why does this hit different", "ngl this almost made me cry", "bro the gas money alone", "this is the part nobody talks about", "okay we felt this one", "lol we survived somehow"
- Occasionally a little sarcastic in a loving way, like texting your best friend about sports parent life
- No dashes of any kind, use commas or just end the sentence
- No hashtags
- No brand-speak, no "we at SteeleBroz", no mission statements, no "as a brand"
- Do NOT compliment the post itself, react to the actual content or situation described
- 1 sentence, 2 max if it really earns it
- Do not start with "I" as the first word
- Return ONLY the comment, no quotes, no labels, nothing else`

export async function POST(request: NextRequest) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return Response.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { caption, imageBase64, imageMimeType, handle, niche, category } = body

    // Require either caption text or an image
    if (!caption?.trim() && !imageBase64) {
      return Response.json({ error: 'Caption or image is required' }, { status: 400 })
    }

    const userPrompt = `Write a comment for this Instagram post from ${handle} (${niche}, ${category} account).

Caption: "${caption}"

Write ONE raw, real comment that reacts to something specific in this caption. Think sports parent texting another parent, not a brand commenting. Keep it to 1 sentence, 2 max. Return only the comment.`

    const contents = imageBase64 ? [
      {
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: imageMimeType || 'image/jpeg',
              data: imageBase64,
            }
          },
          {
            text: `This is a screenshot of an Instagram post from ${handle} (${niche}, ${category} account). Look at everything in this image: the caption text, the visual content, the type of post (photo/reel/carousel). Write ONE comment that feels real and directly reacts to what you see. Think sports parent texting another parent, not a brand commenting. Keep it to 1 sentence, 2 max. Return only the comment.`
          }
        ]
      }
    ] : [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      }
    ]

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.95,
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

    // Strip surrounding quotes, ensure comment ends on a complete sentence
    let cleaned = comment.replace(/^["']|["']$/g, '').trim()
    if (!/[.!?,]$/.test(cleaned)) {
      const lastPunct = Math.max(
        cleaned.lastIndexOf('.'),
        cleaned.lastIndexOf('!'),
        cleaned.lastIndexOf('?'),
        cleaned.lastIndexOf(',')
      )
      if (lastPunct > cleaned.length / 2) {
        cleaned = cleaned.substring(0, lastPunct + 1).trim()
      }
    }

    return Response.json({ comment: cleaned })
  } catch (error) {
    console.error('Generate comment error:', error)
    return Response.json({ error: 'Failed to generate comment' }, { status: 500 })
  }
}
