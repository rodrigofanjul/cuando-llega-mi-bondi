"""Fixture SINTÉTICO de perfiles offline + casos esperados para la paridad del evaluador TS.

    python -m bondi_ml.make_offline_fixture ../features/offline/lib/__fixtures__/profiles-synthetic.json
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from .profiles import build_profiles, estimate
from .synthetic import generate_arrivals

TZ = "America/Argentina/Buenos_Aires"


def main(dest: str) -> None:
    arr = generate_arrivals(days=28, seed=21, stops=("A-S1",), lines=("A",))
    profile = build_profiles(arr, "synthetic", "fixture-offline")
    times = [
        "2026-11-11 08:07", "2026-11-11 11:40", "2026-11-11 18:20", "2026-11-11 23:55", "2026-11-11 03:00",
        "2026-11-14 10:10", "2026-11-15 12:00", "2026-07-09 09:00", "2026-11-11 00:05",
    ]
    cases = []
    for t in times:
        ms = int(pd.Timestamp(t, tz=TZ).timestamp() * 1000)
        for stop, line in (("A-S1", "A"), ("X", "A")):
            est = estimate(profile, stop, line, ms)
            cases.append({"stop": stop, "line": line, "epoch": ms, "expected": list(est) if est else None})
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump({"profile": profile, "cases": cases}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{dest}: {len(cases)} casos, {sum(c['expected'] is not None for c in cases)} con estimación")


if __name__ == "__main__":
    main(sys.argv[1])
