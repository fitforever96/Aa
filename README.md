# Orkin Proposal Studio

A mobile-first progressive web app (PWA) for commercial pest-management proposals, built for Anthony Acosta, Senior Account Manager, Orkin Commercial. It handles property intake, physical service-time estimating, pricing at a $210/hr billable rate, proposal writing and premium PDF export. It is designed for iPhone first and also works in desktop browsers.

## What it does

| Area | What's implemented |
|---|---|
| **Workflow** | Dashboard → New Proposal (templates or dictation) → 8-step workspace: Customer · Services · Conditions · Equipment · Labor · Pricing · Document · Review/Export |
| **Labor estimator** | Deterministic engine with seven components (equipment servicing, installation, walking, inspection, treatment, access/setup, documentation). Separate initial and recurring phases. Multiple technicians, with technician-hours kept distinct from elapsed time. Confidence rating, a formula on every line, and provenance badges (Confirmed / Estimate / Measured / Calibrated). Eleven property models (office, industrial, multifamily by apartments-per-visit, restaurant, warehouse, healthcare, government, campus, exterior-only, specialty…). |
| **Confirmed standards** | $210/hr billable estimating rate ($3.50/min); Tin Cat 1 min; exterior bait station 2 min. Never multiplied by complexity or calibration factors. |
| **Pricing** | Integer-cent arithmetic. Labor and equipment kept separate. No automatic minimum, markup, discount or rounding. Manual price override with lock, plus a comparison of calculated vs. manual price, the difference, and effective hourly yield (internal only). Customer and proposal labor-rate overrides. The rate is stored as a versioned snapshot per proposal. |
| **Frequency & billing** | Weekly ≠ every two weeks ≠ twice monthly. Seasonal, custom, and five-day intensive schedules. Calendar-accurate visit generation (five-visit months). Per-visit billing by default; fixed-monthly only when approved. Contract-period totals off unless enabled for an RFP. |
| **Libraries** | Equipment catalog with approval status, price history and effective dates. Historical pricing library seeded with your NRP, GM Pontiac, Hyundai, JMA, Mulberry Row, Cedar Woods, small-fly, Zeal and specialty references, each labeled customer-specific. Only approved standards ever auto-apply. Orkin terminology/capabilities library (Triple Guarantee, A.I.M.®, InSite®) marked *needs verification* until you verify it. |
| **Writing** | An offline template writer produces customer-specific sections per proposal type. With AI configured, Claude rewrites the sections you select, using accepted research and passages retrieved from your knowledge library. Writing changes can never alter prices: this is enforced in code and covered by tests. |
| **Assistant** | Natural-language commands parsed offline (or by AI). Pricing, scope, frequency, guarantee and exclusion changes wait for your explicit approval. Writing and design changes apply directly. |
| **Voice** | Web Speech API dictation where the device exposes it. Otherwise the app says so and points you to iOS keyboard dictation. Dictation is parsed into structured intake (square footage, Tin Cats, stations, frequency, pests, activity areas). |
| **PDF** | Searchable vector PDF with embedded Roboto Condensed and Lato. Three covers: Executive Charcoal, Corporate White and Property Showcase. Repeating table headers, rows that never split, fixed headers and footers with page numbers, multi-property schedules, specialty tables, photos and floor plans. Separate **Internal Estimate** PDF. Preview rendered as page images, then iOS share sheet (Save to Files / Mail) or download. |
| **QC** | About 30 executed checks across financial, operational, legal/technical and document groups, plus page-by-page **visual inspection of the rendered PDF**: clipped text, overlaps, blank or near-empty pages, smallest font, margin consistency. Checks that can't run are reported as *not run*. |
| **Import** | PDF (pdf.js), DOCX (mammoth), TXT and JSON. Deterministic extraction with evidence and confidence; nothing is saved until you confirm it. AI extraction and AI OCR for scanned PDFs when configured. Six actions: redesign, improve, template, historical reference, **keep everything except the cover** (pdf-lib page merge), and comprehensive. |
| **Knowledge** | Document library with local BM25 retrieval. Extracted facts keep their source and status until you promote them. |
| **Calibration** | Record actual service time. Estimated vs. actual median ratio and MAPE (mean absolute percentage error), grouped by property type, size, frequency, technicians, access, equipment count and pest. Approved factors apply only to app-estimated components. |
| **Data** | IndexedDB (Dexie): proposals, versions, customers, equipment, historical, capabilities, knowledge, assets, assumption versions, settings. Autosave, version history with restore, JSON backup and restore. |
| **PWA** | Manifest, icons, Home Screen standalone mode, safe areas, splash, offline app shell via service worker. Dark (default) and light themes, driven by central design tokens. |

### What needs configuration or verification
- **AI writing, research, OCR, AI extraction and AI command interpretation** require `ANTHROPIC_API_KEY` on the server. They are not active until you set it, and the app never claims research happened when it didn't. These routes have not yet been exercised against the live API.
- **Address autocomplete** is not connected. It needs a location provider; enter addresses manually.
- **Triple Guarantee, A.I.M.® and InSite® wording** comes from your reference proposal. Verify it against current orkin.com/commercial material, then mark it verified in Knowledge › Orkin terminology.
- **Equipment selling prices** start empty on purpose. The GM Pontiac $28/$20 prices are recorded as customer-specific history. Set approved prices in Knowledge › Equipment.
- Every time standard other than the three confirmed values is an **app-generated planning estimate**, labeled as such and editable in Knowledge › Time standards.
- Data lives on the device. It is **not cloud-synced and not encrypted by the app**. Use Settings › Backup.
- The "master memory" document referenced in the original request was not received. Business rules were taken from the request text and the NRP reference proposal.

## Run locally

```bash
npm install          # also copies the PDF.js worker and PDF fonts into /public
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to enable AI
npm run dev          # http://localhost:3000
npm test             # 62 tests: calculations, guards, QC, persistence, import, PDF export + visual QA
npm run build && npm start
```

Useful scripts:
- `npx tsx scripts/render-pdf.tsx tmp-qa` renders sample proposals (warehouse, portfolio, restaurant) plus an internal estimate to PDF.
- `node scripts/e2e.cjs` runs an iPhone-viewport end-to-end test against `localhost:3100`.
- `node scripts/make-icons.cjs` regenerates the PWA icons.

## Deploy (Vercel)

1. Push this repository to GitHub and import it into Vercel. The framework is detected as Next.js automatically.
2. Set environment variables (Project → Settings → Environment Variables):
   | Variable | Required | Purpose |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | For AI features | Server-side only, never exposed to the browser |
   | `ANTHROPIC_MODEL` | No | Defaults to `claude-opus-5-5` |
   | `APP_ACCESS_TOKEN` | **Strongly recommended** | A passcode the app must send to use AI routes. Prevents anyone who finds the URL from spending your API credits. Enter the same value in Settings › AI & Research. |
3. Deploy. Vercel serves over HTTPS, which iOS requires for PWA install, the service worker and the microphone. AI routes declare `maxDuration` up to 300 s; confirm your Vercel plan allows that function duration.

Any Node 20+ host that runs `next start` behind HTTPS also works.

## Install on iPhone
Open the HTTPS URL in **Safari**, tap **Share → Add to Home Screen**, then launch *Proposal Studio* from the Home Screen. Saved drafts, estimates, the knowledge library and PDF export all work offline. AI and research need a connection.

## Privacy & security
- API keys stay in server environment variables. The browser calls `/api/ai/*` routes, which validate input with zod, enforce size limits, rate-limit, and optionally require `APP_ACCESS_TOKEN`.
- No AI request is sent until you enable **Allow sending proposal content to the AI provider** in Settings.
- Writing requests send customer-facing facts and section text only, never internal rates, minutes, yields or notes. The server does not log proposal content.
- Uploaded files are validated by type, signature and size, and processed in the browser. There are no public file links.
- Security headers include `nosniff`, `X-Frame-Options: DENY`, HSTS, and restricted permissions.

## Architecture
```
src/lib/engine/     deterministic estimator, pricing, frequency, rotation, calibration, recommendations
src/lib/commands/   NL parser, structured ops + approval gate, revision guard
src/lib/writer/     offline proposal writer, AI payload builder
src/lib/pdf/        react-pdf documents, view models (customer vs internal), visual QA, client pipeline
src/lib/import/     PDF/DOCX readers, extraction, import actions
src/lib/qc.ts       quality-control checks
src/lib/db.ts       Dexie schema, seeding, versioning, backup/restore
src/server/         Anthropic gateway (structured outputs, web search, fallbacks), prompts
src/app/            Next.js App Router pages + /api/ai routes
src/components/     design-system primitives, workspace steps, knowledge tabs
```
The data model is ready for future expansion such as cloud sync, CRM, DocuSign, team approvals and regional rate libraries. None of these are required for the core app to work.
