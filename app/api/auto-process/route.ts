import { NextResponse } from 'next/server'
import { processBlockRequest } from '@/lib/block-processing'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const block_request_id = body?.block_request_id ?? body?.request_id
    if (!block_request_id) {
      return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    }
    const result = await processBlockRequest(block_request_id)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('AUTO-PROCESS CRASHED', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
