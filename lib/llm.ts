const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type UrgencyResult = {
  text_urgency_score: number
  reasoning: string
}

async function openRouterChat(
  system: string,
  user: string,
  model: string = "openrouter/auto"
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://railsync.dev",
      "X-Title": "RailSync",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ] as ChatMessage[],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${detail}`)
  }

  const data: {
    choices?: Array<{ message?: { content?: string } }>
  } = await res.json()

  return (data?.choices?.[0]?.message?.content ?? "").trim()
}

export async function analyzeUrgency(
  workDescription: string,
  justification: string
): Promise<UrgencyResult> {
  try {
    const content = await openRouterChat(
      'You are a railway safety AI. Read the maintenance work description and justification. You must return ONLY a raw JSON object with absolutely no markdown formatting, backticks, or extra text. Format exactly like this: {"text_urgency_score": 75, "reasoning": "one short sentence explaining why"}',
      `Work Description: ${workDescription}\nJustification: ${justification}`,
      "google/gemini-2.5-flash"
    )

    let parsed = content
    if (parsed.startsWith("```json")) {
      parsed = parsed.replace(/```json/g, "").replace(/```/g, "").trim()
    }

    const obj = JSON.parse(parsed)

    return {
      text_urgency_score:
        typeof obj.text_urgency_score === "number"
          ? obj.text_urgency_score
          : 50,
      reasoning: obj.reasoning || "Analyzed successfully.",
    }
  } catch (error) {
    console.error("LLM Urgency Parsing failed:", error)
    return {
      text_urgency_score: 50,
      reasoning: "Could not analyze text",
    }
  }
}

export async function explainPlanOption(
  workDescription: string,
  justification: string,
  optionLabel: string,
  priorityScore: number | null,
  delayRisk: string | null
): Promise<string> {
  try {
    return await openRouterChat(
      "You are an assistant that explains railway scheduling decisions to non-technical stakeholders.",
      `Work Description: ${workDescription}\nJustification: ${justification}\n\nFor the plan option "${optionLabel}", the model assigned a priority_score of ${priorityScore ?? "n/a"}/100 and a delay_risk of "${delayRisk ?? "unknown"}". Write exactly two sentences in plain, conversational English explaining this ranking and referencing the work described. Do not mention that you are an AI.`
    )
  } catch (error) {
    console.error("explainPlanOption failed:", error)
    return `Option "${optionLabel}" received a priority_score of ${priorityScore ?? "n/a"} with delay risk ${delayRisk ?? "unknown"}.`
  }
}

export async function explainWhatIf(
  workDescription: string,
  justification: string,
  optionLabel: string,
  priorityScore: number | null,
  delayRisk: string | null,
  extendedDurationMins: number
): Promise<string> {
  try {
    return await openRouterChat(
      "You are a railway scheduling AI.",
      `Work Description: ${workDescription}\nJustification: ${justification}\n\nThe plan option "${optionLabel}" currently has a priority_score of ${priorityScore ?? "n/a"}/100 and a delay_risk of "${delayRisk ?? "unknown"}". Write exactly one sentence describing what would happen if its duration were extended by 30 minutes (to ${extendedDurationMins} minutes total), e.g. how the delay risk would change. Be concrete about the expected change.`
    )
  } catch (error) {
    console.error("explainWhatIf failed:", error)
    return "Extending this option by 30 minutes would likely raise the delay risk."
  }
}
