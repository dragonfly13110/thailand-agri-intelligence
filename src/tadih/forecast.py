"""Daily single-series baselines with release-aware, revision-preserving backtests."""

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean, median, quantiles


def _time(value):
    raw = str(value)
    result = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if result.tzinfo is None and len(raw) != 10:
        raise ValueError("timestamps require timezone; date-only values mean UTC midnight")
    return (result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result).astimezone(timezone.utc)


def _policy(policy=None):
    result = json.loads((Path(__file__).resolve().parents[2] / "config" / "models.json").read_text())
    if policy:
        result.update(policy)
    return result


def _validate(records):
    identity = None
    seen = {}
    fields = ("series_id", "source_id", "unit", "area_code", "commodity_id", "market_id", "price_type", "grade")
    for row in records:
        if not isinstance(row, dict):
            raise ValueError("observation must be an object")
        if not all(row.get(key) for key in ("series_id", "source_id", "unit")):
            raise ValueError("series_id, source_id and unit are required")
        current = tuple(row.get(key) for key in fields)
        if identity is not None and current != identity:
            raise ValueError("mixed series, units, sources or market definitions")
        identity = current
        if row.get("data_kind") not in {"observed", "official"}:
            raise ValueError("verification requires observed or official records, not forecast/scenario/unknown")
        if not row.get("observed_at") or not row.get("release_at"):
            raise ValueError("observed_at and known release_at are required")
        observed, released = _time(row["observed_at"]), _time(row["release_at"])
        if observed.time() != datetime.min.time():
            raise ValueError("daily observations must use dates or midnight UTC")
        if released < observed:
            raise ValueError("release_at precedes observed_at")
        value = row.get("value")
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise ValueError("non-finite or non-numeric observation")
        key = (observed, released)
        if key in seen and seen[key] != value:
            raise ValueError("ambiguous revisions with the same release_at")
        seen[key] = value


def available_history(records: list[dict], issue_at: str) -> list[dict]:
    """Latest revision actually available at issue time, including explicit missing revisions."""
    _validate(records)
    cutoff = _time(issue_at)
    by_date = {}
    for row in records:
        observed, released = _time(row["observed_at"]), _time(row["release_at"])
        if observed <= cutoff and released <= cutoff:
            previous = by_date.get(observed)
            if previous is None or _time(previous["release_at"]) < released:
                by_date[observed] = row
    return [by_date[key].copy() for key in sorted(by_date)]


def _history_gate(history, issue_at, policy):
    valid = [row for row in history if row.get("value") is not None]
    if len(valid) < policy["minimum_history"]:
        return "insufficient_history"
    start = _time(history[0]["observed_at"]).date()
    expected = (_time(issue_at).date() - start).days + 1
    if expected <= 0 or 1 - len(valid) / expected > policy["maximum_missing_rate"]:
        return "missing_rate_exceeded"
    return None


def _predictions(history, policy):
    values = [row["value"] for row in history if row.get("value") is not None]
    return {"last_value": values[-1], "moving_median": median(values[-policy["median_window"]:])}


def _metrics(actual, predicted):
    errors = [prediction - value for value, prediction in zip(actual, predicted)]
    denominator = sum(abs(value) for value in actual)
    return {
        "mae": mean(abs(error) for error in errors),
        "rmse": math.sqrt(mean(error * error for error in errors)),
        "bias": mean(errors),
        "wape": sum(abs(error) for error in errors) / denominator if denominator else None,
    }


def backtest(records: list[dict], horizon_days=7, policy=None, as_of=None) -> dict:
    """Walk forward; select/calibrate on older folds and verify on untouched newer folds."""
    settings = _policy(policy)
    _validate(records)
    if horizon_days not in settings["supported_horizons_days"]:
        raise ValueError("unsupported forecast horizon")
    cutoff = _time(as_of) if as_of else max((_time(row["release_at"]) for row in records), default=datetime.min.replace(tzinfo=timezone.utc))
    actuals = {}
    for row in sorted(records, key=lambda item: _time(item["release_at"])):
        if _time(row["release_at"]) <= cutoff:
            # First published actual is the fixed verification target; later revisions stay in lineage.
            actuals.setdefault(_time(row["observed_at"]), row)
    folds = []
    # shortcut: small daily series only; add incremental revision indexing when walk-forward becomes slow.
    for target, actual in sorted(actuals.items()):
        if actual.get("value") is None:
            continue
        issue = target - timedelta(days=horizon_days)
        history = available_history(records, issue.isoformat())
        if _history_gate(history, issue.isoformat(), settings):
            continue
        predictions = _predictions(history, settings)
        folds.append({
            "issue_at": issue.isoformat(), "valid_at": target.isoformat(), "actual": actual["value"],
            "actual_release_at": actual["release_at"], "actual_revision_id": actual.get("revision_id"),
            "data_availability_cutoff": issue.isoformat(), "predictions": predictions,
        })
    result = {"status": "suppressed", "reason": "insufficient_backtest_folds", "fold_count": len(folds), "horizon_days": horizon_days, "model_version": settings["model_version"], "folds": folds}
    if len(folds) < settings["minimum_backtest_folds"]:
        return result
    split = len(folds) // 2
    verification = folds[split:]
    first_verification_issue = _time(verification[0]["issue_at"])
    # Embargo overlapping horizons: calibration targets must be known before verification begins.
    calibration = [row for row in folds[:split] if _time(row["actual_release_at"]) <= first_verification_issue]
    if len(calibration) < settings["minimum_backtest_folds"] // 2:
        result["reason"] = "insufficient_preverification_calibration_folds"
        return result
    model = min(("last_value", "moving_median"), key=lambda name: mean(abs(row["predictions"][name] - row["actual"]) for row in calibration))
    residuals = [row["actual"] - row["predictions"][model] for row in calibration]
    bounds = quantiles(residuals, n=10, method="inclusive")
    low_offset, high_offset = bounds[0], bounds[-1]
    actual = [row["actual"] for row in verification]
    predicted = [row["predictions"][model] for row in verification]
    metrics = _metrics(actual, predicted)
    baseline = _metrics(actual, [row["predictions"]["last_value"] for row in verification])
    coverage = mean(prediction + low_offset <= value <= prediction + high_offset for value, prediction in zip(actual, predicted))
    result.update({
        "model_id": model, "metrics": metrics, "baseline_metrics": baseline,
        "calibration_fold_count": len(calibration), "verification_fold_count": len(verification),
        "calibration_latest_release_at": max((row["actual_release_at"] for row in calibration), key=_time),
        "verification_first_issue_at": verification[0]["issue_at"],
        "interval_coverage": coverage, "interval_nominal_coverage": settings["interval_nominal_coverage"],
        "interval_offsets": [low_offset, high_offset],
        "skill_vs_last_value": 1 - metrics["mae"] / baseline["mae"] if baseline["mae"] else (0.0 if metrics["mae"] == 0 else None),
    })
    if metrics["mae"] > baseline["mae"]:
        result["reason"] = "worse_than_baseline"
    elif coverage < settings["minimum_interval_coverage"]:
        result["reason"] = "interval_calibration_failed"
    else:
        result.update(status="eligible", reason="provisional_backtest_gates_passed")
    return result


def forecast(records: list[dict], issue_at: str, horizon_days=7, policy=None) -> dict:
    """Return no forecast values unless history, missingness, benchmark and interval gates pass."""
    settings = _policy(policy)
    if horizon_days not in settings["supported_horizons_days"]:
        raise ValueError("unsupported forecast horizon")
    history = available_history(records, issue_at)
    result = {
        "status": "suppressed", "classification": "Unknown", "reason": None,
        "issue_at": _time(issue_at).isoformat(), "valid_at": (_time(issue_at) + timedelta(days=horizon_days)).isoformat(),
        "horizon_days": horizon_days, "point_estimate": None, "p10": None, "p90": None,
        "model_version": settings["model_version"], "backtest_score": None,
        "limitations": "Daily single-series pilot; empirical intervals are not guarantees. No operational validation yet.",
    }
    result["reason"] = _history_gate(history, issue_at, settings)
    if result["reason"]:
        return result
    report = backtest(records, horizon_days, settings, as_of=issue_at)
    result["backtest_score"] = {key: value for key, value in report.items() if key != "folds"}
    if report["status"] != "eligible":
        result["reason"] = report["reason"]
        return result
    prediction = _predictions(history, settings)[report["model_id"]]
    result.update(
        status="eligible", classification="Forecast", reason="provisional_backtest_gates_passed",
        point_estimate=prediction, p10=prediction + report["interval_offsets"][0], p90=prediction + report["interval_offsets"][1],
        model_id=report["model_id"], source_id=history[-1]["source_id"], series_id=history[-1]["series_id"],
        unit=history[-1]["unit"], area_code=history[-1].get("area_code"), commodity_id=history[-1].get("commodity_id"),
        data_cutoff=history[-1]["observed_at"],
    )
    return result


def _add_months(dt: datetime, n: int) -> datetime:
    total = dt.year * 12 + (dt.month - 1) + n
    return dt.replace(year=total // 12, month=(total % 12) + 1, day=1)


def _monthly_policy(policy=None) -> dict:
    full = _policy()
    result = full.get("monthly", {
        "model_version": "monthly-baseline-pilot-0.1",
        "minimum_history_months": 24,
        "maximum_missing_rate": 0.1,
        "minimum_backtest_folds": 12,
        "minimum_interval_coverage": 0.7,
        "interval_nominal_coverage": 0.8,
        "supported_horizons_months": [1, 3, 6, 12],
        "seasonal_lag_months": 12,
        "ma_window_months": 3,
    }).copy()
    if policy:
        result.update(policy)
    return result


def _validate_monthly(records):
    identity = None
    seen = {}
    fields = ("series_id", "source_id", "unit", "area_code", "commodity_id", "market_id", "price_type", "grade")
    for row in records:
        if not isinstance(row, dict):
            raise ValueError("observation must be an object")
        if not all(row.get(key) for key in ("series_id", "source_id", "unit")):
            raise ValueError("series_id, source_id and unit are required")
        current = tuple(row.get(key) for key in fields)
        if identity is not None and current != identity:
            raise ValueError("mixed series, units, sources or market definitions")
        identity = current
        if row.get("data_kind") not in {"observed", "official"}:
            raise ValueError("verification requires observed or official records, not forecast/scenario/unknown")
        if not row.get("observed_at") or not row.get("release_at"):
            raise ValueError("observed_at and known release_at are required")
        observed, released = _time(row["observed_at"]), _time(row["release_at"])
        if released < observed:
            raise ValueError("release_at precedes observed_at")
        value = row.get("value")
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise ValueError("non-finite or non-numeric observation")
        key = (observed, released)
        if key in seen and seen[key] != value:
            raise ValueError("ambiguous revisions with the same release_at")
        seen[key] = value


def monthly_available_history(records: list[dict], issue_at: str) -> list[dict]:
    """Latest revision actually available at issue time for monthly series."""
    _validate_monthly(records)
    cutoff = _time(issue_at)
    by_month = {}
    for row in records:
        observed, released = _time(row["observed_at"]), _time(row["release_at"])
        if observed <= cutoff and released <= cutoff:
            month_key = (observed.year, observed.month)
            previous = by_month.get(month_key)
            if previous is None or _time(previous["release_at"]) < released:
                by_month[month_key] = row
    return [by_month[key].copy() for key in sorted(by_month)]


def _monthly_history_gate(history, issue_at, policy):
    valid = [row for row in history if row.get("value") is not None]
    if len(valid) < policy["minimum_history_months"]:
        return "insufficient_history"
    start_dt = _time(history[0]["observed_at"])
    cutoff_dt = _time(issue_at)
    expected_months = (cutoff_dt.year - start_dt.year) * 12 + (cutoff_dt.month - start_dt.month) + 1
    if expected_months <= 0 or 1 - len(valid) / expected_months > policy["maximum_missing_rate"]:
        return "missing_rate_exceeded"
    return None


def _monthly_predictions(history, policy, target_dt):
    valid_rows = [row for row in history if row.get("value") is not None]
    values = [row["value"] for row in valid_rows]
    last_value = values[-1]
    window = policy.get("ma_window_months", 3)
    ma = mean(values[-window:]) if len(values) >= window else last_value

    # Seasonal naive: same calendar month 12 months prior to target
    target_month = target_dt.month
    same_month_rows = [r for r in valid_rows if _time(r["observed_at"]).month == target_month]
    seasonal_val = same_month_rows[-1]["value"] if same_month_rows else last_value

    return {
        "last_value": last_value,
        "moving_average": ma,
        "seasonal_naive": seasonal_val,
    }


def monthly_backtest(records: list[dict], horizon_months=1, policy=None, as_of=None) -> dict:
    """Walk forward backtest on monthly frequency with seasonal naïve and naive baselines."""
    settings = _monthly_policy(policy)
    _validate_monthly(records)
    if horizon_months not in settings["supported_horizons_months"]:
        raise ValueError("unsupported forecast horizon")

    cutoff = _time(as_of) if as_of else max((_time(row["release_at"]) for row in records), default=datetime.min.replace(tzinfo=timezone.utc))
    actuals = {}
    for row in sorted(records, key=lambda item: _time(item["release_at"])):
        if _time(row["release_at"]) <= cutoff:
            obs = _time(row["observed_at"])
            actuals.setdefault((obs.year, obs.month), row)

    folds = []
    sorted_months = sorted(actuals.keys())
    for (year, month) in sorted_months:
        actual = actuals[(year, month)]
        if actual.get("value") is None:
            continue
        target_dt = datetime(year, month, 1, tzinfo=timezone.utc)
        issue_dt = _add_months(target_dt, -horizon_months)
        history = monthly_available_history(records, issue_dt.isoformat())
        if _monthly_history_gate(history, issue_dt.isoformat(), settings):
            continue
        predictions = _monthly_predictions(history, settings, target_dt)
        folds.append({
            "issue_at": issue_dt.isoformat(),
            "valid_at": target_dt.isoformat(),
            "actual": actual["value"],
            "actual_release_at": actual["release_at"],
            "actual_revision_id": actual.get("revision_id"),
            "data_availability_cutoff": issue_dt.isoformat(),
            "predictions": predictions,
        })

    result = {
        "status": "suppressed", "reason": "insufficient_backtest_folds",
        "fold_count": len(folds), "horizon_months": horizon_months,
        "model_version": settings["model_version"], "folds": folds,
    }
    if len(folds) < settings["minimum_backtest_folds"]:
        return result

    split = len(folds) // 2
    verification = folds[split:]
    first_verification_issue = _time(verification[0]["issue_at"])
    calibration = [row for row in folds[:split] if _time(row["actual_release_at"]) <= first_verification_issue]
    if len(calibration) < settings["minimum_backtest_folds"] // 2:
        result["reason"] = "insufficient_preverification_calibration_folds"
        return result

    candidates = ("seasonal_naive", "last_value", "moving_average")
    model = min(candidates, key=lambda name: mean(abs(row["predictions"][name] - row["actual"]) for row in calibration))
    residuals = [row["actual"] - row["predictions"][model] for row in calibration]
    bounds = quantiles(residuals, n=10, method="inclusive")
    low_offset, high_offset = bounds[0], bounds[-1]

    actual = [row["actual"] for row in verification]
    predicted = [row["predictions"][model] for row in verification]
    metrics = _metrics(actual, predicted)
    baseline = _metrics(actual, [row["predictions"]["last_value"] for row in verification])
    coverage = mean(prediction + low_offset <= value <= prediction + high_offset for value, prediction in zip(actual, predicted))

    result.update({
        "model_id": model, "metrics": metrics, "baseline_metrics": baseline,
        "calibration_fold_count": len(calibration), "verification_fold_count": len(verification),
        "calibration_latest_release_at": max((row["actual_release_at"] for row in calibration), key=_time),
        "verification_first_issue_at": verification[0]["issue_at"],
        "interval_coverage": coverage, "interval_nominal_coverage": settings["interval_nominal_coverage"],
        "interval_offsets": [low_offset, high_offset],
        "skill_vs_last_value": 1 - metrics["mae"] / baseline["mae"] if baseline["mae"] else (0.0 if metrics["mae"] == 0 else None),
    })

    if metrics["mae"] > baseline["mae"]:
        result["reason"] = "worse_than_baseline"
    elif coverage < settings["minimum_interval_coverage"]:
        result["reason"] = "interval_calibration_failed"
    else:
        result.update(status="eligible", reason="provisional_backtest_gates_passed")
    return result


def monthly_forecast(records: list[dict], issue_at: str, horizon_months=1, policy=None) -> dict:
    """Return no forecast values for monthly series unless history, missingness, benchmark and interval gates pass."""
    settings = _monthly_policy(policy)
    if horizon_months not in settings["supported_horizons_months"]:
        raise ValueError("unsupported forecast horizon")

    # Check for unverified release dates
    if any(r.get("release_at") is None for r in records):
        return {
            "status": "suppressed", "classification": "Unknown",
            "reason": "unverified_release_dates",
            "issue_at": _time(issue_at).isoformat(),
            "valid_at": _add_months(_time(issue_at), horizon_months).isoformat(),
            "horizon_months": horizon_months, "point_estimate": None, "p10": None, "p90": None,
            "model_version": settings["model_version"], "backtest_score": None,
            "limitations": "Historical as-of forecast requires authenticated release dates; retrieved_at cannot substitute.",
        }

    history = monthly_available_history(records, issue_at)
    target_dt = _add_months(_time(issue_at), horizon_months)
    result = {
        "status": "suppressed", "classification": "Unknown", "reason": None,
        "issue_at": _time(issue_at).isoformat(), "valid_at": target_dt.isoformat(),
        "horizon_months": horizon_months, "point_estimate": None, "p10": None, "p90": None,
        "model_version": settings["model_version"], "backtest_score": None,
        "limitations": "Monthly single-series baseline; seasonal naive / moving average. No downsampling to daily.",
    }
    result["reason"] = _monthly_history_gate(history, issue_at, settings)
    if result["reason"]:
        return result

    report = monthly_backtest(records, horizon_months, settings, as_of=issue_at)
    result["backtest_score"] = {key: value for key, value in report.items() if key != "folds"}
    if report["status"] != "eligible":
        result["reason"] = report["reason"]
        return result

    prediction = _monthly_predictions(history, settings, target_dt)[report["model_id"]]
    result.update(
        status="eligible", classification="Forecast", reason="provisional_backtest_gates_passed",
        point_estimate=prediction, p10=prediction + report["interval_offsets"][0], p90=prediction + report["interval_offsets"][1],
        model_id=report["model_id"], source_id=history[-1]["source_id"], series_id=history[-1]["series_id"],
        unit=history[-1]["unit"], area_code=history[-1].get("area_code"), commodity_id=history[-1].get("commodity_id"),
        data_cutoff=history[-1]["observed_at"],
    )
    return result

