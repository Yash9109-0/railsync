# RailSync — Real OR-Tools CP-SAT Solver (Solo Build)

## What this replaces
Your greedy-plus-local-search optimizer becomes the **fallback**, not the primary engine. The new primary engine is Google OR-Tools' CP-SAT constraint solver — it finds a provably optimal (or near-optimal within a time limit) schedule instead of a heuristic best-effort one. This is a real, defensible upgrade to your strongest technical weak point.

**Architecture decision:** this lives in your existing `railsync-ml` Python service (the one already hosting your priority model on Render), not a new third service. Same deployment, same URL, one less thing to break.

---

## Step 1: Install OR-Tools

In your `railsync-ml` folder:
```bash
pip install ortools
```
Add to `requirements.txt`:
```
ortools
```

**Checkpoint:** `pip show ortools` confirms it installed without errors.

---

## Step 2: Build the Solver Function

**Kilo Code prompt (point it at your `railsync-ml` folder):**
```
Create solver.py in this project with a function solve_horizon(requests, segment_capacity_mins, horizon_total_mins) using Google OR-Tools CP-SAT.

Input: requests is a list of dicts, each with: id (string), segment_id (int), duration_mins (int), priority_score (float 0-100), preferred_start_mins (int, the request's originally-requested start time as minutes offset from horizon start), avoids_peak_start_mins (a set or list of minute-offsets that are considered "off-peak" for this request's segment, can be empty if not available). segment_capacity_mins is a dict mapping segment_id to its capacity in minutes for this horizon. horizon_total_mins is the total horizon length in minutes.

Model:
1. For each request, create an optional interval variable: a boolean "presence" var, an integer "start" var (domain 0 to horizon_total_mins - duration_mins), and the interval itself (start, duration_mins, start+duration_mins), only "present" in the schedule if presence is true.
2. Group intervals by segment_id. For each segment, add a NoOverlap constraint among that segment's intervals (CP-SAT automatically ignores intervals where presence is false).
3. For each segment, add a capacity constraint: the sum of (duration_mins * presence) across all requests on that segment must not exceed segment_capacity_mins for that segment.
4. Objective: maximize the sum of (priority_score * presence) across all requests — this is the main term. Add a small secondary term: for each request, if its chosen start falls within its own avoids_peak_start_mins list, add a small bonus (weight much lower than priority_score, e.g. 0.1 per request) to softly prefer off-peak placement without overriding priority-based scheduling.
5. Set solver.parameters.max_time_in_seconds = 10 and solve.
6. Return a list of dicts, one per input request: {id, scheduled: bool (presence value), start_mins: int or null if not scheduled, duration_mins}.

Handle the case where the solver doesn't find an optimal solution within the time limit by still returning the best solution found (CP-SAT supports this — check solver status is OPTIMAL or FEASIBLE, not just OPTIMAL).
```

**Checkpoint:** File exists, imports without errors (`python -c "from solver import solve_horizon"`).

---

## Step 3: Test the Solver in Isolation

**Kilo Code prompt:**
```
Create a temporary test script test_solver.py: build 6 fake requests on 2 segments (3 each) with varying priority_score and duration_mins, some overlapping preferred_start_mins on the same segment to force a real scheduling decision, a segment_capacity_mins dict giving each segment less total capacity than the sum of all its requests' durations (to force at least one to be unscheduled), horizon_total_mins of 10080 (one week). Call solve_horizon with this data and print the results clearly, including which requests were NOT scheduled.
```

Run it:
```bash
python test_solver.py
```

**Checkpoint:** Output shows some requests scheduled, at least one NOT scheduled (proving the capacity constraint works), and no two scheduled requests on the same segment have overlapping start/end times (proving NoOverlap works). Check this by hand for the printed results — this is the core correctness check for the whole feature.

Delete `test_solver.py` once confirmed.

---

## Step 4: Wire It Into the FastAPI Service

**Kilo Code prompt:**
```
Add a new endpoint to main.py: POST /solve-horizon, accepting a JSON body matching solve_horizon's input shape (requests list, segment_capacity_mins dict, horizon_total_mins). Call solve_horizon from solver.py and return its result as JSON. Wrap in try-except, returning a 500 with a clear error message on failure rather than crashing silently.
```

Redeploy:
```bash
git add .
git commit -m "add OR-Tools CP-SAT solver endpoint"
git push
```
Render auto-redeploys. Test the live endpoint the same way as Step 3, but via curl against your Render URL, to confirm it works in production, not just locally (OR-Tools sometimes has platform-specific build quirks — catching this now beats discovering it during a demo):

```bash
curl.exe -X POST https://YOUR-RENDER-URL.onrender.com/solve-horizon -H "Content-Type: application/json" -d "@test_payload.json"
```
(Build a small `test_payload.json` matching the same shape as Step 3's test data.)

**Checkpoint:** Live endpoint returns the same kind of correct result as your local test.

---

## Step 5: Replace the Optimizer's Default Engine (Keep Greedy as Fallback)

This is the integration point in your main `railsync` repo.

**Kilo Code prompt:**
```
In lib/optimizer.ts, rename the existing greedy allocation logic (everything from the greedy loop through the local search pass) into a new function generateHorizonPlanGreedy(horizonType, startDate, corridorId) — same signature and behavior as before, just renamed, kept fully intact as a fallback.

Create a new primary function generateHorizonPlan(horizonType, startDate, corridorId) that:
1. Fetches the same pending block_requests, segment_stats, and goods_train_forecast data as the greedy version did.
2. Builds the payload for the CP-SAT solver: for each request, its id, segment_id, requested_duration_mins, priority_score, preferred_start_mins (computed as minutes between horizon start and the request's requested_start), and avoids_peak_start_mins (a list of minute-offsets within the horizon that fall outside any goods_train_forecast peak window for that segment — compute this from the forecast data, can be an empty list if forecast data is sparse). Also build segment_capacity_mins from segment_stats.capacity_pct (or default 20%) times the horizon's total minutes, per segment.
3. Calls process.env.ML_API_URL + '/solve-horizon' with this payload, wrapped in try-catch with a reasonable timeout (15 seconds).
4. If the call succeeds: create the block_plan_horizons row (same as before, but set a new column solver_used = 'cp-sat', add this column via SQL first: alter table block_plan_horizons add column if not exists solver_used text default 'greedy';), then insert block_plan_horizon_items from the solver's results — scheduled requests get status='scheduled' with their assigned start (computed back from start_mins to an actual date/hour) and duration, unscheduled ones get status='deferred' with reason "Could not fit within segment capacity during solver optimization."
5. If the call fails for ANY reason (network error, timeout, non-200 response, malformed response): log the error clearly with console.error("CP-SAT solver failed, falling back to greedy:", the error), then call generateHorizonPlanGreedy with the same arguments instead, and set solver_used = 'greedy' on the resulting horizon row so it's always clear which engine actually produced a given plan.
6. Continue calling generateHorizonSummary as before regardless of which engine ran, but pass the engine name into the summary prompt so the explanation text can mention it.
```

**Checkpoint:** Generate a horizon plan through the normal AI Dashboard flow — check Supabase that `solver_used` is `'cp-sat'` for a successful run. Then deliberately break it (temporarily set `ML_API_URL` to a wrong value in `.env.local`) and generate again — confirm it falls back to greedy gracefully, `solver_used` shows `'greedy'`, and the plan still generates successfully rather than failing outright. **Restore the correct `ML_API_URL` afterward.**

---

## Step 6: Surface Which Engine Ran (Worth Showing Judges)

**Kilo Code prompt:**
```
On components/HorizonPlanningCalendar.tsx (or wherever generated horizon plans are displayed), add a small Badge showing solver_used per horizon: "Optimal (CP-SAT)" in purple if 'cp-sat', "Heuristic (fallback)" in gray if 'greedy'. This makes the upgrade visible and demonstrable, not just an internal implementation detail.
```

---

## Step 7: Update Your Documentation

Go back to `docs/OPTIMIZATION_APPROACH.md` (built earlier) and update it:
- Change the "what we built" section to state you now run a real CP-SAT constraint solver as the primary scheduling engine, with the greedy-plus-local-search approach retained as an automatic fallback for resilience
- Note the objective function explicitly: maximize total priority-weighted scheduled work, subject to no-overlap and per-segment capacity constraints, with a soft preference for goods-traffic off-peak placement
- Keep the honest caveat about the 10-second solve time limit — for very large request volumes, CP-SAT returns the best solution found within that window, not a guaranteed global optimum, though for a single-corridor demo scale this is a non-issue

---

## Step 8: Push and Full Test

```bash
git add .
git commit -m "OR-Tools CP-SAT solver as default horizon optimizer, greedy retained as fallback"
git push
```

**Full test on the live Vercel URL:**
1. Submit 6-8 test requests on one segment with varying priority and overlapping preferred times
2. Generate a weekly plan — confirm the "Optimal (CP-SAT)" badge appears
3. Verify in Supabase that scheduled items on that segment genuinely don't overlap, and total scheduled minutes respects the segment's capacity
4. Confirm at least one lower-priority request was correctly deferred in favor of higher-priority ones
5. Approve the plan through Control Dashboard exactly as before — confirm nothing downstream (approval, field execution, defect resolution) needed any changes, since the solver only replaced how items get assigned, not the data shape they produce

**Checkpoint:** All 5 steps pass with zero manual database edits.

---

## How to Explain This to a Judge
> "Our scheduling engine now runs a real constraint solver — Google OR-Tools' CP-SAT — which finds a mathematically optimal weekly plan, maximizing total priority-weighted work scheduled while strictly respecting no-overlap and per-segment capacity constraints. If the solver is ever unreachable, we automatically fall back to our earlier heuristic engine, so the system never fails to produce a plan — we chose resilience over a hard dependency on any single approach."

This is now an accurate, strong claim — you can show the badge live, and you can open `solver.py` and walk through the actual constraint model if pushed on details.

---

## Honest Scope Note
The soft peak-avoidance term is a simplified approximation (checking whether a chosen *start time* falls in an off-peak window, not modeling the full overlap of the interval against the peak window). A fully rigorous version would model peak windows as their own constraints. This simplification is a reasonable, explainable trade-off for the time available — say so if asked for specifics rather than implying full interval-level peak modeling exists.
