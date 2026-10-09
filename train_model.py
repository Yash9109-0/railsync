"""Train a RandomForestRegressor to predict priority_score.

Loads data.csv, one-hot encodes segment/work_type/safety_criticality, keeps the
numeric features (including the new text_urgency_score) alongside the existing
ones, trains the model, prints the test MAE, then saves the fitted model to
model.pkl and the feature-column list to columns.pkl (via joblib).
"""

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

TARGET = "priority_score"
NUMERIC = [
    "requested_start_hour",
    "requested_duration_mins",
    "trains_scheduled_in_window",
    "asset_risk_flag",
    "historical_overrun_rate",
    "text_urgency_score",
]
CATEGORICAL = ["segment", "work_type", "safety_criticality"]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    X_num = df[NUMERIC].copy()
    X_cat = pd.get_dummies(df[CATEGORICAL], columns=CATEGORICAL)
    X = pd.concat([X_num, X_cat], axis=1).astype(float)
    return X


def retrain_from_data(new_records: list[dict] | None = None) -> float:
    df = pd.read_csv("data.csv")

    if new_records and len(new_records) > 0:
        new_df = pd.DataFrame(new_records)
        # Ensure all required columns exist in new_df
        for col in NUMERIC + CATEGORICAL:
            if col not in new_df.columns:
                if col in NUMERIC:
                    new_df[col] = 0.0
                else:
                    new_df[col] = "Other"
        if TARGET not in new_df.columns:
            new_df[TARGET] = 50.0
        df = pd.concat([df, new_df[NUMERIC + CATEGORICAL + [TARGET]]], ignore_index=True)
        # Save updated dataset
        df.to_csv("data.csv", index=False)

    y = df[TARGET]
    X = build_features(df)
    feature_cols = list(X.columns)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=100, random_state=42, n_jobs=1
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, preds))
    print(f"MAE: {mae:.4f}")

    joblib.dump(model, "model.pkl")
    joblib.dump(feature_cols, "columns.pkl")
    print(f"Saved model.pkl and columns.pkl ({len(feature_cols)} features)")
    return mae


def main():
    retrain_from_data()


if __name__ == "__main__":
    main()

