import { NextRequest, NextResponse } from 'next/server'
import { generateHorizonPlan, generateHorizonSummary } from '@/lib/optimizer'

type GenerateHorizonRequestBody = {
  horizonType?: unknown
  startDate?: unknown
}

export async function POST(request: NextRequest) {
  try {
    let body: GenerateHorizonRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const horizonType = body?.horizonType
    const startDate = body?.startDate

    if (horizonType !== 'weekly' && horizonType !== 'monthly') {
      return NextResponse.json(
        { error: 'horizonType must be "weekly" or "monthly"' },
        { status: 400 },
      )
    }

    if (!startDate || typeof startDate !== 'string') {
      return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
    }

    const start = new Date(startDate)
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
    }

    const { horizonId } = await generateHorizonPlan(horizonType, start)
    await generateHorizonSummary(horizonId)

    return NextResponse.json({ horizonId })
  } catch (error: any) {
    console.error('[api/generate-horizon-plan] error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred' },
      { status: error?.status || 500 },
    )
  }
}
