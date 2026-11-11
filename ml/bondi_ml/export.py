"""Artefacto JSON compacto para inferencia liviana en TypeScript.

Formato (schema_version 1):
{
  "schema_version": 1, "model_version": str, "kind": "lightgbm_residual" | "bias_table",
  "data_source": "synthetic" | "real", "created_at": ISO, "calendar_version": str,
  "features": [...], "maps": {...}, "interval": {q_low, q_high, nominal},
  "trees": [node...] | null,  node = {"f","t","d","m","l","r"} | {"v"},
  "bias_table": {...} | null, "metrics": {...}, "gate": {publishable, reasons},
  "parity_cases": [{"x": [...], "eta": n, "expected": n}]   # para tests TS
}
`evaluate_trees` replica el algoritmo del evaluador TS (features/prediction/lib/model.ts).
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import numpy as np

from . import SCHEMA_VERSION
from .calendar import CALENDAR_VERSION
from .dataset import FEATURES


def _compact(node: dict[str, Any]) -> dict[str, Any]:
    if "leaf_value" in node:
        return {"v": float(node["leaf_value"])}
    if node.get("decision_type") != "<=":
        raise ValueError(f"decision_type no soportado: {node.get('decision_type')}")
    return {
        "f": int(node["split_feature"]),
        "t": float(node["threshold"]),
        "d": 1 if node["default_left"] else 0,
        "m": node.get("missing_type", "None"),
        "l": _compact(node["left_child"]),
        "r": _compact(node["right_child"]),
    }


def compact_trees(booster) -> list[dict[str, Any]]:
    dump = booster.dump_model()
    return [_compact(t["tree_structure"]) for t in dump["tree_info"]]


def _goes_left(node: dict[str, Any], x: float) -> bool:
    missing = node["m"]
    if math.isnan(x):
        if missing == "NaN":
            return node["d"] == 1
        x = 0.0
    if missing == "Zero" and x == 0.0:
        return node["d"] == 1
    return x <= node["t"]


def evaluate_trees(trees: list[dict[str, Any]], x: list[float]) -> float:
    total = 0.0
    for node in trees:
        while "v" not in node:
            node = node["l"] if _goes_left(node, x[node["f"]]) else node["r"]
        total += node["v"]
    return total


def build_artifact(
    *,
    kind: str,
    model_version: str,
    data_source: str,
    maps: dict,
    interval,
    metrics: dict,
    gate,
    trees: list | None = None,
    bias_table: dict | None = None,
    parity_rows: np.ndarray | None = None,
    parity_expected: np.ndarray | None = None,
    parity_raw: list[dict] | None = None,
) -> dict[str, Any]:
    cases = []
    if parity_rows is not None and parity_expected is not None:
        eta_idx = FEATURES.index("eta_minutes")
        raws = parity_raw or [{} for _ in range(len(parity_rows))]
        cases = [
            {"x": [float(v) for v in row], "eta": float(row[eta_idx]), "expected": float(exp), "raw": raw}
            for row, exp, raw in zip(parity_rows, parity_expected, raws)
        ]
    return {
        "schema_version": SCHEMA_VERSION,
        "model_version": model_version,
        "kind": kind,
        "data_source": data_source,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "calendar_version": CALENDAR_VERSION,
        "features": list(FEATURES),
        "maps": maps,
        "interval": {"q_low": interval.q_low, "q_high": interval.q_high, "nominal": interval.nominal},
        "trees": trees,
        "bias_table": bias_table,
        "metrics": metrics,
        "gate": {"publishable": gate.publishable, "reasons": gate.reasons},
        "parity_cases": cases,
    }


def write_json(path, obj) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
