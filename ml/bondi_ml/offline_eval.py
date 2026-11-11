"""Construye perfiles offline y los evalúa contra la línea de base de frecuencia.

    python -m bondi_ml.offline_eval --synthetic --out artifacts/runs/offline
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .calendar import local_datetime
from .profiles import build_profiles, evaluate_offline, line_baseline_headway
from .synthetic import generate_arrivals


def run(arrivals, out: Path, version: str, data_source: str) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    dates = sorted({local_datetime(int(ms)).date() for ms in arrivals["arrived_at"]})
    cut = dates[int(len(dates) * 0.75)]
    train = arrivals[arrivals["arrived_at"].map(lambda ms: local_datetime(int(ms)).date() < cut)]
    test = arrivals[arrivals["arrived_at"].map(lambda ms: local_datetime(int(ms)).date() >= cut)]
    profile = build_profiles(train, data_source, version)
    report = {
        "data_source": data_source,
        "train_days": len([d for d in dates if d < cut]),
        "test_days": len([d for d in dates if d >= cut]),
        "profile_bytes": len(json.dumps(profile, separators=(",", ":"))),
        "pairs": len(profile["entries"]),
        "evaluation": evaluate_offline(profile, test, line_baseline_headway(train)),
    }
    (out / "profiles.json").write_text(json.dumps(profile, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "offline-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--synthetic", action="store_true")
    p.add_argument("--out", required=True)
    p.add_argument("--version", default="dev")
    a = p.parse_args()
    if not a.synthetic:
        raise SystemExit("Datos reales: pendiente de autorización (B1). Usar --synthetic.")
    print(json.dumps(run(generate_arrivals(), Path(a.out), a.version, "synthetic"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
