# RailSync — YOUR FILE: Person 2 (ML Model & AI Dashboard)

## Your job in one sentence
You build the actual AI/ML model (the thing that makes this "AI-powered"), deploy it so the app can call it over the internet, then build the AI Dashboard that shows AI-ranked block requests with explanations. **You can start your ML work immediately — you don't need to wait for anyone.** The AI Dashboard part (inside the shared app) requires P1's signal first.

---

## PART 0: Tools Setup (do this first, ~20 min)

1. **Install Node.js**: nodejs.org → download "LTS" → install.
2. **Install Python** (3.10 or newer): python.org/downloads → download → install. **Important on Windows:** check the box "Add Python to PATH" during install.
3. **Install VS Code**: code.visualstudio.com → download → install.
4. **Install Git**: git-scm.com/downloads → download → install (defaults are fine).
5. **Open VS Code** → click Extensions icon (4 squares, left sidebar) → search "Kilo Code" → Install.
6. **Open Kilo Code** (new icon in left sidebar) → sign in / choose "Use your own API key" → provider OpenRouter → paste your OpenRouter API key (openrouter.ai → sign up → Keys → Create Key). In the model dropdown, select **"Poolside: Laguna S 2.1 (free)"**.
7. **Open a terminal in VS Code**: Terminal menu (top) → New Terminal.

Verify:
```bash
node -v
python3 --version
git --version
```
(On Windows, if `python3` doesn't work, try `python --version` instead.) All three should print version numbers.

---

## PART 1: Accounts to Create (~10 min)

1. **GitHub** (github.com) — you should already have collaborator access to the team's `railsync` repo from P1.
2. **Render** (render.com) — sign up with GitHub. This hosts your ML model as a live web service.
3. **OpenRouter** (openrouter.ai) — likely already made in Part 0.

---

## PART 2: Build the ML Model (Independent — Start Now, Don't Wait)

Create a **separate folder**, not inside the team's `railsync` repo:

```bash
mkdir railsync-ml
cd railsync-ml
python3 -m venv venv
```
Activate it:
- Mac/Linux: `source venv/bin/activate`
- Windows: `venv\Scripts\activate`

You'll know it worked if you see `(venv)` at the start of your terminal line.

```bash
pip install scikit-learn pandas fastapi uvicorn joblib numpy
```

**Open this `railsync-ml` folder in VS Code** (File → Open Folder). Open Kilo Code's chat panel.

### Prompt 1 — Generate training data
```
Create a Python script generate_data.py that generates 500 synthetic rows of railway block request data with columns: segment (A-B/B-C/C-D/D-E), requested_start_hour (0-23), requested_duration_mins (30-240), work_type (Track/Signal/Electrical/Other), safety_criticality (routine/urgent/safety_critical), trains_scheduled_in_window (0-8), asset_risk_flag (0 or 1), historical_overrun_rate (0.0-0.5). Then compute a target column priority_score (0-100) using this hidden rule: base score from safety_criticality (routine=20, urgent=55, safety_critical=85), add trains_scheduled_in_window*3, add asset_risk_flag*10, add historical_overrun_rate*20, subtract requested_duration_mins*0.05, clip to 0-100, add small random noise. Save to data.csv.
```

Run it:
```bash
python generate_data.py
```
**Checkpoint ✅:** A file called `data.csv` now exists in your folder with 500 rows. Open it in VS Code to peek — you should see columns and numbers, not an error.

### Prompt 2 — Train the model
```
Create train_model.py that loads data.csv, one-hot encodes segment/work_type/safety_criticality, trains a RandomForestRegressor to predict priority_score, prints the test MAE, and saves the model with joblib to model.pkl along with the encoder/column list to columns.pkl.
```

Run it:
```bash
python train_model.py
```
**Checkpoint ✅:** It prints a number labeled MAE (something like "MAE: 4.2") and two new files appear: `model.pkl` and `columns.pkl`. **Write down the MAE number** — you'll want it for your demo later ("our model predicts priority within X points on average").

### Prompt 3 — Build the API
```
Create main.py, a FastAPI app with a POST endpoint /predict-priority that accepts JSON matching the input features, loads model.pkl and columns.pkl, encodes the input the same way as training, and returns {"priority_score": float, "delay_risk": "Low"|"Medium"|"High"} where delay_risk is Low if score<40, Medium if 40-70, High if >70. Add a GET /health route returning {"status":"ok"}. Add CORS middleware allowing all origins for the hackathon demo.
```

Run it:
```bash
uvicorn main:app --reload --port 8000
```
Leave this running. Open a **second terminal** (Terminal → New Terminal, or click the + in the terminal panel) and test it:
```bash
curl -X POST http://localhost:8000/predict-priority -H "Content-Type: application/json" -d "{\"segment\":\"A-B\",\"requested_start_hour\":14,\"requested_duration_mins\":90,\"work_type\":\"Track\",\"safety_criticality\":\"urgent\",\"trains_scheduled_in_window\":4,\"asset_risk_flag\":1,\"historical_overrun_rate\":0.2}"
```
**Checkpoint ✅:** You get back something like `{"priority_score": 67.3, "delay_risk": "Medium"}`. If you get an error, copy the exact error text into Kilo Code's chat and ask it to fix it.

Stop the server for now (click in that terminal, press Ctrl+C).

---

## PART 3: Deploy Your Model to Render (~15 min)

Create a file called `requirements.txt` in the `railsync-ml` folder with this content:
```
fastapi
uvicorn
scikit-learn
pandas
joblib
numpy
```

Push this folder to its own GitHub repo:
1. On GitHub, click **+** → New repository → name it `railsync-ml` → Create (don't add a README)
2. In your terminal (make sure you're in the `railsync-ml` folder, not `railsync`):
```bash
git init
git add .
git commit -m "ml model"
git remote add origin https://github.com/YOUR_USERNAME/railsync-ml.git
git branch -M main
git push -u origin main
```

Now on **Render.com**:
1. Click "New +" → "Web Service"
2. Connect your GitHub account if asked, select the `railsync-ml` repo
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Choose the Free plan → Click "Create Web Service"
6. Wait 3–5 minutes for it to deploy. Render gives you a live URL like `https://railsync-ml.onrender.com`

Test the live version (same curl command as before, but with your Render URL instead of localhost):
```bash
curl -X POST https://YOUR-RENDER-URL.onrender.com/predict-priority -H "Content-Type: application/json" -d "{\"segment\":\"A-B\",\"requested_start_hour\":14,\"requested_duration_mins\":90,\"work_type\":\"Track\",\"safety_criticality\":\"urgent\",\"trains_scheduled_in_window\":4,\"asset_risk_flag\":1,\"historical_overrun_rate\":0.2}"
```

**Checkpoint ✅:** Same kind of response as before, but now working over the internet, not just your laptop.

**⚠️ Free Render services "sleep" after inactivity and take ~30-60 seconds to wake up on the first request.** Remember this for demo day — hit the URL once a few minutes before you present, so it's already awake.

**Note on OpenRouter API key confusion:** the key you set up in Kilo Code (Part 0) is YOUR personal key for coding help. The app itself (the AI Dashboard's explanation feature) will need a **separate** OpenRouter key placed in an environment variable — you'll set that up in Part 5 below. They can be the same OpenRouter account, just used in two different places.

---

## 🚦 SIGNAL YOUR TEAM

Message your group chat:
```
🚦 ML model is live! Render URL: https://YOUR-RENDER-URL.onrender.com

Everyone update your .env.local file's ML_API_URL to this real URL (replacing the placeholder).
```

---

## PART 4: STOP AND WAIT (if you're here before P1's signal)

**Do not go further until P1 has sent their 🚦 "Foundation is ready" message in the group chat.** If you finished Part 3 early, that's great — take a break, review your model's MAE number, or help someone else. There is nothing productive to do in the shared repo until P1's foundation is pushed.

---

## PART 5: AI Dashboard (only after P1's signal)

Go back to your terminal. Navigate out of `railsync-ml` and into the team's shared repo (clone it if you haven't already):
```bash
cd ..
git clone https://github.com/YOUR_TEAM/railsync.git
cd railsync
```
(If you already had it cloned from before, just `cd railsync` and `git pull` instead.)

```bash
git checkout -b feature/ai-dashboard
npm install
```

Create your `.env.local` file (P1 sent you these values in their signal message):
```
NEXT_PUBLIC_SUPABASE_URL=<from P1>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from P1>
OPENROUTER_API_KEY=<your OpenRouter key>
ML_API_URL=https://YOUR-RENDER-URL.onrender.com
```

**Open this `railsync` folder in VS Code** (File → Open Folder) and open Kilo Code's chat panel.

### Prompt 1 — API routes that connect to your model
```
Create app/api/score/route.ts, a POST route that receives a block_request id, fetches its row from Supabase, calls process.env.ML_API_URL + '/predict-priority' with the right fields, updates the block_request row with priority_score, delay_risk, status='scored'. Create app/api/explain/route.ts, a POST route that takes a block_request id, sends its features + priority_score to OpenRouter's chat completions endpoint (using OPENROUTER_API_KEY, any free model) asking for a 2-sentence plain-English explanation of the ranking, saves it to ai_explanation column, returns the text.
```

### Prompt 2 — The AI Dashboard page
```
Build app/dashboard/ai/page.tsx: fetch all block_requests with status in ('submitted','scored'), show a "Score All Pending" button that calls /api/score for each unscored one, then a Table sorted by priority_score desc, with delay_risk Badge (green/amber/red), a "Generate Explanation" button per row (calls /api/explain, shows result inline with a fade-in), and a "What if?" Dialog per row with sliders for duration and trains_scheduled_in_window that call /api/score in a preview mode (don't save) and show the recalculated score live. Style the top-ranked row with a subtle #960DF2 left border to visually flag it as highest priority. Add loading skeletons and toast confirmations.
```

Test it:
```bash
npm run dev
```
Log in as `admin@railsync.demo` (goes to `/dashboard/ai`). You need at least one block request in the system first — if P1 hasn't submitted one yet, log in as `maintenance@railsync.demo` in another browser tab and submit one, then come back.

Click "Score All Pending" — watch for a priority_score and delay_risk badge to appear. Click "Generate Explanation" on a row — wait a few seconds, text should appear.

**Checkpoint ✅:** A request gets scored, ranked, and can generate a real explanation sentence. No console errors (F12 to check).

### Prompt 3 — Polish pass
```
Add a small stat-card row at the top: total pending requests, average priority score, count by delay_risk level, styled as 3-4 shadcn Cards with large numbers.
```

---

## PART 6: Push Your Work

```bash
git add .
git commit -m "ai dashboard: ML scoring + explanations + what-if"
git push origin feature/ai-dashboard
```

On GitHub, go to your repo → you'll see a banner "Compare & pull request" for your branch → click it → click "Create pull request." Message your team: "PR for AI Dashboard is open, someone please review/merge, or P4 — go ahead and merge if it looks good."

---

## Team Sync Timeline (for your reference)

| Time | P1 | You (P2) | P3 | P4 |
|---|---|---|---|---|
| Hour 0–1.5 | Building foundation | Building + deploying ML model (independent) | Waiting, setting up accounts | Waiting, setting up accounts |
| Hour 1.5 | 🚦 Signal sent | Keep going on ML if not done | Start pulling code | Start pulling code |
| Hour 2–3 | Maintenance Dashboard | Deploy ML model, send your own 🚦 with Render URL | Control Dashboard | Field Dashboard |
| Hour 3+ | — | Build AI Dashboard | — | — |
| Later Day 2 | Standby/help | Open PR when ready | Open PR when ready | Merges everyone's PRs |

You have two deliverables and two 🚦 signals to send: your Render URL (as soon as it's live — don't wait for it to be perfect), and your AI Dashboard PR later. Send the Render URL signal early since P3's Control Dashboard reads scored requests and everyone's demo depends on your model being reachable.
