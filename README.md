# BIZ Nest — Developer Documentation

Next.js implementation of the public [BIZ Nest](https://biznest.co.in/) website: **49 pages** (homepage plus 48 legacy inner pages), **50 forms across 37 pages**, backed by MongoDB and private S3 storage for resumes.

The site was migrated from the original PHP/HTML pages. It keeps the original `.html` URLs, copy, photography, Belleza brand font, layouts, responsive breakpoints and visual values. All page content is committed in this repository; the application never fetches the reference website at runtime.

| Item | Value |
| --- | --- |
| Framework | Next.js 16.4.2 (App Router, Cache Components) |
| UI | React 19.3.0, Tailwind CSS 4.3 |
| Language | TypeScript 5 |
| Database | MongoDB 6 driver |
| File storage | Amazon S3 (`@aws-sdk/client-s3`) |
| Local URL | <http://localhost:3011> |
| Repository | `Kalpesh-Product/BIZ-Nest-` |

---

## Contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Technology stack](#technology-stack)
- [Requirements and setup](#requirements-and-setup)
- [npm scripts](#npm-scripts)
- [Project structure](#project-structure)
- [Rendering pipeline](#rendering-pipeline)
- [Routing and metadata](#routing-and-metadata)
- [Content model and editing](#content-model-and-editing)
- [Styling](#styling)
- [Client interactions and animations](#client-interactions-and-animations)
- [Backend: forms, database and storage](#backend-forms-database-and-storage)
- [Submissions read API](#submissions-read-api)
- [Environment variables](#environment-variables)
- [Database and operator commands](#database-and-operator-commands)
- [Verification and tests](#verification-and-tests)
- [Build and deployment](#build-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing conventions](#contributing-conventions)
- [Known limitations](#known-limitations)

---

## Architecture at a glance

```text
Browser
  │
  ├─ GET /Co-Working_Goa.html
  │     proxy.ts ──► app/[slug]/page.tsx ──► ReferencePage
  │                                            │ content/manifest.json  (valid page + metadata)
  │                                            │ content/pages/*.json   (page tree)
  │                                            ▼
  │                                          React elements + client islands
  │
  └─ POST /api/inquiry (multipart)
        route.ts ──► lib/inquiry-validation.ts ──► lib/mongodb.ts ──► MongoDB
                     (form contract)               │
                                                    ├─► S3 (resume)
                                                    └─► optional webhook

External table UI ──► GET /api/submissions (Bearer key) ──► partner | product | career
```

Key design decisions:

- **One dynamic route renders all inner pages.** Page bodies are JSON trees produced by the migration and rendered by a single shared component. There is no `.tsx` file per inner page.
- **The manifest is the source of truth for URLs and SEO metadata.** A page exists only if `content/manifest.json` has its filename.
- **Server-rendered content, client-side islands.** Only interaction, animation and form components are Client Components.
- **Forms write to MongoDB; resumes go to S3.** Email/webhook notification is optional and never gates a successful save.

## Technology stack

| Technology | Role |
| --- | --- |
| Next.js 16.4.2 | App Router, server rendering, route handlers, metadata, caching, `proxy.ts` |
| React / React DOM 19.3.0 | Server-rendered page tree and client interactions |
| TypeScript 5 | Application typing |
| Tailwind CSS 4 | All layout, typography, responsive and state styling (prefixed `tw:`) |
| `@tailwindcss/postcss` | Tailwind compilation during dev and build |
| MongoDB driver 6.21 | Submission storage |
| `@aws-sdk/client-s3` | Resume upload/download |
| SweetAlert2 11.0.19 | Form result popups (same version as the original site) |
| Swiper, Bootstrap JS, GLightbox | Sliders, collapse/carousel behavior, gallery dialogs |
| ESLint 9 + `eslint-config-next` | Source linting |

Dependencies and exact versions: [`package.json`](package.json) and [`package-lock.json`](package-lock.json).

## Requirements and setup

- Node.js **20.9.0 or newer** (developed on Node.js 22.16.0).
- npm and Git.
- MongoDB Community Server on `127.0.0.1:27017` for form submissions.
- Python is **optional** — only for the legacy capture/conversion and migration-audit scripts.

```sh
npm ci
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run dev
```

Open <http://localhost:3011>. Browsing does not require a database; only form submissions do.

Do not commit `.env`, `.env.local` or credentials. `.gitignore` excludes all `.env*` files except `.env.example`. An existing `.env.local` takes precedence over `.env` and is preserved.

Next.js loads configuration in this order: existing process environment → `.env.$NODE_ENV.local` → `.env.local` → `.env.$NODE_ENV` → `.env`. `scripts/serve.mjs` sets `NODE_ENV` (`development` for `dev`, `production` for `start`) and loads env files **before** starting Next, so `PORT` from `.env` works on Windows and Unix.

## npm scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `node scripts/serve.mjs dev` | Development server on `PORT` (default 3011) |
| `npm run build` | `next build` | Type-check and produce the production build |
| `npm start` | `node scripts/serve.mjs start` | Serve the production build on `PORT` |
| `npm run lint` | `eslint` | Lint the source |
| `npm run forms:sync` | `node scripts/sync-form-contracts.mjs` | Regenerate `content/form-contracts.json` from page forms |
| `npm run styles:sync` | `node scripts/sync-tailwind-candidates.mjs` | Regenerate `content/tailwind-candidates.txt` for Tailwind |
| `npm run db:check` | `node scripts/database.mjs check` | Verify the MongoDB connection |
| `npm run db:setup` | `node scripts/database.mjs setup` | Create collections and indexes |
| `npm run db:collections` | `node scripts/database.mjs collections` | Print the page → collection mapping |
| `npm run db:inquiries` | `node scripts/database.mjs inquiries` | Show the newest 20 submissions |
| `npm run db:migrate` | `node scripts/database.mjs migrate` | Consolidate legacy records into the three form collections |
| `npm run db:migrate-resumes` | `node scripts/database.mjs migrate-resumes` | Count resumes eligible for S3; add `--apply` to upload |
| `npm run db:resume` | `node scripts/database.mjs resume` | Export a resume: `npm run db:resume -- <id> <path>` |
| `npm run test:config` | `node scripts/verify-config.mjs` | Validate config defaults, overrides and safe errors |
| `npm run test:backend` | `node scripts/verify-backend.mjs` | Integration test against a disposable MongoDB database |

`forms:sync` and `styles:sync` run automatically via `predev` / `prebuild`. Development and production share port 3011 — stop one before starting the other. Both use the `.next` build directory, so do not build while a dev server is running.

## Project structure

```text
app/
  layout.tsx                 Root document, font preload, shared classes, metadata defaults
  page.tsx                   Homepage entry (renders index.html)
  [slug]/page.tsx            Dynamic route for every legacy inner page
  globals.css                Tailwind imports, vendor layers, content sources
  tailwind-variants.css      Generated selector/state/media variants
  tailwind-exceptions.css    Brand @font-face and CSS-only exceptions
  not-found.tsx              404 screen
  robots.ts                  /robots.txt
  sitemap.ts                 /sitemap.xml from the manifest
  api/inquiry/route.ts       POST form submissions
  api/submissions/route.ts   GET protected submissions read API
components/
  reference-page.tsx         Manifest lookup, JSON read, node → React renderer
  inquiry-form.tsx           Client form submission, retry key, pending state
  submission-alerts.ts       SweetAlert2 result popups (lazy loaded)
  site-link.tsx              Prefetched Next.js links with scroll handling
  navigation-boundary.tsx    Recreates page DOM per pathname without extra markup
  site-interactions.tsx      Mobile nav, galleries, dialogs, Swiper, FAQ
  page-animations.tsx        Scroll entrances and statistic counters
  animation-styles.ts        Shared reveal classes for first paint
content/
  manifest.json              Valid page names, titles and descriptions
  pages/*.json               49 migrated page trees with Tailwind utilities
  form-contracts.json        Generated per-page form schemas (validation source)
  tailwind-root.json         Shared html/body/skip-link classes
  tailwind-candidates.txt    Generated raw class candidates for Tailwind
  tailwind-migration.json    Migration statistics
lib/
  server-config.mjs          Central env parsing and validation (server/CLI only)
  mongodb.ts                 Shared MongoDB connection pool
  form-collections.mjs       Page → collection mapping, companyType, indexes
  submission-document.mjs    Allowed business fields per collection
  inquiry-validation.ts      FormData validation against the contracts
  submissions-table.ts       Read API query parsing, projection and row shaping
  s3-attachments.mjs         S3 upload, read and delete
  migrate-form-collections.mjs  Legacy → three-collection migration
scripts/
  serve.mjs                  Env-aware launcher for the Next.js CLI
  sync-form-contracts.mjs    Form contract generator
  sync-tailwind-candidates.mjs  Tailwind candidate generator
  database.mjs               Operator CLI (check/setup/migrate/inquiries/resume)
  verify-config.mjs          Configuration tests
  verify-backend.mjs         Backend integration test
  verify-site.mjs            HTTP + content audit for a running server
  mirror-reference.py        Legacy: capture the public site
  convert-reference.py       Legacy: HTML capture → content JSON
  migrate-to-tailwind.py     One-time Tailwind migration utility
  verify-tailwind.py         Tailwind migration audit
  verify-navigation-parity.py  Rendered-tree comparison between two servers
  restore-reference-animations.py  Restore animation markers from the capture
public/assets/
  fonts/ img/ vendor/        Local fonts, photography, vendor CSS/JS
proxy.ts                     404 handling for unknown legacy .html URLs
next.config.ts               Response headers, Cache Components, partial prefetching
postcss.config.mjs           Tailwind PostCSS integration
```

Ignored, generated directories: `.next/` (build output), `.reference/` (capture and backups), `node_modules/`, `.next-tailwind/`. Edit source files, never build output.

## Rendering pipeline

For `GET /contact.html`:

1. `proxy.ts` matches the path (it skips `/api`, `/_next` and `/assets`). If the URL ends in `.html` and is **not** a manifest key, it rewrites to `/_not-found` with status **404** before streaming starts.
2. `app/[slug]/page.tsx` decodes the parameter (Next can supply percent-encoded values for names with spaces or `&`) and checks the manifest.
3. `ReferencePage` reads `content/pages/<name>.json` with `node:fs/promises` from `process.cwd()`.
4. `renderNode` converts the tree to React elements and:
   - maps HTML attributes (`class` → `className`, `for` → `htmlFor`, `tabindex` → `tabIndex`, …);
   - drops `on*` handlers, legacy presentation attributes and inline `style`;
   - converts `input` values to `defaultValue` / `defaultChecked` and joins `textarea` text;
   - wraps `<form>` nodes in `InquiryForm`;
   - renders internal `.html` links through `SiteLink`;
   - adds first-paint reveal state for animated nodes.
5. `layout.tsx` provides the HTML document, favicon, font preload and shared root classes.
6. `NavigationBoundary` re-keys the route subtree by pathname so the legacy document-scoped UI operates on one live page.
7. `SiteInteractions` and `PageAnimations` attach browser behavior after hydration.

`ReferencePage` is wrapped in `'use cache'` with `cacheLife('max')`, so page output is cached per page name. In development, edits to JSON may need a server restart because of that cache; in production, rebuild and restart after content changes.

## Routing and metadata

| URL | Content file |
| --- | --- |
| `/` | `content/pages/index.json` (via `app/page.tsx`) |
| `/index.html` | `content/pages/index.json` (via `[slug]`, canonicalized to `/` by links) |
| `/Co-Working_Goa.html` | `content/pages/Co-Working_Goa.json` |
| `/career_PHP_Developer.html` | `content/pages/career_PHP_Developer.json` |
| `/Meetings&Conferences.html` | `content/pages/Meetings&Conferences.json` |
| `/privacy_policy.html` | `content/pages/privacy_policy.json` |

- `generateStaticParams()` enumerates every manifest key.
- `generateMetadata()` uses the manifest title and description. The `title`/`description` fields inside page JSON are not used for head metadata; update the manifest when SEO text changes.
- Unknown pages call `notFound()`; unknown `.html` URLs are real 404 responses.
- The route matches a **single** segment only (not nested paths such as `/products/example`).
- `sitemap.ts` emits `/`, every other manifest page, and uses `SITE_URL`; `robots.ts` allows public pages, disallows `/api/`, and points at the sitemap.
- Filenames are case- and spelling-sensitive. Preserve spaces and `&` exactly; share encoded URLs.

## Content model and editing

Each page JSON has this shape:

```json
{
  "title": "Example page | BIZ Nest",
  "description": "Example description",
  "nodes": [
    {
      "tag": "main",
      "attrs": { "id": "main" },
      "children": [
        {
          "tag": "h1",
          "attrs": { "class": "tw:[color:#ffc732] tw:text-[40px]" },
          "children": ["Welcome to BIZ Nest"]
        }
      ]
    }
  ]
}
```

- `tag` — HTML element name.
- `attrs` — attribute map; values are strings.
- `children` — nested nodes or text strings.

### Edit an existing page

1. Locate the JSON file using the routing table.
2. Edit text, attributes, utility classes or children without breaking JSON syntax.
3. Update `content/manifest.json` if the title or description changes.
4. Run `npm run styles:sync` if you added Tailwind classes while the dev server is running (it also runs before `dev` and `build`).
5. Rebuild/restart production, then verify the route.

Header, footer and navigation markup is duplicated inside every page tree. A global nav or footer change therefore requires updating multiple JSON files.

### Add a page

1. Create `content/pages/example.json` with the schema above.
2. Add `"example.html"` with `title` and `description` to `content/manifest.json`.
3. Link to `/example.html` from the relevant navigation/content.
4. Include one main landmark with `id="main"` so the skip link and anchor work.
5. Run `npm run forms:sync` if the page contains a form.
6. Build and verify `/example.html`.

No new route file is needed for a single-segment `.html` page. Use a dedicated App Router route for a different URL structure.

> **Trust boundary:** page JSON is trusted application source. The renderer strips scripts and inline handlers, but it is not a sanitizer for untrusted HTML. Implement behavior in React components, not in content.

## Styling

| Location | Responsibility |
| --- | --- |
| Page JSON `attrs.class` | Exact-value Tailwind utilities for each migrated element |
| [`app/globals.css`](app/globals.css) | Layer order, vendor imports, Tailwind theme/utilities, content sources |
| [`app/tailwind-variants.css`](app/tailwind-variants.css) | Generated ordered variants (selectors, states, media); no visual declarations |
| [`app/tailwind-exceptions.css`](app/tailwind-exceptions.css) | Belleza `@font-face` and CSS-only exceptions |
| `content/tailwind-root.json` | Shared `html` / `body` / skip-link classes |
| `public/assets/vendor/` | Icon fonts, Swiper CSS, vendor styles |

Important rules:

- **Tailwind is prefixed with `tw:`** to avoid collisions with retained selectors such as `container`, `form-control` and `.swiper`.
- **Preflight is intentionally not loaded.** The original browser normalization was converted to utilities; a different reset would change appearance.
- Migrated tokens look like `tw:r005785:[font-family:logo-font]`, where the generated variant preserves original specificity, pseudo-elements, states, media conditions and declaration order. Do not rename or reorder them.
- For new UI, use ordinary prefixed utilities: `tw:flex tw:items-center tw:p-[12px]`.
- To adjust migrated styling, edit the existing utility rather than appending a conflicting lower-specificity class.
- Tailwind scans `content/tailwind-candidates.txt` plus `components/` and `app/`, not the escaped JSON. `styles:sync` writes complete class names; never edit that file by hand.
- Fractional grid percentages use small custom-property arithmetic so CSS optimizers cannot round them and shift subpixel geometry.

Assets under `public` are served from the site root: `public/assets/img/example.webp` → `/assets/img/example.webp`. Use root-relative URLs and descriptive `alt` text. The brand font is `public/assets/fonts/Belleza-Regular.ttf`. Keep vendor license notices.

## Client interactions and animations

[`components/site-interactions.tsx`](components/site-interactions.tsx) owns:

- Mobile navigation and product dropdowns.
- Gallery category filtering and image/video dialogs.
- Dialog keyboard navigation, focus handling and Escape-to-close.
- Inquiry popups and scroll-to-top.
- Swiper initialization (reduced-motion aware, refreshed after fonts load).

Testimonial carousels use the reference's 600 ms transition and 5000 ms autoplay, one card below 1200 px and two at 1200 px+, with runtime-generated pagination bullets styled through Tailwind.

[`components/page-animations.tsx`](components/page-animations.tsx) restores captured entrance markers (`fade-up`, `fade`, `zoom-in`) at the original scroll offset and durations, plus the homepage statistic counters driven by `data-purecounter-*` attributes. The server adds `data-reveal-state="pending"` and shared reveal classes before first paint, so content is never shown and then hidden. Reduced-motion users and visitors without JavaScript see content immediately.

Interactions rely on legacy hooks such as `.glightbox`, `.portfolio-item`, `.swiper` and `#popup-modal`. Renaming those selectors in content requires updating the interaction component.

[`components/site-link.tsx`](components/site-link.tsx) renders internal links with `<Link prefetch={true}>`; external links, downloads, gallery controls and hash-only anchors keep native behavior. [`components/navigation-boundary.tsx`](components/navigation-boundary.tsx) re-creates the page DOM on pathname changes (including Back/Forward) via a keyed Fragment, preventing duplicate IDs while keeping prefetched route data.

## Backend: forms, database and storage

All 50 forms post multipart data to `POST /api/inquiry`, replacing the original `forms/*.php` endpoints.

### Collections

| Collection | Contents | Business fields |
| --- | --- | --- |
| `partner` | `/partner.html` submissions | `name`, `email`, `mobile`, `message`, `pagename` |
| `product` | All product/subscription forms | `name`, `email`, `mobile`, `count`, `sdate`, `pagename`, `category` |
| `career` | All job applications | `name`, `email`, `dob`, `mobile`, `location`, `experience`, `linkedin`, `currentmonthlysalary`, `expectedsalary`, `canjoin`, `relocategoa`, `personality`, `skills`, `specialexperience`, `willing`, `message`, `job_position` |
| `submission_limits` | Hashed email rate-limit buckets | `_id` (hash), `count`, `expiresAt` (TTL) |

Every record also stores `source`, `kind`, `sourceCompany` (`"BIZ Nest"`), `status`, `createdAt`, `updatedAt`, `notification`, `fingerprint`, optional `idempotencyKey`, and for product records a server-derived `companyType` (for example `Co-Working`, `Meeting Room`, `Workation`, `Virtual Office`).

`lib/form-collections.mjs` maps each source page to its collection and company type; `lib/submission-document.mjs` whitelists the fields a client may write, so submitted answers cannot overwrite system metadata.

### Indexes

Created by `db:setup` and lazily on the first submission:

- Unique partial `{ source: 1, idempotencyKey: 1 }` per form collection.
- `{ createdAt: -1 }` for listing.
- TTL `{ expiresAt: 1 }` on `submission_limits`.

### Request lifecycle

1. Reject a mismatched `Origin` header (`403`).
2. Validate the `Idempotency-Key` format when supplied.
3. Enforce the body limit while streaming (even without `Content-Length`) and require `multipart/form-data`.
4. Validate against `content/form-contracts.json`: known source page, known and non-duplicate fields, required fields, select options, dates, numeric min/max, length caps, email and 10-digit mobile (`[1-9]`).
5. Hidden page/job identifiers come from the server contract, not the browser.
6. Resume: PDF/Word/ZIP extension **and** magic-byte signature check, size cap.
7. Compute a SHA-256 fingerprint of source + fields + resume bytes.
8. If the `(source, idempotencyKey)` row exists: identical fingerprint → `200` with the original id; different data → `409`.
9. Atomically increment the hashed-email bucket for the current window; above the cap → `429`.
10. Upload the resume to S3 (career forms), then insert the record.
11. If `INQUIRY_WEBHOOK_URL` is set, forward the multipart payload after the insert (15 s timeout, inquiry id as idempotency key, optional bearer token) and record `notification.status`.
12. Return JSON `{ message, id }`.

| Status | Meaning |
| --- | --- |
| `200` | Saved, or an identical retry |
| `400` | Invalid field, source page, retry key or attachment |
| `403` | Mismatching supplied origin |
| `409` | Retry key reused with different data |
| `413` | Body too large |
| `429` | Submission limit exceeded |
| `503` | Database/S3 unavailable; the message points to `response@biznest.co.in` |

### Resumes in S3

Resumes are uploaded to `wonov-aws-s3-storage` (region `ap-south-1`) under:

```text
wono/BizNest/New BIZ Nest Website/Resumes/<mongo-id>/file.<ext>
```

Required server credentials: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (plus `AWS_SESSION_TOKEN` for temporary credentials). Career records store `resumeLink` and nested `{ filename, contentType, size }` metadata. A failed database insert triggers cleanup of the just-uploaded object.

Export a resume with `npm run db:resume -- <inquiry-id> <output-path>`; the command works for both S3 and legacy embedded files and refuses to overwrite an existing file.

### Webhook notifications

Optional. `notification.status` is `disabled` (no URL), `pending`, `delivered` or `failed`. Notification failures never discard data or turn a saved submission into an error. There is no retry worker; inspect failed notifications in MongoDB.

### Frontend behavior

`InquiryForm` keeps the original markup and pending state, sends `source` from the current pathname, and generates an `Idempotency-Key` that stays stable while the payload is unchanged. Success shows the original SweetAlert2 success popup and resets the form; errors keep the values and show a persistent error popup with an inline fallback.

### Privacy

No anonymous endpoint lists submissions or downloads resumes. Operator commands print personal data — run them only in a trusted terminal. Backups and migration exports contain full submissions and resumes; keep them private.

## Submissions read API

`GET /api/submissions` exposes a read-only, paginated, uncached view for external tables.

```text
Authorization: Bearer <SUBMISSIONS_API_KEY>
```

- The key must be at least 32 non-whitespace characters; an empty key disables reads (`503`).
- Keys are compared in constant time; missing/incorrect credentials return `401`.
- `format=table` (default) returns `{ data, pagination, columns }`; `format=datatables` returns the DataTables server-side shape.
- Filters: `kind`, `source`, `status`, `search`, `from`/`to`, `sortBy`, `sortOrder`, `page`, `pageSize` (1–100).
- Cross-origin browser access requires an explicit `SUBMISSIONS_ALLOWED_ORIGINS` allowlist; there is no wildcard and no cookie sharing.
- Responses use `Cache-Control: private, no-store`; queries have a 5 s limit; search is escaped literal text.

Prefer calling this API from an external project's protected backend so the shared key never reaches a browser bundle. Full parameter, row-shape, DataTables and per-form filter documentation: [`docs/submissions-api.md`](docs/submissions-api.md).

## Environment variables

All settings live in `.env.example`, are parsed centrally in `lib/server-config.mjs`, and are server-only. Invalid values fail with the variable name but never print the value. Hosting-injected variables take priority over files.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Listener port for dev and production | `3011` |
| `SITE_URL` | Canonical HTTP(S) origin for sitemap/robots; no path, query or fragment | `https://biznest.co.in` |
| `MONGODB_URI` | MongoDB connection string (server-only) | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | Database name | `biznest` |
| `MONGODB_MAX_POOL_SIZE` | Max pooled connections (1–100) | `10` |
| `MONGODB_CONNECT_TIMEOUT_MS` | Connection timeout | `5000` |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Server selection timeout | `5000` |
| `MAX_REQUEST_BYTES` | Multipart body limit, including attachments | `6000000` |
| `MAX_RESUME_BYTES` | Resume size limit | `5000000` |
| `INQUIRY_RATE_LIMIT_MAX` | New submissions per normalized email per window | `10` |
| `INQUIRY_RATE_LIMIT_WINDOW_MS` | Fixed rate-limit window | `900000` |
| `INQUIRY_WEBHOOK_URL` | Optional notification endpoint | empty (storage only) |
| `INQUIRY_WEBHOOK_TOKEN` | Optional bearer token for the webhook | empty |
| `INQUIRY_WEBHOOK_TIMEOUT_MS` | Webhook timeout | `15000` |
| `SUBMISSIONS_API_KEY` | Bearer key for the read API | empty (reads disabled) |
| `SUBMISSIONS_ALLOWED_ORIGINS` | Comma-separated browser origins for the read API | empty |
| `AWS_ACCESS_KEY_ID` | S3 access key (server-only) | empty |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key (server-only) | empty |
| `AWS_SESSION_TOKEN` | Optional temporary-credential token | empty |
| `BACKEND_TEST_PORT` | Isolated integration-test port | `3013` |

Constraints enforced at startup:

- `MAX_REQUEST_BYTES` must be at least `MAX_RESUME_BYTES` + 65,536 for multipart overhead (max 12,000,000).
- `MAX_RESUME_BYTES` is capped at 10,000,000.
- `SITE_URL` must be an HTTP(S) origin without credentials.
- `SUBMISSIONS_ALLOWED_ORIGINS` entries must be bare origins without trailing slashes.

Set `SITE_URL` **before** building; metadata is generated at build time. Restart after changing runtime settings. Never expose any of these through `NEXT_PUBLIC_` variables, `next.config.env`, client components, page JSON or logs.

## Database and operator commands

```sh
npm run db:setup
npm run db:check
npm run db:collections
npm run db:inquiries
npm run db:inquiries -- career
npm run db:inquiries -- <inquiry-id>
npm run db:resume -- <inquiry-id> ./resume.pdf
npm run db:migrate-resumes
node scripts/database.mjs migrate-resumes --apply
```

The operator CLI loads development env files by default; set `NODE_ENV=production` when running against production settings.

### Migrating legacy data

`npm run db:migrate` consolidates older per-form collections into `partner`, `product` and `career`, flattens answers to top-level fields and fills `companyType`. It validates before mutating, writes a BSON-aware Extended JSON backup under `.reference/mongodb-backups/`, verifies every copy, and then removes obsolete collections. Conflicting values, unknown sources or inconsistent duplicate IDs stop the migration. It is safe to rerun after mapping changes; stop applications still using the old layout first.

### Troubleshooting data

Connect MongoDB Compass to `mongodb://127.0.0.1:27017` and open `biznest`:

```js
db.product.find({ source: "/Private_Workspace.html" }).sort({ createdAt: -1 })
db.career.find({ email: "person@example.com" })
db.submission_limits.find()
```

Do not expose port 27017 publicly. Backup and retention follow your MongoDB operations policy; the app does not delete submissions automatically.

## Verification and tests

```sh
npm run lint
npm run build
npm run test:config
```

With a production server running (`npm start`), audit routes, assets and content integrity:

```sh
node scripts/verify-site.mjs
node scripts/verify-site.mjs http://localhost:3011
```

`verify-site.mjs` checks that:

- `/`, every manifest page, `/robots.txt` and `/sitemap.xml` return `200` (52 requests);
- unknown legacy `.html` URLs return `404`;
- referenced local `href`/`src`/`poster` assets exist;
- internal `.html` links are manifest keys;
- no page tree contains `<script>` or inline `on*` handlers;
- animation markers and pending reveal states survive server rendering;
- invalid form input returns `400` and a foreign origin returns `403`.

Backend integration (after a build; requires MongoDB):

```sh
npm run test:backend
```

It starts an isolated production server on port 3013 with a randomly named `biznest_test_*` database, exercises all 37 form pages, retry keys, validation, rate limits, S3 resume links, notification failure handling, migration/backup and the protected read API, then removes its database and server. Set `BACKEND_TEST_PORT` if 3013 is busy. Tests force default limits so local tuning does not change expectations.

Tailwind migration audits (optional; require Python, and `tinycss2` for compiled-CSS checks):

```sh
python scripts/verify-tailwind.py
python scripts/verify-tailwind.py .next
python scripts/verify-navigation-parity.py BASELINE_URL OPTIMIZED_URL
```

These are smoke and migration audits, not a unit/end-to-end suite. They do not prove every browser, interaction state or pixel-identical rendering, and they do not deliver a real webhook notification. Manually inspect desktop and mobile layouts, navigation, galleries, sliders, FAQs, focus behavior and form feedback for visible changes.

## Build and deployment

The application requires a **Node.js runtime**: server-side filesystem reads, route handlers, `proxy.ts` and Cache Components. A static-only host cannot run it.

```sh
npm ci
# configure environment, including SITE_URL
npm run build
npm start
```

Checklist:

1. `npm ci` on the server (commit any intentional lockfile changes).
2. Configure env/secrets in the hosting panel: `SITE_URL`, MongoDB settings, `AWS_*`, and optionally `SUBMISSIONS_API_KEY`, `SUBMISSIONS_ALLOWED_ORIGINS`, webhook settings.
3. Build, then start under a process manager.
4. Route the HTTPS domain to port `3011` (or lower the platform port through `PORT`).
5. Verify page URLs, assets, 404s, sitemap host, and a real form submission on the deployment.

Deployment packaging must include `public/`, `content/` and the build output — the renderer resolves `content/pages` from the process working directory, so do not start it from an unrelated folder. No static export, standalone output, CI workflow or automatic deployment is configured. Response headers set in `next.config.ts`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`.

Reverse proxies must preserve the request `Origin`/protocol used by the same-origin form check, or valid submissions will return `403`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `EADDRINUSE` on 3011 | Stop the process using the port; dev and prod share it |
| “Another next dev server is already running” | Stop the existing dev process for this checkout |
| `npm start` has no build | Run `npm run build` successfully first |
| JSON edits not visible | Validate JSON; restart dev (render cache); rebuild production |
| Inner page 404 | Exact manifest key, filename case, and URL encoding |
| Asset 404 | File exists under `public`; URL omits the `public` prefix |
| Gallery/popup stopped working | Selectors such as `.glightbox`, `.swiper`, `#popup-modal` still present |
| Forms return `503` | MongoDB reachable; S3 credentials set for resumes |
| Forms return `403` after deploy | Proxy origin/protocol forwarding and browser origin |
| Forms return `429` | Email hit the 10-per-15-minute bucket |
| Sitemap uses the wrong host | Set `SITE_URL` and rebuild |
| Tailwind class missing | Run `npm run styles:sync`; class must be complete, not concatenated |

## Contributing conventions

- Keep changes focused: content edits in `content/`, behavior in `components/`, server logic in `lib/` or route handlers.
- Preserve legacy `.html` URLs unless redirects are deliberately introduced.
- Update every affected page tree when shared navigation/footer markup changes.
- Regenerate `form-contracts.json` after changing form fields (`npm run forms:sync`).
- Keep secrets out of Git and out of anything shipped to the browser.
- Retain vendor attribution and license notices.
- Run the relevant checks and state what was verified in the pull request.
- Update this README and `.env.example` when commands, architecture or configuration change.
- Coding agents must follow [`AGENTS.md`](AGENTS.md) and read the bundled Next.js 16 documentation under `node_modules/next/dist/docs/` before changing framework code.

## Known limitations

- The content is a migration snapshot: inner pages are JSON trees and header/footer markup is duplicated across them.
- The renderer is tailored to this captured markup, not a general CMS.
- Login, booking, maps, social profiles and some media depend on external services; the separate login application was not replicated.
- No CMS, account system, payment flow, automated tests or deployment pipeline is included.
- There is no automatic retry for failed webhook notifications.
- Exact pixel parity across every browser and interaction state has not been established.
