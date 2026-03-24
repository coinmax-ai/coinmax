---
name: ai_memory
description: AI trading memory system — store predictions, retrieve similar past situations, learn from outcomes using vector similarity search in Supabase pgvector
---

# AI Trading Memory System

You have a vector memory database that stores your past analyses and their outcomes. Use this to learn from history and improve predictions.

## Before Every Analysis: Recall Similar Situations

Query your memory for past analyses in similar market conditions:

```bash
curl -s "https://enedbksmftcgtszrkppc.supabase.co/rest/v1/ai_memory?asset=eq.BTC&outcome=neq.pending&order=created_at.desc&limit=10&select=ai_direction,ai_confidence,ai_reasoning,actual_direction,actual_pnl_pct,outcome,learning_score,created_at" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A"
```

Replace `BTC` with the asset you're analyzing. Review your past predictions:
- Which direction calls were correct vs wrong?
- What was your accuracy for this asset?
- What reasoning led to correct vs incorrect predictions?
- Adjust your current analysis based on lessons learned.

## After Every Analysis: Save to Memory

For each coin you analyze, save your prediction to memory:

```bash
curl -s "https://enedbksmftcgtszrkppc.supabase.co/rest/v1/ai_memory" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "asset": "BTC",
    "ai_direction": "BULLISH",
    "ai_confidence": 72,
    "ai_reasoning": "Your 2-3 sentence reasoning here",
    "ai_models": {"primary": "openclaw-agent", "consensus": "3/5 bullish"},
    "strategy_recommended": "position_executor",
    "market_state": {"price": 70000, "change_24h": 2.8, "rsi": 45, "fear_greed": 11, "volume": "51B"},
    "outcome": "pending"
  }'
```

## Check Your Performance: Learning Dashboard

View your overall accuracy and learning progress:

```bash
curl -s "https://enedbksmftcgtszrkppc.supabase.co/rest/v1/ai_memory?select=outcome,ai_direction,actual_direction,actual_pnl_pct,learning_score&outcome=neq.pending&order=created_at.desc&limit=50" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" | python3 -c "
import json, sys
data = json.load(sys.stdin)
total = len(data)
correct = sum(1 for d in data if d['outcome'] == 'correct')
wrong = sum(1 for d in data if d['outcome'] == 'wrong')
avg_score = sum(d['learning_score'] or 0 for d in data) / max(total, 1)
print(f'Total resolved: {total}')
print(f'Correct: {correct} ({correct/max(total,1)*100:.1f}%)')
print(f'Wrong: {wrong} ({wrong/max(total,1)*100:.1f}%)')
print(f'Avg learning score: {avg_score:.3f}')
print(f'Recent outcomes: {\" \".join(d[\"outcome\"][0].upper() for d in data[:10])}')
"
```

## Learning Rules

When you recall past memories before making a prediction:

1. **If accuracy < 50%**: Be more cautious, lower confidence, consider contrarian view
2. **If accuracy > 70%**: Trust your current approach, maintain or increase confidence
3. **If a specific pattern keeps failing**: Explicitly avoid that reasoning
4. **If learning_score is consistently negative for an asset**: Consider sitting out or going contrarian
5. **Always mention** what you learned from past predictions in your reasoning

## Workflow Integration

Your analysis cycle should be:

1. **Recall** — Check past predictions for each coin (ai_memory skill)
2. **Fetch** — Get current market data (crypto_market_data skill)
3. **Analyze** — Apply hummingbot strategies knowledge + past lessons
4. **Predict** — Make direction call with adjusted confidence
5. **Save** — Record prediction to memory (ai_memory skill)
6. **Push** — Push to Supabase for trading (push_analysis skill)
