import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'openrouter/auto'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    let body: { id?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { id } = body
    if (!id) {
      return NextResponse.json({ error: 'block_request id is required' }, { status: 400 })
    }

    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select(
        'segment_id, work_type, requested_start, requested_duration_mins, safety_criticality, priority_score'
      )
      .eq('id', id)
      .single()

    if (fetchError || !blockRequest) {
      return NextResponse.json(
        { error: fetchError?.message ?? 'block_request not found' },
        { status: 404 }
      )
    }

    if (blockRequest.priority_score === null) {
      return NextResponse.json(
        { error: 'block_request has not been scored yet' },
        { status: 422 }
      )
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const prompt = [
      'You are an assistant that explains railway scheduling rankings to non-technical stakeholders.',
      `A block request was evaluated with these characteristics: work type "${blockRequest.work_type}", safety criticality "${blockRequest.safety_criticality}", requested duration of ${blockRequest.requested_duration_mins} minutes, on segment ${blockRequest.segment_id}, starting at ${blockRequest.requested_start}.`,
      `The model assigned this request a priority score of ${blockRequest.priority_score} out of 100.`,
      'Write exactly two sentences in plain, conversational English explaining why this request received this ranking. Avoid jargon, avoid listing the raw features, and do not mention that you are an AI.',
    ].join('\n\n')

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://railsync.dev',
        'X-Title': 'RailSync',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
        temperature: 0.7,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        { error: `OpenRouter API error: ${response.status} ${detail}` },
        { status: 502 }
      )
    }

    const result: {
      choices?: Array<{ message?: { content?: string } }>
    } = await response.json()

    const explanation = result?.choices?.[0]?.message?.content?.trim()

    if (!explanation) {
      return NextResponse.json(
        { error: 'OpenRouter returned no explanation' },
        { status: 502 }
      )
    }

    const { error: updateError } = await supabase
      .from('block_requests')
      .update({ ai_explanation: explanation })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ id, ai_explanation: explanation })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
