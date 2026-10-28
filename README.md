# Orkin Proposal Studio

A mobile-first progressive web app (PWA) for commercial pest-management proposals, built for Anthony Acosta, Senior Account Manager, Orkin Commercial. It handles property intake, physical service-time estimating, pricing at a $210/hr billable rate, proposal writing and premium PDF export. It is designed for iPhone first and also works in desktop browsers.

## What it does

| Area | What's implemented |
|---|---|
| **Quick Build** | One box on the home screen: say or type the address, pest issue and price. With Claude connected, it looks up the property online (business, size, buildings), plans services, frequency and device layout, locks your stated price exactly, writes every section and runs QC. A summary labels each filled-in item *You said*, *Found online* or *Estimate* and lists what to check before sending. Without Claude it builds the same complete draft from built-in rules and the template writer. Contact details are never invented; a monthly price is never silently converted to per-visit. |
| **Workflow** | Dashboard → New Proposal (templates or dictation) → 8-step workspace: Customer · Services · Conditions · Equipment · Labor · Pricing · Document · Review/Export |
| **Labor estimator** | Deterministic engine with seven components (equipment servicing, installation, walking, inspection, treatment, access/setup, documentation). Separate initial and recurring phases. Multiple technicians, with technician-hours kept distinct from elapsed time. Confidence rating, a formula on every line, and provenance badges (Confirmed / Estimate / Measured / Calibrated). Eleven property models (office, industrial, multifamily by apartments-per-visit, restaurant, warehouse, healthcare, government, campus, exterior-only, specialty…). |
| **Confirmed standards** | $210/hr billable estimating rate ($3.50/min); Tin Cat 1 min; exterior bait station 2 min. Never multiplied by complexity or calibration factors. |
| **Pricing** | Integer-cent arithmetic. Labor and equipment kept separate. No automatic minimum, markup, discount or rounding. Manual price override with lock, plus a comparison of calculated vs. manual price, the difference, and effective hourly yield (internal only). Customer and proposal labor-rate overrides. The rate is stored as a versioned snapshot per proposal. |
| **Frequency & billing** | Weekly ≠ every two weeks ≠ twice monthly. Seasonal, custom, and five-day intensive schedules. Calendar-accurate visit generation (five-visit months). Per-visit billing by default; fixed-monthly only when approved. Contract-period totals off unless enabled for an RFP. |
| **Libraries** | Equipment catalog with approval status, price history and effective dates. Historical pricing library with status labels (customer-specific, approved standard, unverified, overridden, archived), loaded from your **private data pack**, never from this public repository. Only approved standards ever auto-apply. Orkin terminology/capabilities library (Triple Guarantee, A.I.M.®, InSite®) marked *needs verification* until you verify it. |
| **Writing** | An offline template writer produces customer-specific sections per proposal type. With AI configured, Claude rewrites the sections you select, using accepted research and passages retrieved from your knowledge library. Writing changes can never alter prices: this is enforced in code and covered by tests. |
| **Assistant** | Natural-language commands parsed offline (or by AI). Pricing, scope, frequency, guarantee and exclusion changes wait for your explicit approval. Writing and design changes apply directly. |
| **Voice** | Web Speech API dictation where the device exposes it. Otherwise the app says so and points you to iOS keyboard dictation. Dictation is parsed into structured intake (square footage, Tin Cats, stations, frequency, pests, activity areas). |
| **Portrait proposal (default)** | Argument-driven, portrait letter pages modeled on Anthony's own proposals: red edge stripe, hero with dark stat bar, assessment, "why this response" callout, objectives, plan at a glance, scope cards with prices in the header, rotation capacity, separately priced items, responsibilities and exclusions side by side, red price strip. Content flows continuously so pages fill. With Claude connected it writes the story for the specific site; prices are attached by key from the pricing engine and any amount written in prose is removed; terms, guarantee wording and the price summary always come from approved text. Lengths drop optional blocks one at a time (then re-add any that still fit) to fill the page budget. |
| **PDF** | Searchable vector PDF with embedded Roboto Condensed and Lato. Three covers: Executive Charcoal, Corporate White and Property Showcase. Repeating table headers, rows that never split, fixed headers and footers with page numbers, multi-property schedules, specialty tables, photos and floor plans. Separate **Internal Estimate** PDF. Preview rendered as page images, then iOS share sheet (Save to Files / Mail) or download. |
| **QC** | About 30 executed checks across financial, operational, legal/technical and document groups, plus page-by-page **visual inspection of the rendered PDF**: clipped text, overlaps, blank or near-empty pages, smallest font, margin consistency. Checks that can't run are reported as *not run*. |
| **Import** | PDF (pdf.js), DOCX (mammoth), TXT and JSON. Deterministic extraction with evidence and confidence; nothing is saved until you confirm it. AI extraction and AI OCR for scanned PDFs when configured. Six actions: redesign, improve, template, historical reference, **keep everything except the cover** (pdf-lib page merge), and comprehensive. |
| **Knowledge** | Document library with local BM25 retrieval. Extracted facts keep their source and status until you promote them. |
| **Calibration** | Record actual service time. Estimated vs. actual median ratio and MAPE (mean absolute percentage error), grouped by property type, size, frequency, technicians, access, equipment count and pest. Approved factors apply only to app-estimated components. |
| **Data** | IndexedDB (Dexie): proposals, versions, customers, equipment, historical, capabilities, knowledge, assets, assumption versions, settings. Autosave, version history with restore, JSON backup and restore. |
| **PWA** | Manifest, icons, Home Screen standalone mode, safe areas, splash, offline app shell via service worker. Dark mode only, driven by central design tokens; there is no light interface. |

### What needs configuration or verification
- **AI writing, research, OCR, AI extraction and AI command interpretation** run on Claude. On the GitHub Pages install, paste your own Claude API key once in Settings › AI & Research: the phone then calls Anthropic directly. The key stays in this device's local database, is never in the code and is excluded from backups, so set a monthly spend limit in the Anthropic console. On a server deployment, set `ANTHROPIC_API_KEY` instead. The app never claims research happened when it didn't. AI requests are tested against a simulated Claude API, not the live one.
- **Address autocomplete** is not connected. It needs a location provider; enter addresses manually.
- **Triple Guarantee, A.I.M.® and InSite® wording** comes from your reference proposal. Verify it against current orkin.com/commercial material, then mark it verified in Knowledge › Orkin terminology.
- **Equipment selling prices** start empty on purpose. Customer-specific historical equipment prices are references only. Set approved prices in Knowledge › Equipment.
- Every time standard other than the three confirmed values is an **app-generated planning estimate**, labeled as such and editable in Knowledge › Time standards.
- Data lives on the device. It is **not cloud-synced and not encrypted by the app**. Use Settings › Backup.

## Master memory (writing standards)
Anthony's master memory is customer-confidential and is **not** stored in this repository. Set its full text as the `MASTER_MEMORY` server environment variable; without it, a generic customer-neutral standard in `src/server/masterMemory.ts` applies (server-only, prompt-cached). It is included in the AI writing, recommendation and command prompts. Its enforceable rules are also implemented in code:
- **Writer** (`src/lib/writer/`): no automatic signature pages (a concise conclusion and next step instead); site-specific frequency rationale and validated rotation arithmetic (`rationale.ts`); 60-day rodent reviews; consulting deliverables separate from treatment; Triple Guarantee described only as agreement-governed provisions, with no hour commitments.
- **QC** (`src/lib/qc.ts`): blocks response-time promises (including the rejected "on-site within 24 hours"); blocks eradication, compliance, refund and unlimited-service promises; flags goose roundup/relocation and other wildlife methods, owl-box control claims, start-date language, buzzwords and em-dash overuse, "comprehensive" claims and signature pages; checks the rotation math; checks that the RFP requirements matrix is complete.
- **Precedents and historical pricing**: delivered privately as `orkin-private-data-pack.json`. Import it on each device via Settings › Restore from backup › Merge.

To change the standard, update the `MASTER_MEMORY` environment variable and redeploy.

## Run locally

```bash
npm install          # also copies the PDF.js worker and PDF fonts into /public
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to enable AI
npm run dev          # http://localhost:3000
npm test             # 105 tests: calculations, guards, QC, persistence, import, PDF export + visual QA
npm run build && npm start
```

Useful scripts:
- `npx tsx scripts/render-pdf.tsx tmp-qa` renders sample proposals (warehouse, portfolio, restaurant) plus an internal estimate to PDF.
- `node scripts/e2e.cjs` runs an iPhone-viewport end-to-end test against `localhost:3100`.
- `node scripts/make-icons.cjs` regenerates the PWA icons.

## Free install link (GitHub Pages)
The workflow `.github/workflows/pages.yml` tests, builds and publishes a static version to the `gh-pages` branch on every push, served at **https://fitforever96.github.io/Aa/**. This version runs entirely on the phone: estimates, pricing, documents, PDF export, import, backups and offline use all work. AI works after you paste your Claude API key in Settings › AI & Research (or deploy to a server, below). Build locally with `bash scripts/build-pages.sh` and preview with `node scripts/serve-pages.cjs 3200` → http://localhost:3200/Aa/.

## Deploy (Vercel)

1. Push this repository to GitHub and import it into Vercel. The framework is detected as Next.js automatically.
2. Set environment variables (Project → Settings → Environment Variables):
   | Variable | Required | Purpose |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | For AI features | Server-side only, never exposed to the browser |
   | `ANTHROPIC_MODEL` | No | Defaults to `claude-opus-5-5` |
   | `MASTER_MEMORY` | Recommended | Full master-memory text (confidential; keep out of git) |
   | `APP_ACCESS_TOKEN` | **Strongly recommended** | A passcode the app must send to use AI routes. Prevents anyone who finds the URL from spending your API credits. Enter the same value in Settings › AI & Research. |
3. Deploy. Vercel serves over HTTPS, which iOS requires for PWA install, the service worker and the microphone. AI routes declare `maxDuration` up to 300 s; confirm your Vercel plan allows that function duration.

Any Node 20+ host that runs `next start` behind HTTPS also works.

## Install on iPhone
Open the HTTPS URL in **Safari**, tap **Share → Add to Home Screen**, then launch *Proposal Studio* from the Home Screen. Saved drafts, estimates, the knowledge library and PDF export all work offline. AI and research need a connection.

## Privacy & security
- **Bundle exposure:** the seeded historical prices and precedents ship in the app's JavaScript bundle, so anyone who can load the site can read them. Before deploying, enable **Vercel Deployment Protection** (password or Vercel Authentication) so only you can open the app. The master memory itself is server-only.
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
