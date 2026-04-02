import type { Env } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

export async function chat(
  env: Env,
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts?.model || "gpt-4o",
      messages,
      max_tokens: opts?.maxTokens || 1500,
      temperature: opts?.temperature ?? 0.3,
    }),
  });
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || "无法生成回复";
}

export async function getEmbedding(env: Env, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const data: any = await res.json();
  return data.data?.[0]?.embedding || [];
}

export async function analyzeImage(env: Env, imageUrl: string, prompt: string): Promise<string> {
  return chat(env, [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ], { model: "gpt-4o", maxTokens: 1000 });
}
