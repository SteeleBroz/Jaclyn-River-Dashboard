import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { id, completed } = await request.json()

    if (typeof id !== 'number' || typeof completed !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request. Requires { id: number, completed: boolean }' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('thumb_equity_daily')
      .update({ completed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Toggle error:', error)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    console.error('Toggle API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
