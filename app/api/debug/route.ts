import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN = 'admin-test@railsync.dev'
const MAINT = 'maint-test@railsync.dev'
const PASS = 'Testpass123!'

export async function POST(request: Request) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const results: Record<string, any> = {}

  for (const [role, email] of [
    ['admin', ADMIN],
    ['maintenance', MAINT],
  ] as const) {
    let { data: user, error: signErr } = await sb.auth.signInWithPassword({ email, password: PASS })
    if (signErr || !user?.user) {
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email,
        password: PASS,
        email_confirm: true,
      })
      results[email] = { created: !!created?.user, createErr: createErr?.message, signErr: signErr?.message }
      user = { user: created?.user } as any
    } else {
      results[email] = { existed: true }
    }
    const uid = user?.user?.id
    if (uid) {
      await sb.from('profiles').upsert({ id: uid, role, full_name: role })
      results[email].id = uid
    }
  }

  return NextResponse.json(results)
}
