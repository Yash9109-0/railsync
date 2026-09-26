import { NextRequest, NextResponse } from 'next/server'
import { createNotificationsForUsers, getControlOfficers } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { block_request_id, segment_name, work_type } = body

    if (!block_request_id) {
      return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    }

    const controlOfficers = await getControlOfficers()
    if (controlOfficers.length === 0) {
      return NextResponse.json({ success: true, message: 'No control officers to notify' })
    }

    await createNotificationsForUsers(
      controlOfficers,
      'Field Work Completed - Verification Required',
      `Block request ${block_request_id.slice(0, 8)} (${work_type}) on ${segment_name ?? 'segment'} has been completed by field crew and requires verification.`,
      `/dashboard/control?verify=${block_request_id}`
    )

    return NextResponse.json({ success: true, notified: controlOfficers.length })
  } catch (error: any) {
    console.error('[api/notify-completion] error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred' },
      { status: error?.status || 500 },
    )
  }
}