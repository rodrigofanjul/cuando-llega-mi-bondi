# Pipeline de predicción de arribos (offline)

Entrena y evalúa modelos que **corrigen el ETA municipal**. La inferencia corre en la app (TypeScript) a
partir de un artefacto JSON compacto; no hay servicio de ML aparte.

> **Estado:** sin datos reales todavía (blocker B1). Todo lo que se entrena hoy usa datos **SINTÉTICOS**
> (`data_source = "synthetic"`), que la puerta de publicación rechaza siempre y la API nunca usa en producción.

## Uso

```bash
python -m venv ml/.venv && ml/.venv/Scripts/pip install -r ml/requirements.txt   # Windows
cd ml
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m bondi_ml.train --synthetic --out artifacts/runs/demo
# Con datos reales exportados de Supabase (arrival_observations + inferred_arrivals):
.venv/Scripts/python -m bondi_ml.train --observations obs.parquet --arrivals arr.parquet --out artifacts/runs/<fecha> --model-version <v>
```

Salidas: `report.md`, `report.json` (métricas globales y por línea, franja horaria y parada) y `model.json`
(artefacto con veredicto de publicación y casos de paridad).

## Etapas

| Etapa | Módulo | Detalle |
| ----- | ------ | ------- |
| Limpieza | `dataset.clean_observations` | Duplicados, ETA fuera de 1–60 min, estados no numéricos, unidades sin id. |
| Emparejamiento | `dataset.attach_arrivals` | Primera llegada posterior de la misma unidad en la parada (≤ 60 min). Sólo llegadas `high`/`medium`; `low` se excluye. |
| Inconsistencias | idem | Descarta pares con diferencia oficial-real > 40 min. |
| Variables | `dataset.add_features` | ETA oficial, hora (sin/cos), día, fin de semana, feriado inamovible, línea, parada, desvío. **Sólo variables disponibles al inferir.** |
| Split | `dataset.chronological_split` | Por fecha de llegada (70/15/15): ningún viaje queda entre dos conjuntos. |
| Modelos | `models.py` | Baseline municipal, tabla de sesgo (línea×hora, con contracción) y LightGBM sobre el residuo. Elección por validación. |
| Intervalos | `models.calibrate_interval` | Conformal por división con residuos de validación normalizados por horizonte. |
| Métricas | `metrics.py` | MAE, RMSE, error absoluto mediano, % dentro de ±2 min, sesgo, cobertura; por línea, franja y parada. |
| Puerta | `gate.py` | Datos reales; −10 % MAE y ±2 min ≥ municipal en validación **y** prueba; cobertura 85–95 %; ≥ 2.000 filas de prueba. |
| Exportación | `export.py` | Árboles compactos; `evaluate_trees` replica el evaluador TS. |

## Inferencia en la app

`features/prediction/lib/model.ts` + `GET /api/predict?stopId&lineCode&eta[&deviation]`. Con
`PREDICTION_MODEL_PATH` apuntando a un artefacto **publicable y real** devuelve ETA corregido, intervalo,
versión y timestamp; en cualquier otro caso, el ETA oficial y el motivo (`fallbackReason`).

Paridad Python ↔ TS: `features/prediction/lib/__fixtures__/model-synthetic.json` (regenerar con
`python -m bondi_ml.make_fixture ../features/prediction/lib/__fixtures__/model-synthetic.json`).

## Decisiones

- **XGBoost** no se incluye: con estas variables no aporta frente a LightGBM y suma una dependencia. Se reevalúa con datos reales.
- **«Sesgo reciente de la línea»** como variable queda para cuando exista ingesta en vivo (hoy no está disponible al inferir).
- **Calendario:** sólo feriados nacionales inamovibles (Ley 27.399). Trasladables, provinciales, municipales,
  vacaciones y temporada requieren una fuente versionada (no se inventan fechas).

## Resultado de referencia (datos SINTÉTICOS, con sesgos inyectados a propósito)

| Modelo | MAE prueba | ±2 min |
| ------ | ---------- | ------ |
| ETA municipal | 1,69 | 75,5 % |
| Tabla de sesgo | 1,48 | 77,5 % |
| LightGBM | 1,39 | 76,1 % |

Sólo demuestra que el pipeline detecta sesgos conocidos; **no dice nada sobre datos reales**.
