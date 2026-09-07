"""Generate synthetic railway block-request training data.

Produces 500 rows in data.csv with a target column priority_score (0-100).
A new text_urgency_score column (0-100) is synthesized so that it is correlated
with safety_criticality (routine: N(25,10), urgent: N(55,12), safety_critical:
N(85,10), clipped to 0-100) -- simulating what a text-urgency-reading model
would output. text_urgency_score is also folded into the priority_score formula
as an additional input (text_urgency_score * 0.3), after which the score is
re-clipped to 0-100.
"""

import numpy as np
import pandas as pd

np.random.seed(42)
N = 500

SEGMENTS = ["A-B", "B-C", "C-D", "D-E"]
WORK_TYPES = ["Track", "Signal", "Electrical", "Other"]
SAFETY_LEVELS = ["routine", "urgent", "safety_critical"]

# Base priority contribution per safety_criticality (hidden rule).
SAFETY_BASE = {"routine": 20, "urgent": 55, "safety_critical": 85}

# (mean, std) for the synthetic text_urgency_score, correlated with safety.
URGENCY_PARAMS = {
    "routine": (25, 10),
    "urgent": (55, 12),
    "safety_critical": (85, 10),
}


def main():
    safety = np.random.choice(SAFETY_LEVELS, size=N)

    urgency_mu = np.array([URGENCY_PARAMS[s][0] for s in safety])
    urgency_sigma = np.array([URGENCY_PARAMS[s][1] for s in safety])
    text_urgency = np.clip(np.random.normal(urgency_mu, urgency_sigma), 0, 100)

    df = pd.DataFrame(
        {
            "segment": np.random.choice(SEGMENTS, size=N),
            "requested_start_hour": np.random.randint(0, 24, size=N),
            "requested_duration_mins": np.random.randint(30, 241, size=N),
            "work_type": np.random.choice(WORK_TYPES, size=N),
            "safety_criticality": safety,
            "trains_scheduled_in_window": np.random.randint(0, 9, size=N),
            "asset_risk_flag": np.random.choice([0, 1], size=N),
            "historical_overrun_rate": np.round(np.random.uniform(0.0, 0.5, size=N), 3),
            "text_urgency_score": np.round(text_urgency, 2),
        }
    )

    base = np.array([SAFETY_BASE[s] for s in safety])
    priority = (
        base
        + df["trains_scheduled_in_window"].to_numpy() * 3
        + df["asset_risk_flag"].to_numpy() * 10
        + df["historical_overrun_rate"].to_numpy() * 20
        - df["requested_duration_mins"].to_numpy() * 0.05
        + df["text_urgency_score"].to_numpy() * 0.3
        + np.random.normal(0, 2, size=N)
    )
    # Add text_urgency_score above, then re-clip to 0-100.
    priority = np.clip(priority, 0, 100)
    df["priority_score"] = np.round(priority, 2)

    df.to_csv("data.csv", index=False)

    print(f"Generated {len(df)} rows -> data.csv")
    print("Columns:", list(df.columns))
    print(
        df[["safety_criticality", "text_urgency_score", "priority_score"]]
        .head(10)
        .to_string(index=False)
    )


if __name__ == "__main__":
    main()
