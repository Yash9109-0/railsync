export async function analyzeUrgency(workDescription: string, justification: string) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: "You are a railway safety AI. Read the maintenance work description and justification. You must return ONLY a raw JSON object with absolutely no markdown formatting, backticks, or extra text. Format exactly like this: {\"text_urgency_score\": 75, \"reasoning\": \"one short sentence explaining why\"}"
          },
          {
            role: "user",
            content: `Work Description: ${workDescription}\nJustification: ${justification}`
          }
        ]
      })
    });

const data = await response.json();

if (!response.ok || !data.choices) {
  console.error("OpenRouter error response:", JSON.stringify(data));
  throw new Error("OpenRouter did not return choices");
}

let content = data.choices[0].message.content.trim();
    if (content.startsWith("```json")) {
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const parsed = JSON.parse(content);

    return {
      text_urgency_score: typeof parsed.text_urgency_score === 'number' ? parsed.text_urgency_score : 50,
      reasoning: parsed.reasoning || "Analyzed successfully."
    };

  } catch (error) {
    console.error("LLM Urgency Parsing failed:", error);
    return {
      text_urgency_score: 50,
      reasoning: "Could not analyze text"
    };
  }
}