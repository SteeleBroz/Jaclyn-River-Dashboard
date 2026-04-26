import { NextResponse } from 'next/server'

// Weekend cards: generates fresh content each weekend
// All cards via OpenAI (gpt-4o with web search for sports)

const OPENAI_KEY = process.env.OPENAI_API_KEY

async function generateCard(prompt: string): Promise<{ phrase: string; full: string }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 400
    })
  })
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  // Parse JSON from response
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return { phrase: 'Reflection for today', full: text }
}

async function getSportsRecap(): Promise<string> {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-search-preview',
      messages: [
        { role: 'system', content: 'You are a sports expert. Be detailed and conversational. Today is ' + today },
        { role: 'user', content: 'Search the web and give me a detailed sports recap of the past week (NBA, NFL, MLB) through today. I need to be able to hold real conversations about what happened. Include key games, scores, standings, notable performances, trades, injuries, and storylines. Format it clearly by sport with headers. Be thorough — I want to be knowledgeable enough to talk sports with my husband and 4 boys.' }
      ],
      max_tokens: 1200
    })
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'Sports recap unavailable. Check ESPN for the latest.'
}

export async function GET() {
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    
    const [marriage, sons, healing, sports, gratitude] = await Promise.all([
      generateCard(`Today is ${today}. Generate a weekend marriage reflection for a woman who wants to intentionally lead with love toward her husband, even when she doesn't feel loved first. She tends to wait to be adored before she gives love, but wants to break this pattern. The book "Married for Life" inspires her — short passages about choosing love actively.

Return ONLY valid JSON in this exact format:
{"phrase": "A short powerful phrase (under 15 words) that she can carry with her today as a reminder to go to him first, choose love, or act with intention toward her husband", "full": "A 3-4 sentence full reflection expanding on the phrase. Warm, honest, non-judgmental. About choosing to love proactively, going to him, admiring him, even when it doesn't come naturally. Unique each time."}`),
      generateCard(`Today is ${today}. Generate a weekend reflection for a mom of boys, including a teenage son. She wants to meet her sons where they are and adapt to what they need — not pull them toward her out of her own need for love. She sometimes clings too much due to her own past of not feeling loved by her parents, and fears losing them as they grow. She wants to show up for them in the way THEY need.

Return ONLY valid JSON in this exact format:
{"phrase": "A short powerful phrase (under 15 words) she can hold today about being the mom her boys need — meeting them where they are, releasing the grip, staying present without fear", "full": "A 3-4 sentence full reflection. Warm, grounded, focused on adapting to her sons' needs not her own. About releasing the fear of losing them as they grow, being present in their world on their terms. Unique each time."}`),
      generateCard(`Today is ${today}. Generate a healing reflection or practice for a woman who sometimes doesn't feel good enough, sees limitations in herself, doesn't feel loved or appreciated, and feels like she's chasing happiness even though she has everything she dreamed of. She wants to heal at the root — love, worthiness, arriving in the present.

Return ONLY valid JSON in this exact format:
{"phrase": "A short evocative phrase (under 15 words) that names what she might try or feel today around self-healing — could be a somatic cue, a reframe, a permission slip, a truth", "full": "A 3-4 sentence description of a specific healing technique, practice, or reframe for this weekend. Could be somatic (body-based), cognitive (thought reframe), relational (self-compassion), or presence-based. Practical and actionable. Different every weekend."}`),
      getSportsRecap(),
      generateCard(`Today is ${today}. Generate a gratitude practice for someone who wants to train her mind toward gratitude as a daily discipline — not just listing 3 things, but building an actual neural habit of noticing abundance.

Return ONLY valid JSON in this exact format:
{"phrase": "A short phrase (under 15 words) that captures the essence or invitation of this weekend's gratitude practice", "full": "A 3-4 sentence description of one specific gratitude technique or exercise to try this weekend. Should be different each week — could be sensory gratitude, gratitude letters, the 'just like me' practice, savoring, mental subtraction, etc. Include how to actually do it."}`),
    ])

    return NextResponse.json({ marriage, sons, healing, sports, gratitude })
  } catch (err) {
    console.error('Weekend cards error:', err)
    return NextResponse.json({ error: 'Failed to generate weekend cards' }, { status: 500 })
  }
}
