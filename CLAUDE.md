# CoinMax AI Trading Platform

## Project Structure
- `src/` - React frontend (Vite + TypeScript + Tailwind)
- `src/admin/` - Admin dashboard (separate route at /admin)
- `src/provider/` - Strategy provider portal (separate route at /provider)
- `ai-engine/` - AI trading engine modules (TypeScript + Python)
- `supabase/` - Edge functions + migrations
- `contracts/` - Smart contracts (Hardhat + Solidity)

## Tech Stack
- Frontend: React 18, Vite, TailwindCSS, wouter, @tanstack/react-query
- Backend: Supabase (PostgreSQL, Edge Functions, Realtime)
- Wallet: thirdweb SDK (BSC chain)
- AI: OpenAI GPT-4o + Cloudflare Workers AI models
- i18n: react-i18next (12 languages)

## Key Commands
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npx tsc --noEmit` - Type check

## Conventions
- Chinese UI labels (this is a Chinese-language product)
- camelCase in frontend, snake_case in database
- Admin pages follow pattern in src/admin/pages/
- Edge functions use Deno runtime with serve() pattern
