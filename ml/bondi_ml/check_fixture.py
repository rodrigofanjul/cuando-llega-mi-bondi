"""Verifica que el fixture TS siga siendo compatible con el pipeline actual.

No compara bit a bit (LightGBM genera umbrales levemente distintos entre
plataformas): comprueba esquema, variables y que los árboles reproduzcan los
casos de paridad con el evaluador de referencia.

    python -m bondi_ml.check_fixture ../features/prediction/lib/__fixtures__/model-synthetic.json
"""

from __future__ import annotations

import json
import sys

from . import SCHEMA_VERSION
from .dataset import FEATURES
from .export import evaluate_trees


def check(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        a = json.load(fh)
    errors: list[str] = []
    if a.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version {a.get('schema_version')} != {SCHEMA_VERSION}")
    if a.get("features") != list(FEATURES):
        errors.append("la lista de variables no coincide con dataset.FEATURES")
    if a.get("data_source") != "synthetic" or a.get("gate", {}).get("publishable"):
        errors.append("el fixture debe ser sintético y no publicable")
    if a.get("kind") != "lightgbm_residual" or not a.get("trees"):
        errors.append("el fixture debe ejercitar el evaluador de árboles")
    cases = a.get("parity_cases", [])
    if len(cases) < 10:
        errors.append("faltan casos de paridad")
    for i, c in enumerate(cases):
        got = max(0.0, c["eta"] + evaluate_trees(a["trees"], c["x"]))
        if abs(got - c["expected"]) > 1e-9:
            errors.append(f"caso {i}: {got} != {c['expected']}")
    return errors


if __name__ == "__main__":
    problems = check(sys.argv[1])
    if problems:
        print("\n".join(problems))
        raise SystemExit(1)
    print("fixture OK")
