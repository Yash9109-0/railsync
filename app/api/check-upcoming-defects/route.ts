import { NextResponse } from 'next/server'
import { checkAndNotifyUpcomingDefects } from '@/lib/notifications'

export async function POST() {
  try {
    await checkAndNotifyUpcomingDefects()
    return NextResponse.json({ success: true, message: 'Defect notifications checked' })
  } catch (error: any) {
    console.error('[api/check-defects] error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred' },
      { status: error?.status || 500 },
    )
  }
}