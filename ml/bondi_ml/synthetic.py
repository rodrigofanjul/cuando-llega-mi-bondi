"""Generador de datos SINTÉTICOS (no reales) para desarrollar y probar el pipeline.

Cada fila lleva `data_source = "synthetic"`. Un modelo entrenado con estos datos
nunca puede publicarse (ver gate.py). El generador introduce sesgos conocidos
del ETA oficial para comprobar que el pipeline es capaz de detectarlos:

- hora pico (7–9 y 17–19 h): el ETA oficial subestima ~20 %;
- la línea "L3" sobreestima ~10 % en todo horario;
- ruido gaussiano proporcional al horizonte.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .calendar import AR_TZ

DATA_SOURCE = "synthetic"
LINES = ("L1", "L2", "L3")
STOPS_PER_LINE = 4


def _official_bias(hour: int, line: str) -> float:
    """Factor real/oficial: >1 significa que el colectivo tarda más de lo informado."""
    factor = 1.0
    if 7 <= hour < 9 or 17 <= hour < 19:
        factor *= 1.20
    if line == "L3":
        factor *= 0.90
    return factor


def generate(days: int = 28, start: str = "2026-09-01", seed: int = 7, trips_per_hour: int = 3) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve (observaciones, llegadas) con el mismo esquema que Supabase.

    observaciones: observed_at(ms), stop_id, line_code, vehicle_id, eta_minutes,
                   eta_status, deviation_minutes, data_source
    llegadas:      stop_id, line_code, vehicle_id, arrived_at(ms), confidence, data_source
    """
    rng = np.random.default_rng(seed)
    base = pd.Timestamp(start, tz=AR_TZ)
    obs_rows: list[dict] = []
    arr_rows: list[dict] = []
    trip = 0
    for day in range(days):
        day_start = base + pd.Timedelta(days=day)
        for hour in range(6, 23):
            for line in LINES:
                for k in range(trips_per_hour):
                    trip += 1
                    vehicle = f"{line}-{trip % 40}"
                    stop = f"{line}-S{rng.integers(1, STOPS_PER_LINE + 1)}"
                    arrival = day_start + pd.Timedelta(hours=hour, minutes=int(rng.integers(0, 60)))
                    arrived_ms = int(arrival.timestamp() * 1000)
                    # Primera aparición entre 12 y 35 min antes de llegar; se observa cada 1–3 min.
                    t = arrived_ms - int(rng.integers(12, 36)) * 60_000
                    factor = _official_bias(arrival.hour, line)
                    while t < arrived_ms - 30_000:
                        true_remaining = (arrived_ms - t) / 60_000
                        noise = rng.normal(0, 0.6 + 0.08 * true_remaining)
                        official = max(0.0, true_remaining / factor + noise)
                        eta = int(round(official))
                        obs_rows.append(
                            {
                                "observed_at": t,
                                "stop_id": stop,
                                "line_code": line,
                                "vehicle_id": vehicle,
                                "eta_minutes": eta,
                                "eta_status": "arriving" if eta == 0 else "minutes",
                                "deviation_minutes": int(round((factor - 1) * 10)),
                                "data_source": DATA_SOURCE,
                            }
                        )
                        # Duplicados ocasionales (mismo instante) para probar la limpieza.
                        if rng.random() < 0.03:
                            obs_rows.append(dict(obs_rows[-1]))
                        t += int(rng.integers(1, 4)) * 60_000
                    confidence = rng.choice(["high", "medium", "low"], p=[0.75, 0.2, 0.05])
                    jitter = 0 if confidence == "high" else int(rng.normal(0, 60_000 if confidence == "medium" else 240_000))
                    arr_rows.append(
                        {
                            "stop_id": stop,
                            "line_code": line,
                            "vehicle_id": vehicle,
                            "arrived_at": arrived_ms + jitter,
                            "confidence": str(confidence),
                            "data_source": DATA_SOURCE,
                        }
                    )
    return pd.DataFrame(obs_rows), pd.DataFrame(arr_rows)
