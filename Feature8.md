# Plan: Feature #8 — Peer Comparison (Model Portfolios)

## Context
Add dashed line overlays to the Performance tab allowing comparison against 5 model portfolios (60/40 Global, Canadian Couch Potato, All-World, S&P 500, TSX 60). Toggling a model is instant (no re-fetch) because all model series are always computed on the backend and stored in `BackcastResponse.modelSeries`.

---

## Architecture Decision
**Always compute all 5 model series on the backend** — the extra 4 tickers (AGG, VCN.TO, XAW.TO, ZAG.TO) are batched into the existing yfinance download call at negligible cost. Frontend holds `selectedModels: string[]` state locally — toggling a model just shows/hides its line, zero API roundtrip.

---

## Step 1 — `server/constants.py`

Append after `BENCHMARK_BLEND_TICKERS`:

```python
MODEL_PORTFOLIOS: dict[str, dict[str, float]] = {
    "60/40 Global":  {"ACWI": 0.60, "AGG": 0.40},
    "Couch Potato":  {"VCN.TO": 0.33, "XAW.TO": 0.33, "ZAG.TO": 0.34},
    "All-World":     {"ACWI": 1.0},
    "S&P 500":       {"XUS.TO": 1.0},
    "TSX 60":        {"XIU.TO": 1.0},
}
# Extra tickers not in BENCHMARK_BLEND_TICKERS
MODEL_EXTRA_TICKERS: list[str] = ["AGG", "VCN.TO", "XAW.TO", "ZAG.TO"]
```

---

## Step 2 — `server/services/backcast_service.py`

**2a. Update import** (line 19):
```python
from constants import BENCHMARK_BLEND_TICKERS, MODEL_EXTRA_TICKERS, MODEL_PORTFOLIOS
```

**2b. Extend `fetch_returns_df`** — line 67, change:
```python
fetch_list = list(set(portfolio_tickers + BENCHMARK_BLEND_TICKERS))
```
to:
```python
fetch_list = list(set(portfolio_tickers + BENCHMARK_BLEND_TICKERS + MODEL_EXTRA_TICKERS))
```

**2c. Add `compute_model_series()`** after `build_benchmark_returns` (before `compute_backcast_metrics`):

```python
def compute_model_series(returns_df: pd.DataFrame) -> dict[str, list[dict]]:
    """Compute cumulative return series (base 100) for all MODEL_PORTFOLIOS."""
    dates = returns_df.index.strftime("%Y-%m-%d").tolist()
    result: dict[str, list[dict]] = {}

    for model_name, weights in MODEL_PORTFOLIOS.items():
        model_returns = pd.Series(0.0, index=returns_df.index)
        effective_weight = 0.0

        for ticker, weight in weights.items():
            if ticker not in returns_df.columns:
                continue
            if needs_fx_adjustment(ticker) and "USDCAD=X" in returns_df.columns:
                fx_ret = returns_df["USDCAD=X"]
                ticker_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                ticker_ret = returns_df[ticker]
            model_returns += weight * ticker_ret
            effective_weight += weight

        if 0 < effective_weight < 1.0:
            model_returns = model_returns / effective_weight

        cumulative = (1 + model_returns).cumprod() * 100
        result[model_name] = [
            {"date": d, "value": round(float(cumulative.iloc[i]), 4)}
            for i, d in enumerate(dates)
            if pd.notna(cumulative.iloc[i])
        ]

    return result
```

Note: `needs_fx_adjustment` is already imported from `market_data` (line 18). Call without `is_mutual_fund` (defaults to `False`).

---

## Step 3 — `server/routes/risk.py`

**3a. Extend import block** (line 15–22), add `compute_model_series`:
```python
from services.backcast_service import (
    aggregate_weights,
    build_benchmark_returns,
    build_portfolio_returns,
    compute_backcast_metrics,
    compute_model_series,       # NEW
    compute_rolling_metrics,
    fetch_returns_df,
)
```

**3b. In `portfolio_backcast` handler**, after line 67 (`result["fetchedAt"] = ...`), insert:
```python
result["modelSeries"] = compute_model_series(returns_df)
```

`returns_df` is already in scope. No restructuring needed.

---

## Step 4 — `client/types.ts`

Add after `DrawdownEpisode` interface:
```typescript
export interface ModelSeriesPoint {
  date: string;
  value: number;
}
export type ModelSeriesMap = Record<string, ModelSeriesPoint[]>;
```

Extend `BackcastResponse`:
```typescript
modelSeries?: ModelSeriesMap;
```

No change to `api.ts` needed — JSON deserialization picks it up automatically.

---

## Step 5 — `client/views/performance/PerformanceView.tsx`

**5a.** Add state alongside existing state declarations:
```typescript
const [selectedModels, setSelectedModels] = useState<string[]>([]);
```

**5b.** Extend `chartData` useMemo to merge model values. Build a `Map<string, number>` per selected model, look up by date inside each `filtered.map()` pass. For `absolute` view, add `base[name] = ((v - sv) / sv) * 100`. For `drawdowns` view, track running max per model. For `relative` view, leave unchanged (model overlays not applicable).

Key pattern inside the useMemo (after computing `startPortfolio`, `startBenchmark`):
```typescript
// Pre-build date→value lookup for each selected model
const modelMaps: Record<string, Map<string, number>> = {};
if (data.modelSeries) {
    for (const name of selectedModels) {
        const raw = data.modelSeries[name];
        if (raw) modelMaps[name] = new Map(raw.map(p => [p.date, p.value]));
    }
}
// Find start value for each model within the filtered window
const modelStartValues: Record<string, number> = {};
for (const name of selectedModels) {
    for (const pt of filtered) {
        const v = modelMaps[name]?.get(pt.date);
        if (v !== undefined) { modelStartValues[name] = v; break; }
    }
}
```

Then in `absolute` branch, extend each mapped object:
```typescript
for (const name of selectedModels) {
    const v = modelMaps[name]?.get(pt.date);
    const sv = modelStartValues[name];
    if (v !== undefined && sv !== undefined) base[name] = ((v - sv) / sv) * 100;
}
```

**5c.** Pass new props to `<PerformanceCharts>`:
```tsx
selectedModels={selectedModels}
setSelectedModels={setSelectedModels}
availableModels={data?.modelSeries ? Object.keys(data.modelSeries) : []}
```

---

## Step 6 — `client/views/performance/PerformanceCharts.tsx`

**6a.** Define model colors at top of file:
```typescript
const MODEL_COLORS: Record<string, string> = {
    '60/40 Global':  '#f59e0b',  // amber
    'Couch Potato':  '#a78bfa',  // violet
    'All-World':     '#06b6d4',  // cyan
    'S&P 500':       '#f97316',  // orange
    'TSX 60':        '#84cc16',  // lime
};
```

Colors are distinct from Portfolio green (`#10b981`) and Benchmark blue (`#2563eb`).

**6b.** Extend `PerformanceChartsProps` interface:
```typescript
selectedModels: string[];
setSelectedModels: (v: string[]) => void;
availableModels: string[];
```

**6c.** Add model selector pill-buttons in the toolbar (inside the existing left `flex` group, after the benchmark buttons):

```tsx
{availableModels.length > 0 && (
    <>
        <div className="w-px h-5 bg-wallstreet-700 mx-1" />
        <span className="text-xs text-wallstreet-500 font-mono uppercase tracking-wider">Models</span>
        {availableModels.map((model) => {
            const isSelected = selectedModels.includes(model);
            const color = MODEL_COLORS[model] ?? '#a78bfa';
            return (
                <button
                    key={model}
                    onClick={() => setSelectedModels(
                        isSelected ? selectedModels.filter(m => m !== model) : [...selectedModels, model]
                    )}
                    title={model}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200 border ${
                        isSelected
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-wallstreet-600 text-wallstreet-500 hover:text-wallstreet-text hover:bg-wallstreet-900 bg-transparent'
                    }`}
                    style={isSelected ? { backgroundColor: color } : {}}
                >
                    {model}
                </button>
            );
        })}
    </>
)}
```

**6d.** Pass new props to `<UnifiedPerformancePanel>`:
```tsx
selectedModels={selectedModels}
modelColors={MODEL_COLORS}
```

---

## Step 7 — `client/views/performance/UnifiedPerformancePanel.tsx`

**7a.** Extend props interface:
```typescript
selectedModels?: string[];
modelColors?: Record<string, string>;
```

**7b.** In the `absolute` `LineChart`, after the existing `Benchmark` `<Line>` (line 301):
```tsx
{(selectedModels ?? []).map(name => (
    <Line
        key={name}
        type="monotone"
        dataKey={name}
        stroke={modelColors?.[name] ?? '#a78bfa'}
        strokeWidth={1.5}
        strokeDasharray="6 3"
        dot={false}
        activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: modelColors?.[name] ?? '#a78bfa' }}
    />
))}
```

**7c.** In the `drawdowns` `AreaChart`, after the existing `Benchmark` `<Area>` (line 260):
```tsx
{(selectedModels ?? []).map(name => (
    <Area
        key={name}
        type="monotone"
        dataKey={name}
        stroke={modelColors?.[name] ?? '#a78bfa'}
        strokeWidth={1.5}
        strokeDasharray="6 3"
        fill="none"
        fillOpacity={0}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: modelColors?.[name] ?? '#a78bfa' }}
    />
))}
```

Recharts `<Legend>` automatically picks up dynamically rendered `<Line>` / `<Area>` elements — no manual legend changes needed.

`relative` view is unchanged (model overlays have no meaningful single baseline in excess-return space).

---

## Files Modified (7 total)

| File | Change |
|------|--------|
| `server/constants.py` | Add `MODEL_PORTFOLIOS` + `MODEL_EXTRA_TICKERS` |
| `server/services/backcast_service.py` | Extend `fetch_returns_df`, add `compute_model_series()` |
| `server/routes/risk.py` | Import + call `compute_model_series`, add to response |
| `client/types.ts` | Add `ModelSeriesPoint`, `ModelSeriesMap`, extend `BackcastResponse` |
| `client/views/performance/PerformanceView.tsx` | `selectedModels` state, merge model data into `chartData` useMemo, pass props |
| `client/views/performance/PerformanceCharts.tsx` | `MODEL_COLORS`, model pill-button selector UI, pass props |
| `client/views/performance/UnifiedPerformancePanel.tsx` | Dynamic `<Line>` / `<Area>` overlays for selected models |

---

## Verification

1. Start backend (`uvicorn main:app`) and frontend (`npm run dev`)
2. Open Performance tab → should load normally (no models selected by default)
3. Click "All-World" pill → dashed cyan line appears instantly on the chart (no loading)
4. Click "Couch Potato" → second dashed violet line added
5. Click "Couch Potato" again → line disappears
6. Switch chart view to Drawdowns → model drawdown lines also appear
7. Switch to Relative → no model lines (correct)
8. Verify Legend entries update as models are toggled
9. Change period (YTD → 1Y) → model lines re-normalize to new period start
10. Check `missingTickers` warning still appears correctly (unrelated field)
