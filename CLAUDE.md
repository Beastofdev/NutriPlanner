# NutriPlanner - Claude Code Project Guide

## Project Overview
NutriPlanner is a multi-supermarket meal planning SaaS for Spanish supermarkets. AI-powered weekly meal plans with shopping lists priced from the user's chosen supermarket. FastAPI backend + React/Vite frontend.

## Architecture
- **Backend**: FastAPI (Python 3.14), PostgreSQL, SQLAlchemy ORM
- **Frontend**: React 18 + Vite, TailwindCSS, localStorage for client state
- **Supermarkets**: Multi-supermarket (Mercadona, Consum, + future chains)
- **Scraper Framework**: BaseScraper ABC + per-chain adapters

## Key Differences from NutriConsum
- Multi-supermarket support (not single-chain)
- User selects preferred supermarket during onboarding
- Shopping list shows prices for user's chain + savings nudge for cheapest alternative
- Brand-neutral palette (forest green #2D6A4F / mint #52B788)
- Config-driven branding via `frontend/src/config/brand.js`
- Scraper framework with `BaseScraper` abstract class

## Port Allocation
- PostgreSQL: 5436
- Backend (FastAPI): 8004
- Frontend (Vite dev): 5176
- Adminer: 8085

## Key Files
- `backend/app/api/planner.py` — Main API: generate-plan-v3, recalculate-shopping-v3
- `backend/app/services/recipe_selector.py` — Recipe selection, scoring
- `backend/app/services/comparator.py` — Multi-supermarket pricing
- `backend/app/services/supermarket_registry.py` — Dynamic supermarket registry
- `backend/scripts/scrapers/base_scraper.py` — Abstract scraper framework
- `backend/scripts/scrapers/scrape_mercadona.py` — Mercadona adapter
- `backend/scripts/scrapers/scrape_consum.py` — Consum adapter
- `frontend/src/config/brand.js` — Centralized brand config
- `frontend/src/pages/MiCompra.jsx` — Shopping list + price comparison

## Adding a New Supermarket
1. Create `backend/scripts/scrapers/scrape_{name}.py` implementing `BaseScraper`
2. Run: `python scrapers/scrape_{name}.py`
3. Run: `python extract_ingredients.py --supermarket {NAME}`
4. Add row to `SUPERMARKETS_SEED` in `main.py`

## Workflow Standards

### Before Deploying
1. Syntax check all modified Python files
2. `npm run build` in frontend/
3. E2E test on production
4. Responsive test: 375px, 768px, 1024px, 1440px

### Commit Style
Format: `type: concise description`
Types: feat, fix, refactor, docs, style, test

## localStorage Key Prefix
All keys use `nutriplanner_` prefix via `lsKey()` from `config/brand.js`
