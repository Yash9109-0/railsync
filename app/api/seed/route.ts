import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('block_requests')
    .insert({
      work_type: 'Track',
      safety_criticality: 'urgent',
      requested_start: new Date().toISOString(),
      requested_duration_mins: 90,
      work_description: 'Critical rail fracture detected near junction B-4 requiring immediate welding.',
      justification: 'High-speed passenger line affected; risk of derailment if left unaddressed.',
      status: 'submitted'
    })
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Test record created!', data })
}