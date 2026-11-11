"""Genera un artefacto chico (SINTÉTICO) para los tests de paridad del evaluador TS.

    python -m bondi_ml.make_fixture ../features/prediction/lib/__fixtures__/model-synthetic.json
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

from .synthetic import generate
from .train import run


def main(dest: str) -> None:
    obs, arr = generate(days=14, seed=11)
    with tempfile.TemporaryDirectory(dir=Path(dest).parent) as tmp:
        report = run(obs, arr, Path(tmp), "fixture-synthetic", parity_n=30, lgbm_params={"n_estimators": 25, "num_leaves": 7}, force_model="lightgbm")
        if report["chosen"] != "lightgbm":
            raise SystemExit("El fixture debe ejercitar el evaluador de árboles (se eligió otro modelo)")
        shutil.copy(Path(tmp) / "model.json", dest)
    print(f"fixture escrito en {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
