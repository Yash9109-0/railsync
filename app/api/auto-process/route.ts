import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Jin bhi requests ka score nahi hai, un sabko utha lo
  const { data: blocks, error } = await supabase
    .from('block_requests')
    .select('id, status, priority_score')
    .is('priority_score', null)
    .limit(20)

  if (error || !blocks?.length) {
    return NextResponse.json({ message: 'No pending blocks found without score', error: error?.message })
  }

  const results = []
  for (const b of blocks) {
    const res = await fetch('http://localhost:3000/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id })
    })
    const data = await res.json()
    results.push({ id: b.id, result: data })
  }

  return NextResponse.json({ success: true, processed: results })
}