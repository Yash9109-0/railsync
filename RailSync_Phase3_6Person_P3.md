# RailSync — PHASE 3 (6-PERSON SPLIT), YOUR FILE: Person 3 (Horizon API + Planning Tab UI)

## Your job
Wrap P2's algorithm in an API route, add the LLM summary explanation, and build the Planning tab on the AI Dashboard where officers generate and browse weekly/monthly plans.

---

## 🛑 STOP AND WAIT

Do not start until **P2** sends their 🚦 "Optimizer core is done!" message (P1's schema signal isn't enough for you — you specifically need P2's function to exist).

**While you wait**, you can still do Step 0 below since it doesn't depend on P2 yet.

---

## Step 0: Get the Latest Code (do this once P1 has signaled, even before P2 finishes)

```bash
cd railsync
git pull
git checkout -b feature/p3-horizon-ui
```
You can look around, but don't write code that calls `generateHorizonPlan` until P2 signals it's ready and merged (or at least pushed to their branch — ask P2 if you can pull their branch directly to get a head start: `git fetch origin` then `git merge origin/feature/p2-optimizer-core`).

---

## Step 1: The LLM Summary (once P2 signals)

**Kilo Code prompt:**
```
Add a new function generateHorizonSummary(horizonId: string): Promise<void> to lib/optimizer.ts (or a new file lib/horizon-summary.ts if you prefer to keep it separate) — fetch the block_plan_horizons row and its block_plan_horizon_items, joined with block_request work_description and department. Call OpenRouter (reuse the pattern from lib/llm.ts) with a summary of results — how many requests scheduled, how many deferred and why, the projected_availability_pct, and department breakdown (TMS/TDMS/SMMS) — asking for a 3-4 sentence plain-English summary suitable for a control officer reviewing the whole week/month at once. Save it to block_plan_horizons.summary_explanation.
```

---

## Step 2: API Route

**Kilo Code prompt:**
```
Create app/api/generate-horizon-plan/route.ts, a POST route receiving { horizonType, startDate } (startDate as an ISO date string). Call generateHorizonPlan from lib/optimizer.ts, then call generateHorizonSummary with the resulting horizonId, then return { horizonId }.
```

**Test it:**
```bash
npm run dev
```
```bash
curl.exe -X POST http://localhost:3000/api/generate-horizon-plan -H "Content-Type: application/json" -d "{\"horizonType\":\"weekly\",\"startDate\":\"2026-09-15\"}"
```
(Use `curl.exe` on Windows PowerShell, plain `curl` elsewhere, and a real near-future date.)

**Checkpoint ✅:** Returns `{ horizonId }`. Check Supabase — the horizon row now has a real `summary_explanation` sentence, not null.

---

## Step 3: Planning Tab on the AI Dashboard

**Kilo Code prompt:**
```
Add a new Tab "Weekly/Monthly Planning" to app/dashboard/ai/page.tsx (alongside the existing per-request view). Include: a date picker for start date, a toggle between "Weekly" and "Monthly", a "Generate Plan" button calling /api/generate-horizon-plan, then below it a list of past-generated horizons (fetch block_plan_horizons ordered by generated_at desc) — clicking one expands to show its summary_explanation, projected_availability_pct as a stat, and its block_plan_horizon_items grouped by assigned_date, each showing the linked block_request's work_description, priority_score, and status Badge (scheduled=blue, deferred=amber).
```

**Checkpoint ✅:** Generate a weekly plan from the UI, see it appear in the list, expand it, see requests grouped by date with a sensible schedule and a real explanation sentence.

---

## Step 4: Push and Signal

```bash
git add . && git commit -m "phase3: horizon API route, LLM summary, planning tab UI" && git push origin feature/p3-horizon-ui
```

**🚦 Signal your team:**
```
🚦 Planning tab is live! Weekly/monthly plans can be generated from the AI Dashboard. P5, block_plan_horizons and block_plan_horizon_items now have real data for your review UI.
```

---

## If You're Short on Time — Cut in This Order
1. Skip Step 1 (LLM summary) — a plain computed sentence ("X scheduled, Y deferred, Z% projected availability") built in the API route without an LLM call is a fine substitute
2. **Never cut:** the Planning tab itself — without it, P2's algorithm has no way to be triggered or viewed by anyone

---

## Sync Timeline (6-person)
| | P1 | P2 | You (P3) | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| First | Schema + 🚦 | Wait | Wait | Wait | Wait | Wait |
| Next | Defect register | Build the algorithm, 🚦 signal | Wait for P2's signal, then build API+UI | Goods forecast + calendar (independent) | Wait | Wait for P1 |
| Later | Standby | Standby | 🚦 Signal when planning tab works | Build freely | Build once you signal | Merge order matters |
