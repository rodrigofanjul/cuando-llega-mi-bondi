"""Entrenamiento y evaluación de punta a punta.

    python -m bondi_ml.train --synthetic --out artifacts/runs/demo
    python -m bondi_ml.train --observations obs.parquet --arrivals arr.parquet --out ...

Genera: report.json, report.md y model.json (artefacto, con el veredicto de la
puerta de publicación). Con datos sintéticos el veredicto es siempre "no publicable".
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import dataset as ds
from .export import build_artifact, compact_trees, write_json
from .gate import evaluate_gate
from .metrics import by_group, coverage, hour_band, point_metrics
from .models import BaselineModel, BiasTableModel, LightGBMModel, calibrate_interval
from .synthetic import generate


def run(obs: pd.DataFrame, arr: pd.DataFrame, out: Path, model_version: str, parity_n: int = 25, lgbm_params: dict | None = None, force_model: str | None = None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    data, maps, ds_report = ds.build(obs, arr)
    data["hour_band"] = data["hour"].map(hour_band)
    train, val, test = ds.chronological_split(data)

    lgbm = LightGBMModel()
    if lgbm_params:
        lgbm.params.update(lgbm_params)
    models = {m.name: m.fit(train) for m in (BaselineModel(), BiasTableModel(), lgbm)}
    results: dict[str, dict] = {}
    for name, m in models.items():
        results[name] = {split: point_metrics(df["target_minutes"].to_numpy(), m.predict(df)) for split, df in (("val", val), ("test", test))}

    # Elegido = mejor MAE de validación entre los candidatos (nunca se mira prueba para elegir).
    chosen_name = force_model or min(("bias_table", "lightgbm"), key=lambda n: results[n]["val"]["mae"])
    chosen = models[chosen_name]
    interval = calibrate_interval(val["target_minutes"].to_numpy(), chosen.predict(val), val["eta_minutes"].to_numpy())
    test_pred = chosen.predict(test)
    low, high = interval.apply(test_pred, test["eta_minutes"].to_numpy())
    test_cov = coverage(test["target_minutes"].to_numpy(), low, high)

    gate = evaluate_gate(ds_report.data_sources, results["baseline"], results[chosen_name], test_cov)
    breakdown = {
        "by_line": {"baseline": by_group(test, models["baseline"].predict(test), "line_code"), chosen_name: by_group(test, test_pred, "line_code")},
        "by_hour_band": {"baseline": by_group(test, models["baseline"].predict(test), "hour_band"), chosen_name: by_group(test, test_pred, "hour_band")},
        "by_stop": {chosen_name: by_group(test, test_pred, "stop_id")},
    }
    report = {
        "model_version": model_version,
        "dataset": ds_report.__dict__,
        "splits": {"train": len(train), "val": len(val), "test": len(test)},
        "results": results,
        "chosen": chosen_name,
        "interval": {"nominal": interval.nominal, "test_coverage": test_cov},
        "gate": {"publishable": gate.publishable, "reasons": gate.reasons},
        "breakdown": breakdown,
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    (out / "report.md").write_text(render_markdown(report), encoding="utf-8")

    sample = test.sample(n=min(parity_n, len(test)), random_state=1)
    x = sample[list(ds.FEATURES)].to_numpy(dtype=float)
    artifact = build_artifact(
        kind="lightgbm_residual" if chosen_name == "lightgbm" else "bias_table",
        model_version=model_version,
        data_source=",".join(ds_report.data_sources),
        maps=maps,
        interval=interval,
        metrics={"val": results[chosen_name]["val"], "test": results[chosen_name]["test"], "baseline_test": results["baseline"]["test"], "test_coverage": test_cov},
        gate=gate,
        trees=compact_trees(chosen.booster) if chosen_name == "lightgbm" else None,
        bias_table=chosen.table if chosen_name == "bias_table" else None,
        parity_rows=x,
        parity_expected=chosen.predict(sample),
        parity_raw=[
            {"observed_at": int(r.observed_at), "line_code": str(r.line_code), "stop_id": str(r.stop_id), "deviation_minutes": float(r.deviation_minutes)}
            for r in sample.itertuples()
        ],
    )
    write_json(out / "model.json", artifact)
    return report


def render_markdown(r: dict) -> str:
    lines = [f"# Reporte de modelo `{r['model_version']}`", "", f"Fuente de datos: **{', '.join(r['dataset']['data_sources'])}**", ""]
    lines += ["| Modelo | Split | MAE | RMSE | MedAE | ±2 min | Sesgo |", "|---|---|---|---|---|---|---|"]
    for name, res in r["results"].items():
        for split, m in res.items():
            lines.append(f"| {name} | {split} | {m['mae']:.2f} | {m['rmse']:.2f} | {m['medae']:.2f} | {m['within_2min']:.1%} | {m['bias']:+.2f} |")
    lines += ["", f"Elegido por validación: **{r['chosen']}**. Cobertura intervalo {r['interval']['nominal']:.0%} en prueba: {r['interval']['test_coverage']:.1%}.", ""]
    verdict = "PUBLICABLE" if r["gate"]["publishable"] else "NO PUBLICABLE"
    lines += [f"## Puerta de publicación: {verdict}", ""] + [f"- {x}" for x in r["gate"]["reasons"]]
    return "\n".join(lines) + "\n"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--synthetic", action="store_true", help="usar datos SINTÉTICOS (nunca publicables)")
    p.add_argument("--observations")
    p.add_argument("--arrivals")
    p.add_argument("--out", required=True)
    p.add_argument("--model-version", default="dev")
    p.add_argument("--days", type=int, default=28)
    a = p.parse_args()
    if a.synthetic:
        obs, arr = generate(days=a.days)
    else:
        obs, arr = pd.read_parquet(a.observations), pd.read_parquet(a.arrivals)
        obs["data_source"] = "real"
    report = run(obs, arr, Path(a.out), a.model_version)
    print(render_markdown(report))


if __name__ == "__main__":
    np.seterr(all="ignore")
    main()
