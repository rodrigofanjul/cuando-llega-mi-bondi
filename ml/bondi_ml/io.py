"""Lectura de exportaciones reales (scripts/export-arrival-history.mjs): CSV o parquet."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

_TEXT = ["stop_id", "line_code", "vehicle_id", "eta_status", "confidence", "method", "data_source", "algorithm_version"]


def read_table(path: str | Path) -> pd.DataFrame:
    p = Path(path)
    if p.suffix == ".parquet":
        df = pd.read_parquet(p)
    else:
        df = pd.read_csv(p, dtype={c: "string" for c in _TEXT}, keep_default_na=True)
    for col in ("observed_at", "arrived_at"):
        if col in df.columns:
            df = df[df[col].notna()].copy()
            df[col] = df[col].astype("int64")
    if "data_source" not in df.columns:
        df["data_source"] = "real"
    return df.reset_index(drop=True)
