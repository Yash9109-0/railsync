# Optimization Approach - RailSync

## 1. What We Built

We built a 3-stage heuristic system optimized for speed and explainability:

**Stage A - ML Scoring:** RandomForest classifier trained on synthetic + real field block request data. Features used: asset criticality, traffic density, maintenance urgency, historical delay impact. Output: priority score 0-100 per request.

**Stage B - Greedy Allocation:** Sort requests by score descending. Iterate through list and assign each request to the earliest feasible time slot that doesn't conflict with already placed higher-priority jobs.

**Stage C - Bounded Local Search:** Single-pass swap improvement. After greedy placement, try swapping adjacent jobs if it reduces total overlap and idle time. Bounded to max 50 iterations to keep latency under 50ms.

## 2. What This Is NOT

This is not a constraint-satisfaction solver.
- No mathematical optimality guarantee
- Does not search the full solution space (which is exponential / NP-hard)
- Does not jointly optimize all variables simultaneously
- No hard proof that solution is globally optimal

## 3. Why This Approach for Hackathon MVP

**Explainability:** Every decision traces to a specific rule and score an officer can inspect. Example: "This block was scheduled at 02:00 because priority 87 due to critical track + high traffic". A full CP-SAT solver is a black box.

**Speed:** Runs in 15-50 milliseconds, works inside a Vercel serverless function, enables real-time interactive planning. A full solver takes 2-30 seconds per run.

**Buildability:** Achievable by a beginner team in 48 hours with no heavy external solver dependencies, no complex library setup.

Versus a full solver which requires specialized libraries (OR-Tools, CPLEX), longer compute time per run, and is harder to explain to a non-technical control officer.

## 4. How This Would Extend to Production System

We propose a hybrid approach:

**Layer 1 - Fast Explainable Plan (current system):** ML + Greedy + Local Search produces a fast, explainable first plan for immediate daily operations. Officer can see and edit.

**Layer 2 - Batch Optimal Plan (future production):** Integrate Google OR-Tools CP-SAT as a separate optimization pass:

- Model each block request as a variable with domain = possible time slots (e.g., 96 slots per day in 15-min steps)
- Hard constraints: non-overlap on same segment, safety headway >= 2 hours, max possessions per day per section, maintenance window limits
- Objective function: Maximize sum(priority_score * scheduled) + asset_availability - traffic_disruption_penalty
- Solver runs every 30 minutes for next 7-day horizon, validating and refining Layer 1 output

This keeps explainable layer for daily ops, and optimal layer for longer-horizon planning. Layer 2 would not replace Layer 1 entirely, but would produce a fully optimized version for longer-horizon planning that can be compared against the heuristic plan.
