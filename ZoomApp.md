# ZoomApp — Dynamic Bento Grid Navigation

## Concept

Replace the standard tab-based navigation with a **dynamic Bento Grid** layout that serves as the app's landing page. Each grid cell is a live preview / teaser of a tab's main attraction, and clicking a cell triggers a smooth **zoom-in transition** that expands it into the full tab view.

## How It Works

1. **Landing Bento Grid**
   - On load, the user sees a responsive bento grid (mixed-size tiles).
   - Each tile shows a condensed, at-a-glance preview of a section (e.g. a mini portfolio table, a small risk scatter plot, a headline KPI from attribution, etc.).
   - Tiles are **not** full tab content — just the hook / hero element.

2. **Click-to-Zoom Interaction**
   - Clicking a tile triggers a **FLIP-style transition** (First-Last-Invert-Play): the tile smoothly scales and repositions to fill the viewport, morphing into the full tab view.
   - A back button or gesture (swipe / escape) reverses the animation and zooms back out to the grid.

3. **Grid Layout**
   - Uses CSS Grid with named areas for flexible, editorial-style layouts.
   - Tiles can be 1×1, 2×1, 1×2, 2×2 etc. — sized by importance.
   - Responsive: collapses to a single-column stack on mobile.

## Proposed Tile Map (Landing Grid)

| Tile | Size | Preview Content |
|------|------|-----------------|
| Dashboard KPIs | 2×1 | Total value, daily P&L, top mover |
| Portfolio Table | 2×2 | Top 5 holdings mini-table |
| Risk Scatter | 1×1 | Return vs Risk quadrant (mini) |
| Sector Weights | 1×1 | Donut chart |
| Attribution | 2×1 | Cumulative return sparkline |
| AI Insights | 1×1 | Latest Gemini summary snippet |
| Report | 1×1 | "Generate Report" CTA card |

## Transition Design

- **Zoom-in**: tile origin → full viewport. Background tiles fade out + slight scale-down (parallax feel).
- **Zoom-out**: reverse. Full view shrinks back into tile position, siblings fade back in.
- Use `framer-motion` `layoutId` + `AnimatePresence` for shared-layout animations.
- Duration: ~400ms ease-out.

## Technical Notes

- Each tile component = lazy-loaded summary variant of the full view.
- Full views remain the existing tab components (`DashboardView`, `RiskContributionView`, etc.) — no rewrite needed.
- Navigation state stored in URL (`/` = grid, `/risk` = zoomed into risk, etc.) so deep-links still work.
- Consider `view-transition` API as a progressive enhancement for browsers that support it.

## Open Questions

- Should the grid be user-customizable (drag to rearrange, resize tiles)?
- Do we keep a traditional nav bar as a secondary navigation, or go all-in on the grid?
- How to handle tiles for sections with no meaningful preview (e.g. settings)?
