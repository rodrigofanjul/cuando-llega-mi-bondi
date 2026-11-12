"""Construye perfiles offline y los evalúa contra la línea de base de frecuencia.

    python -m bondi_ml.offline_eval --synthetic --out artifacts/runs/offline
    python -m bondi_ml.offline_eval --arrivals ml/data/real/arrivals.csv --out artifacts/runs/offline-real --version 2026-11-11

Datos reales: exportación de scripts/export-arrival-history.mjs (autorización escrita del responsable, B1).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .calendar import local_datetime
from .io import read_table
from .profiles import build_profiles, evaluate_offline, line_baseline_headway
from .synthetic import generate_arrivals

#: Días mínimos para separar entrenamiento y prueba; con menos se publica el perfil sin evaluación.
MIN_DAYS_FOR_EVAL = 4


def run(arrivals, out: Path, version: str, data_source: str) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    dates = sorted({local_datetime(int(ms)).date() for ms in arrivals["arrived_at"]})
    report: dict = {"data_source": data_source, "days": len(dates), "arrivals": int(len(arrivals))}
    if len(dates) >= MIN_DAYS_FOR_EVAL:
        cut = dates[int(len(dates) * 0.75)]
        local_dates = arrivals["arrived_at"].map(lambda ms: local_datetime(int(ms)).date())
        train, test = arrivals[local_dates < cut], arrivals[local_dates >= cut]
        report.update(train_days=len([d for d in dates if d < cut]), test_days=len([d for d in dates if d >= cut]))
    else:
        train, test = arrivals, None
        report.update(train_days=len(dates), test_days=0, note=f"menos de {MIN_DAYS_FOR_EVAL} días: perfil sin evaluación")
    profile = build_profiles(train, data_source, version)
    report.update(profile_bytes=len(json.dumps(profile, separators=(",", ":"))), pairs=len(profile["entries"]))
    if test is not None:
        report["evaluation"] = evaluate_offline(profile, test, line_baseline_headway(train))
    (out / "profiles.json").write_text(json.dumps(profile, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "offline-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--synthetic", action="store_true", help="datos SINTÉTICOS (nunca publicables)")
    p.add_argument("--arrivals", help="arrivals.csv/.parquet exportado de Supabase (datos reales)")
    p.add_argument("--out", required=True)
    p.add_argument("--version", default="dev")
    a = p.parse_args()
    if a.synthetic == bool(a.arrivals):
        raise SystemExit("Indicá --synthetic o --arrivals <archivo> (uno solo).")
    arrivals, source = (generate_arrivals(), "synthetic") if a.synthetic else (read_table(a.arrivals), "real")
    print(json.dumps(run(arrivals, Path(a.out), a.version, source), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
