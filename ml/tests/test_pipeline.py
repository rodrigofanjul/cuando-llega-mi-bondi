from __future__ import annotations

import json
from datetime import date

import numpy as np
import pandas as pd
import pytest

from bondi_ml import dataset as ds
from bondi_ml.calendar import day_type, is_fixed_national_holiday
from bondi_ml.export import compact_trees, evaluate_trees
from bondi_ml.gate import evaluate_gate
from bondi_ml.metrics import coverage, point_metrics
from bondi_ml.models import BaselineModel, BiasTableModel, LightGBMModel, calibrate_interval
from bondi_ml.synthetic import generate
from bondi_ml.train import run


@pytest.fixture(scope="module")
def synthetic():
    return generate(days=14, seed=3)


@pytest.fixture(scope="module")
def built(synthetic):
    obs, arr = synthetic
    return ds.build(obs, arr)


def test_calendar_only_fixed_holidays():
    assert is_fixed_national_holiday(date(2026, 7, 9))
    assert not is_fixed_national_holiday(date(2026, 7, 10))
    assert day_type(date(2026, 12, 25)) == "holiday"
    assert day_type(date(2026, 11, 14)) == "saturday"
    assert day_type(date(2026, 11, 15)) == "sunday"
    assert day_type(date(2026, 11, 11)) == "weekday"


def test_synthetic_is_labeled(synthetic):
    obs, arr = synthetic
    assert set(obs["data_source"]) == {"synthetic"}
    assert set(arr["data_source"]) == {"synthetic"}


def test_cleaning_removes_duplicates_and_invalid(built):
    _, _, report = built
    assert report.duplicates_removed > 0
    assert report.rows > 1000
    assert report.data_sources == ["synthetic"]


def test_low_confidence_arrivals_are_excluded():
    obs = pd.DataFrame(
        [{"observed_at": 0, "stop_id": "S", "line_code": "L", "vehicle_id": "V", "eta_minutes": 5, "eta_status": "minutes", "deviation_minutes": 0, "data_source": "synthetic"}]
    )
    arr = pd.DataFrame([{"stop_id": "S", "line_code": "L", "vehicle_id": "V", "arrived_at": 300_000, "confidence": "low"}])
    matched, unmatched, _ = ds.attach_arrivals(obs, arr)
    assert len(matched) == 0 and unmatched == 1
    arr.loc[0, "confidence"] = "high"
    matched, _, _ = ds.attach_arrivals(obs, arr)
    assert matched.iloc[0]["target_minutes"] == 5


def test_matches_first_arrival_after_observation():
    obs = pd.DataFrame(
        [{"observed_at": 0, "stop_id": "S", "line_code": "L", "vehicle_id": "V", "eta_minutes": 5, "eta_status": "minutes", "deviation_minutes": 0, "data_source": "x"}]
    )
    arr = pd.DataFrame(
        [
            {"stop_id": "S", "line_code": "L", "vehicle_id": "V", "arrived_at": -60_000, "confidence": "high"},  # viaje anterior
            {"stop_id": "S", "line_code": "L", "vehicle_id": "V", "arrived_at": 360_000, "confidence": "high"},
            {"stop_id": "S", "line_code": "L", "vehicle_id": "V", "arrived_at": 900_000, "confidence": "high"},
        ]
    )
    matched, _, _ = ds.attach_arrivals(obs, arr)
    assert matched.iloc[0]["target_minutes"] == 6


def test_chronological_split_has_no_overlap(built):
    data, _, _ = built
    tr, va, te = ds.chronological_split(data)
    assert max(tr["arrival_date"]) < min(va["arrival_date"]) <= max(va["arrival_date"]) < min(te["arrival_date"])
    assert len(tr) + len(va) + len(te) == len(data)


def test_models_beat_baseline_on_known_bias(built):
    data, _, _ = built
    tr, va, te = ds.chronological_split(data)
    base = point_metrics(te["target_minutes"], BaselineModel().predict(te))
    bias = point_metrics(te["target_minutes"], BiasTableModel().fit(tr).predict(te))
    lgbm = point_metrics(te["target_minutes"], LightGBMModel().fit(tr).predict(te))
    assert bias["mae"] < base["mae"]
    assert lgbm["mae"] < base["mae"] * 0.9


def test_interval_calibration_reaches_nominal_coverage(built):
    data, _, _ = built
    tr, va, te = ds.chronological_split(data)
    m = LightGBMModel().fit(tr)
    interval = calibrate_interval(va["target_minutes"].to_numpy(), m.predict(va), va["eta_minutes"].to_numpy())
    low, high = interval.apply(m.predict(te), te["eta_minutes"].to_numpy())
    assert 0.83 <= coverage(te["target_minutes"].to_numpy(), low, high) <= 0.96


def test_tree_export_matches_lightgbm(built):
    data, _, _ = built
    tr, _, te = ds.chronological_split(data)
    m = LightGBMModel().fit(tr)
    trees = compact_trees(m.booster)
    x = te[list(ds.FEATURES)].to_numpy(dtype=float)[:200]
    expected = m.booster.predict(x)
    got = np.array([evaluate_trees(trees, list(row)) for row in x])
    assert np.allclose(got, expected, atol=1e-9)


def test_gate_rules():
    good = {"val": {"mae": 1.0, "within_2min": 0.8, "n": 3000}, "test": {"mae": 1.0, "within_2min": 0.8, "n": 3000}}
    base = {"val": {"mae": 1.5, "within_2min": 0.75, "n": 3000}, "test": {"mae": 1.5, "within_2min": 0.75, "n": 3000}}
    assert evaluate_gate(["real"], base, good, 0.9).publishable
    assert not evaluate_gate(["synthetic"], base, good, 0.9).publishable
    small_gain = {s: {**good[s], "mae": 1.45} for s in good}
    assert not evaluate_gate(["real"], base, small_gain, 0.9).publishable
    assert not evaluate_gate(["real"], base, good, 0.7).publishable
    worse_window = {s: {**good[s], "within_2min": 0.7} for s in good}
    assert not evaluate_gate(["real"], base, worse_window, 0.9).publishable


def test_end_to_end_run_never_publishes_synthetic(tmp_path, synthetic):
    obs, arr = synthetic
    report = run(obs, arr, tmp_path, "test")
    assert report["gate"]["publishable"] is False
    artifact = json.loads((tmp_path / "model.json").read_text(encoding="utf-8"))
    assert artifact["data_source"] == "synthetic"
    assert artifact["gate"]["publishable"] is False
    assert len(artifact["parity_cases"]) > 0
    assert (tmp_path / "report.md").exists()
