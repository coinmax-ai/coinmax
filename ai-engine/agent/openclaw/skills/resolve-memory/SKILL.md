---
name: resolve_memory
description: Resolve pending AI predictions by comparing with actual price movements, updating learning scores
---

# Resolve AI Memory

Check pending predictions and resolve them against actual outcomes.

## Step 1: Get Pending Predictions (older than 4 hours)

```bash
curl -s "https://enedbksmftcgtszrkppc.supabase.co/rest/v1/ai_memory?outcome=eq.pending&created_at=lt.$(date -u -v-4H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '4 hours ago' +%Y-%m-%dT%H:%M:%SZ)&select=id,asset,ai_direction,ai_confidence,market_state,created_at&order=created_at.asc&limit=20" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A"
```

## Step 2: Get Current Prices

Use the `crypto_market_data` skill to get current prices.

## Step 3: Compare and Resolve Each

For each pending prediction:
1. Compare the predicted direction with actual price movement since prediction time
2. Calculate actual PnL %
3. Update the record:

```bash
curl -s "https://enedbksmftcgtszrkppc.supabase.co/rest/v1/ai_memory?id=eq.PREDICTION_ID" \
  -X PATCH \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "actual_direction": "BULLISH",
    "actual_pnl_pct": 2.5,
    "outcome": "correct",
    "learning_score": 0.5,
    "outcome_reasoning": "Predicted bullish at $70k, price moved to $71.75k (+2.5%) in 4h"
  }'
```

Replace:
- `PREDICTION_ID` with the actual prediction UUID
- `actual_direction`: BULLISH if price went up, BEARISH if down
- `actual_pnl_pct`: percentage change since prediction
- `outcome`: "correct" if direction matched, "wrong" if not
- `learning_score`: positive (0 to 1) if correct, negative (-1 to 0) if wrong, scaled by PnL magnitude

After resolving, print a summary of how many were correct vs wrong.
