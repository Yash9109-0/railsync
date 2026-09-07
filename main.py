"""FastAPI service exposing the trained priority-scoring model.

POST /predict-priority accepts the same input features used at training time
(including the new text_urgency_score, plus historical_overrun_rate) and
returns {"priority_score": float, "delay_risk": "Low"|"Medium"|"High"}.
GET /health returns {"status": "ok"}. CORS allows all origins for the demo.
"""

import os

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

NUMERIC = [
    "requested_start_hour",
    "requested_duration_mins",
    "trains_scheduled_in_window",
    "asset_risk_flag",
    "historical_overrun_rate",
    "text_urgency_score",
]
CATEGORICAL = ["segment", "work_type", "safety_criticality"]

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_BASE_DIR, "model.pkl")
COLUMNS_PATH = os.path.join(_BASE_DIR, "columns.pkl")

model = joblib.load(MODEL_PATH)
FEATURE_COLS = list(joblib.load(COLUMNS_PATH))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PriorityRequest(BaseModel):
    segment: str
    requested_start_hour: int
    requested_duration_mins: float
    work_type: str
    safety_criticality: str
    trains_scheduled_in_window: int = 0
    asset_risk_flag: int = 0
    historical_overrun_rate: float = 0.0
    text_urgency_score: float = 50.0


def encode(req: PriorityRequest) -> pd.DataFrame:
    raw = pd.DataFrame(
        [
            {
                "requested_start_hour": float(req.requested_start_hour),
                "requested_duration_mins": float(req.requested_duration_mins),
                "trains_scheduled_in_window": float(req.trains_scheduled_in_window),
                "asset_risk_flag": float(req.asset_risk_flag),
                "historical_overrun_rate": float(req.historical_overrun_rate),
                "text_urgency_score": float(req.text_urgency_score),
                "segment": req.segment,
                "work_type": req.work_type,
                "safety_criticality": req.safety_criticality,
            }
        ]
    )
    X_num = raw[NUMERIC].astype(float)
    X_cat = pd.get_dummies(raw[CATEGORICAL], columns=CATEGORICAL)
    X = pd.concat([X_num, X_cat], axis=1).astype(float)
    X = X.reindex(columns=FEATURE_COLS, fill_value=0.0)
    return X


def delay_risk_for(score: float) -> str:
    if score < 40:
        return "Low"
    if score <= 70:
        return "Medium"
    return "High"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict-priority")
def predict_priority(req: PriorityRequest):
    X = encode(req)
    score = float(np.clip(model.predict(X)[0], 0, 100))
    return {"priority_score": round(score, 2), "delay_risk": delay_risk_for(score)}
