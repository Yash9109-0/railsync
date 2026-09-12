import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const id = process.argv[2] ?? '865c593a-b23c-44d3-863b-18874d90902a'

const { data: req, error: e1 } = await sb.from('block_requests').select('*').eq('id', id).single()
const { data: opts, error: e2 } = await sb.from('block_plan_options').select('*').eq('block_request_id', id)

console.log('REQUEST ERROR:', e1?.message)
console.log('REQUEST:', JSON.stringify(req, null, 2))
console.log('OPTIONS ERROR:', e2?.message)
console.log('OPTIONS COUNT:', opts?.length)
console.log('OPTIONS:', JSON.stringify(opts, null, 2))
