from __future__ import annotations

import hashlib
import json

import pandas as pd
import pytest

from bondi_ml.profiles import MIN_DAYS, build_profiles, estimate, evaluate_offline, line_baseline_headway, offline_day_type
from bondi_ml.synthetic import generate_arrivals
from bondi_ml.offline_eval import run


@pytest.fixture(scope="module")
def arrivals():
    return generate_arrivals(days=21, seed=3)


def test_day_types():
    from datetime import date

    assert offline_day_type(date(2026, 11, 11)) == "weekday"
    assert offline_day_type(date(2026, 11, 14)) == "saturday"
    assert offline_day_type(date(2026, 11, 15)) == "sunday_holiday"
    assert offline_day_type(date(2026, 7, 9)) == "sunday_holiday"  # feriado inamovible


def test_profile_is_versioned_and_checksummed(arrivals):
    p = build_profiles(arrivals, "synthetic", "t1")
    canonical = json.dumps(p["entries"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    assert p["sha256"] == hashlib.sha256(canonical.encode()).hexdigest()
    assert p["data_source"] == "synthetic" and p["schema_version"] == 1
    for per_type in p["entries"].values():
        for bins in per_type.values():
            for b in bins:
                assert b["days"] >= MIN_DAYS and b["p10"] <= b["p50"] <= b["p90"]


def test_peak_headways_shorter_than_off_peak(arrivals):
    p = build_profiles(arrivals, "synthetic", "t1")
    bins = {b["bin"]: b for b in p["entries"]["A-S1|A"]["weekday"]}
    assert bins[8 * 4]["p50"] < bins[11 * 4]["p50"]  # 08:00 pico vs 11:00 valle


def test_estimate_and_insufficient_support(arrivals):
    p = build_profiles(arrivals, "synthetic", "t1")
    wed_0815 = int(pd.Timestamp("2026-11-11 08:15", tz="America/Argentina/Buenos_Aires").timestamp() * 1000)
    med, lo, hi = estimate(p, "A-S1", "A", wed_0815)
    assert lo == 0 and 0 < med <= hi
    assert estimate(p, "NOPE", "A", wed_0815) is None
    wed_0300 = wed_0815 - 5 * 3_600_000 - 15 * 60_000
    assert estimate(p, "A-S1", "A", wed_0300) is None  # madrugada sin servicio


def test_offline_beats_frequency_baseline():
    arr = generate_arrivals(days=28, seed=9)
    cut = arr["arrived_at"].quantile(0.75)
    p = build_profiles(arr[arr["arrived_at"] < cut], "synthetic", "t")
    res = evaluate_offline(p, arr[arr["arrived_at"] >= cut], line_baseline_headway(arr[arr["arrived_at"] < cut]), horizons_h=(1, 24))
    for h in ("1h", "24h"):
        assert res[h]["mae"] < res[h]["baseline_mae"]
        assert res[h]["cobertura"] >= 0.85


def test_cli_run_writes_report(tmp_path):
    report = run(generate_arrivals(days=21, seed=4), tmp_path, "t", "synthetic")
    assert (tmp_path / "profiles.json").exists() and report["data_source"] == "synthetic"
    assert set(report["evaluation"]) == {"1h", "6h", "12h", "24h", "72h"}


def test_real_export_csv_roundtrip(tmp_path):
    """Formato de scripts/export-arrival-history.mjs → perfiles con data_source=real."""
    from bondi_ml.io import read_table

    src = generate_arrivals(days=10).drop(columns=["data_source"])
    src["method"] = "arriving_status"
    csv = tmp_path / "arrivals.csv"
    src.to_csv(csv, index=False)
    df = read_table(csv)
    assert df["arrived_at"].dtype == "int64" and (df["data_source"] == "real").all()
    report = run(df, tmp_path / "out", "t", "real")
    assert report["data_source"] == "real" and report["pairs"] > 0 and "evaluation" in report
    profile = json.loads((tmp_path / "out" / "profiles.json").read_text(encoding="utf-8"))
    assert profile["data_source"] == "real"


def test_few_days_publishes_profile_without_evaluation(tmp_path):
    report = run(generate_arrivals(days=2), tmp_path, "t", "real")
    assert report["test_days"] == 0 and "evaluation" not in report and "note" in report
