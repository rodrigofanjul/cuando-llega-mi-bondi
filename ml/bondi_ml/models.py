"""Modelos candidatos. Todos predicen MINUTOS HASTA LA LLEGADA.

- `baseline`: el ETA municipal tal cual (referencia obligatoria).
- `bias_table`: factor real/oficial por (línea, hora) con contracción hacia 1.
- `lightgbm`: gradient boosting sobre el RESIDUO (real − oficial); si no aporta,
  la predicción vuelve a ser la oficial.

XGBoost no se incluye: con estas variables no aporta frente a LightGBM y suma
otra dependencia (se reevalúa con datos reales).
Intervalos: conformal por división (residuos de validación normalizados por
horizonte), sin suponer distribución.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import lightgbm as lgb
import numpy as np
import pandas as pd

from .dataset import FEATURES


def scale(eta: np.ndarray) -> np.ndarray:
    """Escala de incertidumbre: crece con el horizonte."""
    return 1.0 + 0.1 * np.asarray(eta, dtype=float)


@dataclass
class Interval:
    q_low: float
    q_high: float
    nominal: float

    def apply(self, pred: np.ndarray, eta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        s = scale(eta)
        return np.maximum(0, pred + self.q_low * s), pred + self.q_high * s


def calibrate_interval(y_val: np.ndarray, pred_val: np.ndarray, eta_val: np.ndarray, nominal: float = 0.9) -> Interval:
    r = (y_val - pred_val) / scale(eta_val)
    alpha = (1 - nominal) / 2
    return Interval(float(np.quantile(r, alpha)), float(np.quantile(r, 1 - alpha)), nominal)


class BaselineModel:
    name = "baseline"

    def fit(self, df: pd.DataFrame) -> "BaselineModel":
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return df["eta_minutes"].to_numpy(dtype=float)


@dataclass
class BiasTableModel:
    shrink: float = 30.0
    name: str = "bias_table"
    table: dict[str, float] = field(default_factory=dict)

    @staticmethod
    def key(line_idx: int, hour: int) -> str:
        return f"{int(line_idx)}|{int(hour)}"

    def fit(self, df: pd.DataFrame) -> "BiasTableModel":
        ratio = df["target_minutes"] / df["eta_minutes"].clip(lower=1)
        grouped = pd.DataFrame({"k": [self.key(l, h) for l, h in zip(df["line_idx"], df["hour"])], "r": ratio}).groupby("k")["r"]
        med, n = grouped.median(), grouped.size()
        # Contracción hacia 1 (sin corrección) cuando hay pocas observaciones.
        self.table = {k: float(1 + (med[k] - 1) * n[k] / (n[k] + self.shrink)) for k in med.index}
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        factors = np.array([self.table.get(self.key(l, h), 1.0) for l, h in zip(df["line_idx"], df["hour"])])
        return df["eta_minutes"].to_numpy(dtype=float) * factors


@dataclass
class LightGBMModel:
    name: str = "lightgbm"
    params: dict = field(
        default_factory=lambda: {
            "n_estimators": 150,
            "learning_rate": 0.05,
            "num_leaves": 15,
            "min_child_samples": 40,
            "subsample": 0.8,
            "subsample_freq": 1,
            "colsample_bytree": 0.9,
            "objective": "huber",
            "random_state": 7,
            "verbose": -1,
        }
    )
    booster: lgb.Booster | None = None

    def fit(self, df: pd.DataFrame) -> "LightGBMModel":
        model = lgb.LGBMRegressor(**self.params)
        model.fit(df[list(FEATURES)], df["target_minutes"] - df["eta_minutes"])
        self.booster = model.booster_
        return self

    def residual(self, df: pd.DataFrame) -> np.ndarray:
        assert self.booster is not None
        return self.booster.predict(df[list(FEATURES)].to_numpy(dtype=float))

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return np.maximum(0, df["eta_minutes"].to_numpy(dtype=float) + self.residual(df))
