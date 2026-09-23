# RailSync — MASTER FIX: OR-Tools Stuck on Fallback (100% Resolution Guide)

**What's happening:** every generated plan shows "Heuristic (Fallback)" — meaning your app is trying to call the CP-SAT solver, failing every time, and silently falling back to greedy. Given you never actually finished setting up `railsync-ml` in our last session, the most likely reason is simple: **the `/solve-horizon` endpoint doesn't exist yet, anywhere.** This file gets it built, deployed, and verified working, step by step, with a real check at each stage so nothing is assumed.

---

## PART A: Find Out What Actually Exists (5 minutes — do this first)

Don't rebuild anything yet. Check what's real first.

### A1: Does `railsync-ml` exist anywhere?

```powershell
Get-ChildItem -Path C:\Users\Admin -Directory -Recurse -Filter "railsync-ml*" -ErrorAction SilentlyContinue
```

### A2: Does the GitHub repo exist?

Go to github.com, check your account/team's repos for one named `railsync-ml`. If it exists, click into it and check: does `solver.py` exist? Does `main.py` have a `/solve-horizon` route in it?

### A3: Does the LIVE Render service have this endpoint?

Get your `ML_API_URL` value from `.env.local` (or Vercel's environment variables), then test directly:
```powershell
curl.exe https://YOUR-RENDER-URL.onrender.com/health
```
If that works, try the actual endpoint:
```powershell
curl.exe -X POST https://YOUR-RENDER-URL.onrender.com/solve-horizon -H "Content-Type: application/json" -d "{}"
```
**Read the result carefully:**
- `404 Not Found` → the endpoint genuinely doesn't exist on the deployed service. **This is almost certainly your situation.** Skip to Part B.
- A JSON error about missing fields (not 404) → the endpoint exists but your test payload was empty, which is fine — it means Part B is already done, skip to Part D to check the TypeScript integration instead.
- Timeout / no response → the service might be asleep (Render free tier) or genuinely broken. Skip to Part B to rebuild cleanly.

**Checkpoint:** you now know definitively whether `/solve-horizon` exists live. Proceed based on what you found.

---

## PART B: Build `railsync-ml` Properly This Time (if it doesn't exist)

### B1: Create the folder in a predictable place

```powershell
cd C:\Users\Admin
mkdir railsync-ml
cd railsync-ml
```

### B2: Set up Python correctly with a virtual environment (avoids last time's pip issues)

```powershell
python --version
```
If this fails, reinstall Python from python.org — **check "Add Python to PATH"** during install, this was likely last session's root cause. Then reopen your terminal and retry.

Once `python --version` shows a real version:
```powershell
python -m venv venv
venv\Scripts\activate
```
You should see `(venv)` appear at the start of your terminal line. **Do this every time you work in this folder from now on** — it keeps this project's Python packages separate and avoids PATH confusion.

Now install everything needed:
```powershell
python -m pip install fastapi uvicorn scikit-learn pandas joblib numpy ortools
```
This may take a minute or two — `ortools` is a larger package. Wait for it to finish completely.

**Checkpoint:** `python -m pip show ortools` prints real package info, no errors.

### B3: Recreate the ML model files

If your original `railsync-ml` files (from your earlier ML phase — `generate_data.py`, `train_model.py`, `main.py`) are genuinely lost, open VS Code in this new folder and use Kilo Code:

**Kilo Code prompt:**
```
Recreate the following files for a RailSync ML service:

generate_data.py: generates 500 synthetic rows with columns segment (A-B/B-C/C-D/D-E), requested_start_hour (0-23), requested_duration_mins (30-240), work_type (Track/Signal/Electrical/Other), safety_criticality (routine/urgent/safety_critical), trains_scheduled_in_window (0-8), asset_risk_flag (0/1), historical_overrun_rate (0.0-0.5), text_urgency_score (0-100, correlated with safety_criticality: routine mean 25, urgent mean 55, safety_critical mean 85). Computes priority_score (0-100) from a weighted formula of these features plus noise, clipped to 0-100. Saves to data.csv.

train_model.py: loads data.csv, one-hot encodes categorical columns, trains a RandomForestRegressor on all features including text_urgency_score, prints test MAE, saves model.pkl and columns.pkl via joblib.

main.py: FastAPI app with GET /health returning {"status":"ok"}, and POST /predict-priority accepting the same features as training, loading model.pkl and columns.pkl, returning {"priority_score": float, "delay_risk": "Low"|"Medium"|"High"}. Add CORS middleware allowing all origins.
```

Run:
```powershell
python generate_data.py
python train_model.py
```
**Checkpoint:** a real MAE number printed, `model.pkl` exists and is more than a few KB.

### B4: Add the CP-SAT Solver

**Kilo Code prompt:**
```
Create solver.py with a function solve_horizon(requests, segment_capacity_mins, horizon_total_mins) using Google OR-Tools CP-SAT.

Input: requests is a list of dicts, each with: id (string), segment_id (int), duration_mins (int), priority_score (float 0-100), preferred_start_mins (int), avoids_peak_start_mins (list of ints, can be empty). segment_capacity_mins is a dict mapping segment_id to capacity in minutes. horizon_total_mins is the horizon length in minutes.

Model: for each request, create an optional interval variable (presence bool, start int var domain 0 to horizon_total_mins-duration_mins, interval of start/duration/end). Group by segment_id, add NoOverlap per segment. Add a capacity constraint per segment: sum of (duration_mins * presence) <= segment_capacity_mins for that segment. Objective: maximize sum(priority_score * presence) as the main term, plus a small bonus (weight 0.1) if a scheduled request's start falls within its own avoids_peak_start_mins list. Set solver.parameters.max_time_in_seconds = 10, solve, accept OPTIMAL or FEASIBLE status.

IMPORTANT: OR-Tools solver values are sometimes numpy/C++ native types that don't serialize to JSON cleanly — explicitly cast every returned value with int() or bool() (e.g., int(solver.Value(start_var)), bool(solver.Value(presence_var))) so the FastAPI response doesn't fail on JSON serialization.

Return a list of dicts: {id, scheduled: bool, start_mins: int or None, duration_mins: int}.
```

**Kilo Code prompt:**
```
Add to main.py: POST /solve-horizon, accepting JSON with requests, segment_capacity_mins, horizon_total_mins matching solve_horizon's input shape. Call solve_horizon from solver.py, return its result as JSON. Wrap in try-except — on any error, return a 500 status with a clear JSON error message (not a crash/silent failure), so the calling app can distinguish "solver failed" from "solver returned no solution."
```

### B5: Test Locally Before Deploying Anything

```powershell
uvicorn main:app --reload --port 8000
```
Open a **second terminal** (keep the first running the server), navigate to the same folder, activate venv again (`venv\Scripts\activate`), and test:
```powershell
curl.exe https://localhost:8000/health
```
Wait — use http not https for local:
```powershell
curl.exe http://localhost:8000/health
```
Expected: `{"status":"ok"}`.

Test the solver with real data:
```powershell
curl.exe -X POST http://localhost:8000/solve-horizon -H "Content-Type: application/json" -d "@test_payload.json"
```
First create `test_payload.json` in this folder with content like:
```json
{
  "requests": [
    {"id": "r1", "segment_id": 1, "duration_mins": 90, "priority_score": 80, "preferred_start_mins": 100, "avoids_peak_start_mins": []},
    {"id": "r2", "segment_id": 1, "duration_mins": 90, "priority_score": 60, "preferred_start_mins": 100, "avoids_peak_start_mins": []}
  ],
  "segment_capacity_mins": {"1": 120},
  "horizon_total_mins": 10080
}
```
**Checkpoint (critical — do not skip):** you get back a JSON list where at least one request is `scheduled: true` and, given the capacity is only 120 minutes but both requests want 90 minutes each (180 total), at least one should be `scheduled: false` — proving the capacity constraint actually works. If you get a Python error instead, read it carefully and fix before continuing — don't deploy a broken solver.

Stop the local server (Ctrl+C in the first terminal) once confirmed.

### B6: Push and Deploy to Render

Create `requirements.txt`:
```
fastapi
uvicorn
scikit-learn
pandas
joblib
numpy
ortools
```

If this is a fresh folder with no git history:
```powershell
git init
git add .
git commit -m "railsync-ml: model, solver, endpoints"
```
Create a new GitHub repo called `railsync-ml` (or reuse the old one if A2 found it existed but was just out of date), then:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/railsync-ml.git
git branch -M main
git push -u origin main
```

**On Render:** if this is a genuinely new service, New → Web Service → connect the repo → Build Command `pip install -r requirements.txt` → Start Command `uvicorn main:app --host 0.0.0.0 --port $PORT` → Free plan → Create. If you're redeploying an existing service, just pushing to GitHub should trigger an automatic redeploy — check Render's dashboard for a new deployment in progress.

**Wait for deployment to finish** (3-5 minutes), then get the live URL and test exactly like Step A3, but now expecting success:
```powershell
curl.exe https://YOUR-RENDER-URL.onrender.com/health
curl.exe -X POST https://YOUR-RENDER-URL.onrender.com/solve-horizon -H "Content-Type: application/json" -d "@test_payload.json"
```

**Checkpoint:** both return correct results live, matching what you saw locally in B5.

**If your `ML_API_URL` changed** (new Render service = new URL), update it in BOTH your local `.env.local` AND Vercel's project environment variables, then trigger a Vercel redeploy.

---

## PART C: If the Endpoint Already Existed (A3 showed something other than 404)

Skip Part B. The issue is more subtle — go straight to Part D to add logging and find the real error.

---

## PART D: Add Visible Logging to the TypeScript Side (do this regardless)

Right now, failures are being swallowed into a silent fallback — you can't see WHY it's failing. Fix that first, permanently.

**Kilo Code prompt:**
```
In lib/optimizer.ts, find the try-catch block around the call to process.env.ML_API_URL + '/solve-horizon'. Update the catch block to console.error with full detail: the error message, the error stack if available, and the exact payload that was being sent (stringified) — prefixed with "🔴 CP-SAT SOLVER CALL FAILED:". Also log console.log("Attempting CP-SAT call to:", the full URL) right before the fetch, so it's visible in logs which URL was actually hit. Increase the fetch timeout from 15 seconds to 45 seconds, since Render's free tier can take 30-60 seconds to wake from sleep on a cold start, which alone could be causing every call to time out and fall back.
```

**This timeout increase might be your entire fix on its own** — if Render was asleep every time your app tried to call it with only a 15-second budget, it would fail every single time before the service even woke up, explaining a 100% fallback rate perfectly.

---

## PART E: Full Verification Test

1. Hit your Render URL's `/health` endpoint manually first (to wake it up), wait 10 seconds
2. Submit 6-8 test block requests on one segment with varying priority, ensuring more total duration than any reasonable capacity cap
3. Generate a weekly plan from the AI Dashboard
4. **Watch your terminal (if local) or Vercel Runtime Logs (if live)** for the new log lines from Part D — you should see "Attempting CP-SAT call to: ..." and either success or a clear, specific error
5. Check the resulting horizon's badge — it should now say **"Optimal (CP-SAT)"**, not "Heuristic (Fallback)"
6. Check Supabase: `block_plan_horizons.solver_used` should read `'cp-sat'`

**Checkpoint:** all 6 steps pass. If it still falls back, the Part D logging will now show you the exact real error — paste that specific error back for a targeted fix instead of guessing further.

---

## Quick Diagnosis Table

| A3 Result | Root Cause | Fix |
|---|---|---|
| 404 Not Found | Endpoint never built/deployed | Full Part B rebuild |
| Timeout / no response | Render asleep, or genuinely down | Part D timeout fix; check Render dashboard is even running |
| JSON error about missing fields | Endpoint exists, payload shape mismatch | Compare your TS payload builder against solver.py's expected input exactly |
| 500 error with a Python traceback | Endpoint exists but has a bug (likely the numpy serialization issue) | Check B4's int()/bool() casting note |
| Works when tested directly but still falls back in the app | The 15-second timeout was too short for a cold start | Part D's 45-second timeout fix |
