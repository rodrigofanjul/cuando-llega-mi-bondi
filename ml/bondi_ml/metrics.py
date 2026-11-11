"""Métricas de evaluación (siempre comparadas contra el ETA municipal)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def point_metrics(y: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    err = np.asarray(pred, dtype=float) - np.asarray(y, dtype=float)
    if len(err) == 0:
        return {"n": 0, "mae": float("nan"), "rmse": float("nan"), "medae": float("nan"), "within_2min": float("nan"), "bias": float("nan")}
    return {
        "n": int(len(err)),
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err**2))),
        "medae": float(np.median(np.abs(err))),
        "within_2min": float(np.mean(np.abs(err) <= 2)),
        # Positivo = la predicción sobreestima (dice que tarda más de lo que tardó).
        "bias": float(np.mean(err)),
    }


def coverage(y: np.ndarray, low: np.ndarray, high: np.ndarray) -> float:
    y = np.asarray(y, dtype=float)
    return float(np.mean((y >= low) & (y <= high))) if len(y) else float("nan")


def by_group(df: pd.DataFrame, pred: np.ndarray, column: str) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    pred = np.asarray(pred, dtype=float)
    for value, idx in df.groupby(column).indices.items():
        out[str(value)] = point_metrics(df["target_minutes"].to_numpy()[idx], pred[idx])
    return out


def hour_band(hour: int) -> str:
    if 6 <= hour < 9:
        return "06-09"
    if 9 <= hour < 12:
        return "09-12"
    if 12 <= hour < 17:
        return "12-17"
    if 17 <= hour < 20:
        return "17-20"
    return "20-06"
