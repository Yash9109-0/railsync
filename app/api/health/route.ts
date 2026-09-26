import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ML_API_URL = process.env.ML_API_URL || 'https://railsync-ml.onrender.com'

async function checkMlApi(): Promise<{ status: 'operational' | 'degraded' | 'unreachable'; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${ML_API_URL}/health`, { 
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    const latency = Date.now() - start
    if (res.ok) {
      return { status: 'operational', latencyMs: latency }
    }
    return { status: 'degraded', latencyMs: latency, error: `HTTP ${res.status}` }
  } catch (e: any) {
    return { status: 'unreachable', latencyMs: Date.now() - start, error: e?.message || 'Network error' }
  }
}

async function checkDatabase(): Promise<{ status: 'operational' | 'degraded' | 'unreachable'; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    const latency = Date.now() - start
    if (error) {
      return { status: 'degraded', latencyMs: latency, error: error.message }
    }
    return { status: 'operational', latencyMs: latency }
  } catch (e: any) {
    return { status: 'unreachable', latencyMs: Date.now() - start, error: e?.message || 'Network error' }
  }
}

async function checkCpSatSolver(): Promise<{ status: 'operational' | 'degraded' | 'unreachable'; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${ML_API_URL}/solve-horizon`, { 
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horizon_hours: 1, trains: [], blocks: [] }),
    })
    clearTimeout(timeout)
    const latency = Date.now() - start
    if (res.ok) {
      return { status: 'operational', latencyMs: latency }
    }
    if (res.status === 400) {
      return { status: 'operational', latencyMs: latency }
    }
    return { status: 'degraded', latencyMs: latency, error: `HTTP ${res.status}` }
  } catch (e: any) {
    return { status: 'unreachable', latencyMs: Date.now() - start, error: e?.message || 'Network error' }
  }
}

function overallStatus(checks: Record<string, { status: string }>): 'operational' | 'degraded' | 'unreachable' {
  const statuses = Object.values(checks).map(c => c.status)
  if (statuses.some(s => s === 'unreachable')) return 'unreachable'
  if (statuses.some(s => s === 'degraded')) return 'degraded'
  return 'operational'
}

export async function GET() {
  const [mlApi, database, cpSat] = await Promise.all([
    checkMlApi(),
    checkDatabase(),
    checkCpSatSolver(),
  ])

  const checks = {
    mlApi,
    database,
    cpSat,
  }

  const overall = overallStatus(checks)
  const now = new Date().toISOString()

  return NextResponse.json({
    overall,
    lastChecked: now,
    checks: {
      'ML Scoring API': { ...mlApi, lastChecked: now },
      Database: { ...database, lastChecked: now },
      'CP-SAT Solver': { ...cpSat, lastChecked: now },
    },
  })
}