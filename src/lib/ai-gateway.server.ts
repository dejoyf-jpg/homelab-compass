// Server-only helpers for calling Lovable AI Gateway (OpenAI-compatible).
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatCompletion(opts: {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 8192,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in Workspace → Plans & credits.");
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error("AI response was truncated. Shorten your description or try again.");
  }
  return choice?.message?.content ?? "";
}

