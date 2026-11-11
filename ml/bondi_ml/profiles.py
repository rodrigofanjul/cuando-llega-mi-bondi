"""Perfiles estadísticos para el motor OFFLINE (Fase 9, versión estadística).

Para cada (parada, línea, tipo de día, franja de 15 min) se guardan cuantiles del
intervalo entre llegadas consecutivas (p10/p50/p90) a partir de llegadas inferidas
con confianza alta/media. Sin conexión, la espera hasta el próximo colectivo se
estima con incidencia aleatoria: mediana ≈ p50/2, rango [0, p90].

Sólo variables disponibles localmente: fecha/hora local, tipo de día (calendario
versionado), parada y línea. Nada de datos en vivo.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .calendar import CALENDAR_VERSION, day_type, local_datetime

BIN_MIN = 15
MIN_DAYS = 5
MIN_HEADWAYS = 10
MAX_HEADWAY_MIN = 90  # descarta huecos de servicio (noche, cortes)
PROFILE_SCHEMA = 1


def _num(v: float):
    """Entero si es entero (8.0 → 8): Python y JS serializan igual → mismo checksum."""
    r = round(float(v), 1)
    return int(r) if r == int(r) else r


def offline_day_type(d) -> str:
    """Tipos de día del perfil: hábil, sábado, domingo/feriado."""
    t = day_type(d)
    return "sunday_holiday" if t in ("sunday", "holiday") else t


def arrival_frame(arrivals: pd.DataFrame, allowed=("high", "medium")) -> pd.DataFrame:
    a = arrivals[arrivals["confidence"].isin(allowed)].copy()
    local = a["arrived_at"].map(lambda ms: local_datetime(int(ms)))
    a["date"] = local.map(lambda d: d.date())
    a["minute"] = local.map(lambda d: d.hour * 60 + d.minute)
    a["day_type"] = a["date"].map(offline_day_type)
    return a.sort_values("arrived_at")


def headways(a: pd.DataFrame) -> pd.DataFrame:
    """Intervalos entre llegadas consecutivas de la misma parada/línea en el mismo día."""
    rows = []
    for (stop, line, date), g in a.groupby(["stop_id", "line_code", "date"]):
        t = g["arrived_at"].to_numpy()
        m = g["minute"].to_numpy()
        for i in range(1, len(t)):
            h = (t[i] - t[i - 1]) / 60_000
            if 0 < h <= MAX_HEADWAY_MIN:
                rows.append({"stop_id": stop, "line_code": line, "date": date, "day_type": g["day_type"].iloc[i], "bin": int(m[i] // BIN_MIN), "headway": h})
    return pd.DataFrame(rows)


def build_profiles(arrivals: pd.DataFrame, data_source: str, version: str) -> dict:
    hw = headways(arrival_frame(arrivals))
    entries: dict[str, dict[str, list]] = {}
    for (stop, line, dt, b), g in hw.groupby(["stop_id", "line_code", "day_type", "bin"]):
        if g["date"].nunique() < MIN_DAYS or len(g) < MIN_HEADWAYS:
            continue
        q = np.quantile(g["headway"], [0.1, 0.5, 0.9])
        entries.setdefault(f"{stop}|{line}", {}).setdefault(dt, []).append(
            {"bin": int(b), "n": int(len(g)), "days": int(g["date"].nunique()), "p10": _num(q[0]), "p50": _num(q[1]), "p90": _num(q[2])}
        )
    for per_type in entries.values():
        for bins in per_type.values():
            bins.sort(key=lambda x: x["bin"])
    canonical = json.dumps(entries, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return {
        "schema_version": PROFILE_SCHEMA,
        "profile_version": version,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_source": data_source,
        "calendar_version": CALENDAR_VERSION,
        "bin_minutes": BIN_MIN,
        "entries": entries,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def round_half_up(x: float) -> int:
    """Redondeo «mitad hacia arriba», igual que Math.round de JS (round() de Python es bancario)."""
    return int(math.floor(x + 0.5))


def estimate(profile: dict, stop: str, line: str, epoch_ms: int):
    """(mediana, bajo, alto) en minutos o None si no hay soporte. Misma lógica que el evaluador TS."""
    local = local_datetime(epoch_ms)
    bins = profile["entries"].get(f"{stop}|{line}", {}).get(offline_day_type(local.date()), [])
    b = (local.hour * 60 + local.minute) // profile["bin_minutes"]
    for candidate in (b, b - 1, b + 1):  # franja exacta y vecinas
        hit = next((x for x in bins if x["bin"] == candidate), None)
        if hit:
            return round_half_up(hit["p50"] / 2), 0, round_half_up(hit["p90"])
    return None


def evaluate_offline(profile: dict, test_arrivals: pd.DataFrame, baseline_headway: dict, horizons_h=(1, 6, 12, 24, 72), seed: int = 5) -> dict:
    """Simula consultas sin conexión en el período de prueba.

    Para cada consulta en t, la verdad es la espera hasta la próxima llegada real.
    `horizons_h`: horas desde la última sincronización (el perfil no cambia, así que
    mide si la calidad depende de cuándo se consulta dentro de la ventana).
    Baseline: frecuencia media de la línea (espera H/2, rango [0, H]).
    """
    a = arrival_frame(test_arrivals)
    rng = np.random.default_rng(seed)
    start = int(a["arrived_at"].min())
    results = {}
    for h in horizons_h:
        errs, covered, base_errs, base_cov, missing = [], 0, [], 0, 0
        for (stop, line), g in a.groupby(["stop_id", "line_code"]):
            t_arr = g["arrived_at"].to_numpy()
            queries = start + h * 3_600_000 + rng.integers(0, 3 * 86_400_000, size=40)
            for q in queries:
                nxt = t_arr[t_arr > q]
                if len(nxt) == 0 or (nxt[0] - q) > MAX_HEADWAY_MIN * 60_000:
                    continue
                truth = (nxt[0] - q) / 60_000
                est = estimate(profile, stop, line, int(q))
                H = baseline_headway.get(line)
                if H:
                    base_errs.append(abs(H / 2 - truth))
                    base_cov += int(truth <= H)
                if est is None:
                    missing += 1
                    continue
                med, lo, hi = est
                errs.append(abs(med - truth))
                covered += int(lo <= truth <= hi)
        n = len(errs)
        results[f"{h}h"] = {
            "n": n,
            "sin_soporte": missing,
            "mae": float(np.mean(errs)) if n else None,
            "cobertura": covered / n if n else None,
            "baseline_mae": float(np.mean(base_errs)) if base_errs else None,
            "baseline_cobertura": base_cov / len(base_errs) if base_errs else None,
        }
    return results


def line_baseline_headway(arrivals: pd.DataFrame) -> dict:
    hw = headways(arrival_frame(arrivals))
    return {line: float(g["headway"].median()) for line, g in hw.groupby("line_code")}
