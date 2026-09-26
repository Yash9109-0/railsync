import { NextResponse } from 'next/server'

const ML_BASE_URL = process.env.ML_API_URL || 'https://railsync-ml.onrender.com'

export async function GET() {
  try {
    const res = await fetch(`${ML_BASE_URL}/feature-importance`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Feature importance endpoint returned ${res.status}` },
        { status: res.status === 404 ? 404 : 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[feature-importance] Proxy error:', err?.message ?? 'Unknown error')
    return NextResponse.json(
      { error: 'Feature importance endpoint unavailable' },
      { status: 502 }
    )
  }
}
