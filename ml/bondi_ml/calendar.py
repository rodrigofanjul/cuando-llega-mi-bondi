"""Calendario local para variables de entrenamiento.

Sólo incluye los feriados nacionales INAMOVIBLES (Ley 27.399, art. 1). Los
trasladables, provinciales, municipales, vacaciones escolares y temporada
turística NO están cargados: sus fechas cambian por decreto cada año y no se
inventan. Ver docs/blockers.md (calendario versionado pendiente de fuente).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

AR_TZ = timezone(timedelta(hours=-3))  # Argentina: UTC−3 sin horario de verano

# (mes, día) de feriados nacionales inamovibles.
FIXED_NATIONAL_HOLIDAYS: frozenset[tuple[int, int]] = frozenset(
    {
        (1, 1),  # Año Nuevo
        (3, 24),  # Día Nacional de la Memoria por la Verdad y la Justicia
        (4, 2),  # Día del Veterano y de los Caídos en la Guerra de Malvinas
        (5, 1),  # Día del Trabajador
        (5, 25),  # Día de la Revolución de Mayo
        (6, 20),  # Paso a la Inmortalidad del Gral. Manuel Belgrano
        (7, 9),  # Día de la Independencia
        (12, 8),  # Inmaculada Concepción de María
        (12, 25),  # Navidad
    }
)

CALENDAR_VERSION = "ar-fixed-national-v1"


def local_datetime(epoch_ms: int) -> datetime:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=AR_TZ)


def is_fixed_national_holiday(d: date) -> bool:
    return (d.month, d.day) in FIXED_NATIONAL_HOLIDAYS


def day_type(d: date) -> str:
    """'holiday' | 'sunday' | 'saturday' | 'weekday' (feriado domina)."""
    if is_fixed_national_holiday(d):
        return "holiday"
    wd = d.weekday()  # 0 = lunes
    if wd == 6:
        return "sunday"
    if wd == 5:
        return "saturday"
    return "weekday"
