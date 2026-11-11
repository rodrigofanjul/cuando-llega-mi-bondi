"""Puerta de publicación de modelos.

Criterios predefinidos (no se ajustan después de ver resultados):
1. Datos REALES: un modelo entrenado con datos sintéticos nunca se publica.
2. MAE ≥ 10 % menor que el ETA municipal en validación Y en prueba.
3. % dentro de ±2 min ≥ al del ETA municipal en validación Y en prueba.
4. Cobertura del intervalo nominal 90 % entre 85 % y 95 % en prueba.
5. Mínimo de 2.000 observaciones en prueba.
Si no pasa, la app usa el ETA oficial (fallback automático).
"""

from __future__ import annotations

from dataclasses import dataclass, field

MIN_MAE_IMPROVEMENT = 0.10
COVERAGE_RANGE = (0.85, 0.95)
MIN_TEST_ROWS = 2000


@dataclass
class GateDecision:
    publishable: bool
    reasons: list[str] = field(default_factory=list)


def evaluate_gate(data_sources: list[str], baseline: dict[str, dict], candidate: dict[str, dict], test_coverage: float) -> GateDecision:
    reasons: list[str] = []
    if any(src != "real" for src in data_sources):
        reasons.append(f"datos no reales ({', '.join(data_sources)}): no publicable")
    for split in ("val", "test"):
        b, c = baseline[split], candidate[split]
        improvement = (b["mae"] - c["mae"]) / b["mae"] if b["mae"] > 0 else 0.0
        if improvement < MIN_MAE_IMPROVEMENT:
            reasons.append(f"{split}: mejora de MAE {improvement:.1%} < {MIN_MAE_IMPROVEMENT:.0%}")
        if c["within_2min"] < b["within_2min"]:
            reasons.append(f"{split}: ±2 min {c['within_2min']:.1%} < municipal {b['within_2min']:.1%}")
    lo, hi = COVERAGE_RANGE
    if not (lo <= test_coverage <= hi):
        reasons.append(f"cobertura del intervalo {test_coverage:.1%} fuera de [{lo:.0%}, {hi:.0%}]")
    if candidate["test"]["n"] < MIN_TEST_ROWS:
        reasons.append(f"prueba con {candidate['test']['n']} filas < {MIN_TEST_ROWS}")
    return GateDecision(publishable=not reasons, reasons=reasons)
