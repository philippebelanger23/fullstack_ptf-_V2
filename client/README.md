# Portfolio Deep Dive — React Frontend

React + TypeScript frontend for the portfolio analytics platform. Visualizes returns, contributions, sector allocations, benchmark comparisons, and AI-powered insights.

---

## Quick Start

**Prerequisites:** Node.js 18+

```bash
cd client
npm install
npm run dev
```

App runs at **http://localhost:3000**

The dev server automatically proxies all `/api` calls to the backend at `localhost:8000`.

> **Note:** The backend must also be running for data to load. See [../server/README.md](../server/README.md).

---

## Environment

Create a `.env.local` file in the `client/` directory:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

The Gemini key enables the AI-powered analysis features. The app runs without it, but AI insights will be disabled.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 19 + TypeScript | UI framework |
| Vite 6 | Build tool & dev server |
| TailwindCSS 3 | Styling |
| Recharts | Charts & data visualization |
| Google Generative AI SDK | Gemini AI integration |
| Lucide React | Icons |

---

## Views

| View | Description |
|------|-------------|
| Upload | Upload portfolio weights file or enter data manually |
| Dashboard | Portfolio overview, KPIs, allocation summary |
| Analysis | Return & contribution analysis with charts |
| Attribution | Period-by-period return attribution |
| Correlation | Asset correlation matrix |
| Index | Benchmark & index exposure analysis |
| Performance | Detailed performance metrics |
| Risk Contribution | Risk decomposition by asset |

---

## Project Structure

```
client/
├── App.tsx                  # Root component, view routing, global state
├── index.tsx                # React entry point
├── views/                   # One file per view/page
├── components/              # Shared UI components
│   ├── Sidebar.tsx
│   ├── KPICard.tsx
│   ├── PortfolioTable.tsx
│   ├── ManualEntryModal.tsx
│   └── ...charts & widgets
└── services/
    ├── api.ts               # All backend API calls
    └── geminiService.ts     # Gemini AI integration
```

---

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```
