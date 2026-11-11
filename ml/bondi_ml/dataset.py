"""Construcción reproducible del dataset de entrenamiento.

Pasos: limpieza → deduplicación → emparejamiento observación↔llegada (sólo
llegadas con confianza permitida) → variables → split cronológico.

Fuga de información: todas las variables se calculan con datos disponibles en
el instante de la observación. El split es por FECHA DE LLEGADA (local AR), así
un mismo viaje nunca queda repartido entre entrenamiento y prueba.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .calendar import local_datetime, is_fixed_national_holiday

# Variables disponibles al momento de inferir (la app las conoce sin histórico).
FEATURES: tuple[str, ...] = (
    "eta_minutes",
    "hour_sin",
    "hour_cos",
    "weekday",
    "is_weekend",
    "is_holiday",
    "line_idx",
    "stop_idx",
    "deviation_minutes",
)

MAX_ETA = 60
MATCH_TOLERANCE_MS = 60 * 60_000


@dataclass
class DatasetReport:
    raw_observations: int
    duplicates_removed: int
    invalid_removed: int
    unmatched_removed: int
    inconsistent_removed: int
    rows: int
    data_sources: list[str]


def clean_observations(obs: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    before = len(obs)
    dedup = obs.drop_duplicates(subset=["observed_at", "stop_id", "line_code", "vehicle_id", "eta_minutes"])
    duplicates = before - len(dedup)
    valid = dedup[
        dedup["vehicle_id"].notna()
        & dedup["eta_minutes"].notna()
        & (dedup["eta_status"] == "minutes")
        & dedup["eta_minutes"].between(1, MAX_ETA)
    ]
    return valid.copy(), duplicates, len(dedup) - len(valid)


def attach_arrivals(obs: pd.DataFrame, arrivals: pd.DataFrame, allowed_confidence: tuple[str, ...] = ("high", "medium")) -> tuple[pd.DataFrame, int, int]:
    """Empareja cada observación con la PRIMERA llegada posterior de esa unidad en esa parada."""
    arr = arrivals[arrivals["confidence"].isin(allowed_confidence)][["stop_id", "line_code", "vehicle_id", "arrived_at", "confidence"]]
    left = obs.sort_values("observed_at").reset_index(drop=True)
    right = arr.sort_values("arrived_at").reset_index(drop=True)
    left["observed_at"] = left["observed_at"].astype("int64")
    right["arrived_at"] = right["arrived_at"].astype("int64")
    merged = pd.merge_asof(
        left,
        right,
        left_on="observed_at",
        right_on="arrived_at",
        by=["stop_id", "line_code", "vehicle_id"],
        direction="forward",
        tolerance=MATCH_TOLERANCE_MS,
    )
    unmatched = int(merged["arrived_at"].isna().sum())
    merged = merged[merged["arrived_at"].notna()].copy()
    merged["target_minutes"] = (merged["arrived_at"] - merged["observed_at"]) / 60_000
    # Inconsistencias: el ETA oficial y la llegada difieren de forma imposible.
    ok = (merged["target_minutes"] >= 0) & ((merged["target_minutes"] - merged["eta_minutes"]).abs() <= 40)
    return merged[ok].copy(), unmatched, int((~ok).sum())


def category_maps(df: pd.DataFrame) -> dict[str, dict[str, int]]:
    """Códigos estables (orden alfabético). Valores desconocidos → -1 al inferir."""
    return {
        "line_code": {v: i for i, v in enumerate(sorted(df["line_code"].unique()))},
        "stop_id": {v: i for i, v in enumerate(sorted(df["stop_id"].unique()))},
    }


def add_features(df: pd.DataFrame, maps: dict[str, dict[str, int]]) -> pd.DataFrame:
    out = df.copy()
    local = out["observed_at"].map(lambda ms: local_datetime(int(ms)))
    hour = local.map(lambda d: d.hour + d.minute / 60)
    out["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    out["weekday"] = local.map(lambda d: d.weekday())
    out["is_weekend"] = (out["weekday"] >= 5).astype(int)
    out["is_holiday"] = local.map(lambda d: int(is_fixed_national_holiday(d.date())))
    out["line_idx"] = out["line_code"].map(maps["line_code"]).fillna(-1).astype(int)
    out["stop_idx"] = out["stop_id"].map(maps["stop_id"]).fillna(-1).astype(int)
    out["deviation_minutes"] = out["deviation_minutes"].fillna(0)
    out["hour"] = hour.astype(int)
    out["arrival_date"] = out["arrived_at"].map(lambda ms: local_datetime(int(ms)).date())
    return out


def chronological_split(df: pd.DataFrame, train: float = 0.7, val: float = 0.15) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split por fecha de llegada: entrenamiento < validación < prueba, sin solapamiento."""
    dates = sorted(df["arrival_date"].unique())
    if len(dates) < 3:
        raise ValueError("Se necesitan al menos 3 días distintos para un split cronológico")
    n_train = max(1, int(len(dates) * train))
    n_val = max(1, int(len(dates) * val))
    train_dates = set(dates[:n_train])
    val_dates = set(dates[n_train : n_train + n_val])
    tr = df[df["arrival_date"].isin(train_dates)]
    va = df[df["arrival_date"].isin(val_dates)]
    te = df[~df["arrival_date"].isin(train_dates | val_dates)]
    return tr, va, te


def build(obs: pd.DataFrame, arrivals: pd.DataFrame, allowed_confidence: tuple[str, ...] = ("high", "medium")):
    raw = len(obs)
    clean, dups, invalid = clean_observations(obs)
    matched, unmatched, inconsistent = attach_arrivals(clean, arrivals, allowed_confidence)
    maps = category_maps(matched)
    feats = add_features(matched, maps)
    report = DatasetReport(
        raw_observations=raw,
        duplicates_removed=dups,
        invalid_removed=invalid,
        unmatched_removed=unmatched,
        inconsistent_removed=inconsistent,
        rows=len(feats),
        data_sources=sorted(obs["data_source"].dropna().unique().tolist()) if "data_source" in obs else ["unknown"],
    )
    return feats, maps, report
