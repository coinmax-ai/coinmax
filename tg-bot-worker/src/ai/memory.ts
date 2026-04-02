import type { Env } from "../types";
import { getDb } from "../db";
import { getEmbedding } from "./openai";

export async function searchKnowledge(env: Env, query: string, limit = 5): Promise<string[]> {
  const embedding = await getEmbedding(env, query);
  if (!embedding.length) return [];

  const db = getDb(env);
  const { data } = await db.rpc("match_bot_knowledge", {
    query_embedding: embedding,
    match_threshold: 0.55,
    match_count: limit,
  });

  return (data || []).map((d: any) => `[${d.category}] ${d.title}: ${d.content}`);
}

export async function addKnowledge(env: Env, category: string, title: string, content: string) {
  const embedding = await getEmbedding(env, `${title} ${content}`);
  const db = getDb(env);
  await db.from("bot_knowledge").insert({
    category,
    title,
    content,
    embedding,
  });
}
