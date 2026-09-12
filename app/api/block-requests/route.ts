import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processBlockRequest } from '@/lib/block-processing'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const block_request_id = body?.block_request_id ?? body?.request_id

    if (block_request_id) {
      console.log('[block-requests] Processing block request:', block_request_id)
      const result = await processBlockRequest(block_request_id)
      console.log('[block-requests] Processing result:', result)
      return NextResponse.json(result)
    }

    const supabase = createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      console.log('[block-requests] Unauthorized:', authErr?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload: Record<string, any> = { ...body }
    delete payload.uuid
    delete payload.id
    delete payload.reqBy
    delete payload.block_request_id
    delete payload.request_id
    if (payload.requested_by === '') payload.requested_by = null
    payload.requested_by = user.id

    const { data, error } = await supabase
      .from('block_requests')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.log('[block-requests] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log('[block-requests] Created request:', data.id)
    return NextResponse.json({ success: true, block_request_id: data.id, data })
  } catch (err: any) {
    console.error('[block-requests] CRASHED:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}
