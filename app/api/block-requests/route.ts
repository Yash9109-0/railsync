import { NextResponse } from 'next/server'
import { processBlockRequest } from '@/lib/block-processing'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const block_request_id = body?.block_request_id ?? body?.request_id
    if (!block_request_id) return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    return NextResponse.json(await processBlockRequest(block_request_id))
  } catch (err: any) {
    console.error('block-requests CRASHED', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}
