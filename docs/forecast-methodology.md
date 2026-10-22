# TADIH Forecasting Methodology & Baseline Architecture

**Date of Document:** 22 October 2026 (Asia/Bangkok)  
**Scope:** Multi-frequency forecasting baselines (Daily and Monthly), walk-forward backtesting, model scorecard evaluation, and release-aware historical gates.  
**Compliance Reference:** Thailand First v1.4 Specification, PART III (Sections 37, 39, 42) & Checklist B9.  
**Test Suite:** `tests/test_forecast.py` (20 unit tests passing 100%).  

---

## 1. Principles of Truthful Agricultural Forecasting

Under the TADIH governance framework and Thailand First v1.4 specification, all predictive capabilities must adhere to strict epistemological standards:

1. **Native Frequency Preservation (No False Downsampling):**
   - Monthly agricultural price series (such as OAE farmgate prices) must **never** be interpolated, spline-fitted, or downsampled into synthetic daily prices.
   - Monthly observations must be modeled at their native monthly grain using monthly horizons (1, 3, 6, 12 months).
2. **Release-Date Integrity (No Lookahead Leakage):**
   - A forecast issued at `issue_at = T` can **only** condition on observations that were officially published and released at or before $T$ (`release_at <= T`).
   - `retrieved_at` (the system ingestion timestamp) must **never** be substituted for `release_at` (the official government release timestamp).
   - In the absence of documented, authentic release timestamps (as is currently the case for the 44 historical OAE monthly price series where `release_at` is null), any attempt to generate a forecast must return `status = "suppressed"`, `classification = "Unknown"`, with structured reason `"unverified_release_dates"`.
3. **Benchmark Before Complexity:**
   - Before any complex ML/AI model (e.g. LightGBM, LSTM, Prophet) is introduced, it must be benchmarked against simple, transparent baselines:
     * **Naïve Baseline (`last_value`):** $\hat{y}_{t+h} = y_t$
     * **Seasonal Naïve (`seasonal_naive`):** $\hat{y}_{t+h} = y_{t+h-12}$ (same calendar month 12 months prior)
     * **Moving Average (`moving_average`):** 3-month moving average
   - If an advanced model fails to beat the champion baseline on out-of-sample verification folds (`metrics["mae"] > baseline["mae"]`), it is declared `worse_than_baseline` and strictly suppressed from user dashboards.
4. **Empirical Prediction Intervals (P10 / P90):**
   - Prediction intervals are derived from empirical quantile bounds of calibration residuals (80% nominal interval coverage, [p10, p90]).
   - If interval coverage on untouched verification folds falls below the minimum threshold (default 70%), the forecast is declared `interval_calibration_failed` and suppressed.

---

## 2. Monthly Forecasting Specification

### A. Configuration Parameters (`config/models.json`)

```json
{
  "monthly": {
    "model_version": "monthly-baseline-pilot-0.1",
    "minimum_history_months": 24,
    "maximum_missing_rate": 0.1,
    "minimum_backtest_folds": 12,
    "minimum_interval_coverage": 0.7,
    "interval_nominal_coverage": 0.8,
    "supported_horizons_months": [1, 3, 6, 12],
    "seasonal_lag_months": 12,
    "ma_window_months": 3
  }
}
```

### B. Candidate Models
1. **Seasonal Naïve:**
   $$\hat{y}_{t+h} = y_{t+h-12}$$
   Captures strong 12-month agricultural seasonality (e.g. wet season rice harvest in Nov–Jan, off-season in May–Jun, durian peaks in May–Jul). Requires at least 24 months of history to evaluate.
2. **Naïve (Last Known Value):**
   $$\hat{y}_{t+h} = y_t$$
   The standard random-walk benchmark.
3. **Moving Average (3-Month):**
   $$\hat{y}_{t+h} = \frac{1}{3} \sum_{k=0}^{2} y_{t-k}$$
   Smoothes short-term transitory noise.

### C. Walk-Forward Backtesting Protocol
1. **Fold Generation:** Each historical target month $(year, month)$ is paired with an issue date $(target - horizon\_months)$.
2. **Embargo Separation:** The backtest folds are divided into equal calibration and verification sets. Targets in the calibration set must have been released before the first verification fold issue date, preventing temporal leakage.
3. **Champion Selection:** The champion baseline is selected based on lowest MAE on the calibration set.
4. **Scorecard Metrics:**
   - **MAE:** Mean Absolute Error
   - **RMSE:** Root Mean Squared Error
   - **Bias:** Mean Error ($\sum (\hat{y} - y) / N$)
   - **WAPE:** Weighted Absolute Percentage Error ($\sum |\hat{y} - y| / \sum |y|$)
   - **Skill Score:** $1 - \frac{\text{MAE}_{\text{model}}}{\text{MAE}_{\text{naive}}}$

---

## 3. Current Readiness of Real Data Series

| Data Series | Native Grain | History Depth | Release Timestamps | Status |
|---|---|---|---|---|
| OAE Monthly Prices (44 commodities) | Monthly | 40–189 months | `null` (unverified release calendars) | **Suppressed (`unverified_release_dates`)** |
| Open-Meteo ERA5 Reanalysis (5 points) | Daily | 3,653 days (10 years) | Known reanalysis version (ERA5) | Daily baselines eligible for point weather |
| RID Medium Reservoirs (461 dams) | Daily | 14 days | Known collection dates | Insufficient history for annual cycles |
| DOAE Crop Production | Staged Annual | 1 year (2566 BE) | Staged / unverified release dates | Single cross-section; no time series backtest |

**Conclusion:** In compliance with Checklist B9 and PART III, synthetic verification proves model mathematical correctness, while real OAE price series remain properly suppressed from forecast dashboards until official release timestamps are documented.
