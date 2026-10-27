# BIZ Nest — Developer Documentation

Next.js and Tailwind CSS implementation of the public [BIZ Nest website](https://biznest.co.in/), including the homepage and 48 linked inner pages. The migration preserves the original `.html` URLs, page content, photography, Belleza font, layouts, responsive conditions, and exact styling values.

The reference capture was made on **21 October 2026**. Content is served from files in this repository; the application does not fetch the reference website during normal browsing.

> **Architecture:** This project renders migrated page content from JSON through a shared React component. There is no separate `.tsx` component for every inner page. JSON-based pages are a project-specific migration choice, not a Next.js requirement.

> **Form delivery:** No database, SMTP service, or form delivery receiver is included. Submissions show an email fallback until a delivery webhook is configured.

## Contents

- [Technology stack](#technology-stack)
- [Requirements and setup](#requirements-and-setup)
- [Commands and ports](#commands-and-ports)
- [Project structure](#project-structure)
- [Request and rendering flow](#request-and-rendering-flow)
- [Routing and page metadata](#routing-and-page-metadata)
- [Content format and editing](#content-format-and-editing)
- [Styling and assets](#styling-and-assets)
- [Interactive components](#interactive-components)
- [Forms and backend integration](#forms-and-backend-integration)
- [Environment variables](#environment-variables)
- [Caching and builds](#caching-and-builds)
- [Verification](#verification)
- [Deployment](#deployment)
- [Source migration tools](#source-migration-tools)
- [Troubleshooting](#troubleshooting)
- [Contributing and maintenance](#contributing-and-maintenance)
- [Current limitations](#current-limitations)

## Technology stack

| Technology | Role |
| --- | --- |
| Next.js 16.4.2 | App Router, server rendering, route handlers, metadata, caching, and builds |
| React / React DOM 19.3.0 | Components and browser interaction |
| TypeScript 5 | Type checking for application source |
| Tailwind CSS 4 | Page, layout, typography, responsive, and state styling |
| Tailwind PostCSS integration | Compiles the utility classes during development and production builds |
| Bootstrap JavaScript | Existing collapse/carousel behavior; the Bootstrap layout stylesheet is removed |
| Swiper | Sliders and testimonials |
| JSON content files | Migrated page trees with Tailwind utility classes |
| ESLint 9 | Source linting |

The website uses Tailwind utilities, prefixed with `tw:` to avoid collisions with retained behavior selectors. Original class names such as `container` and `form-control` remain as selector hooks; their visual declarations are now Tailwind utilities. Dependency versions are recorded in [package.json](package.json) and resolved in [package-lock.json](package-lock.json).

## Requirements and setup

- Node.js **20.9.0 or newer**, as required by the installed Next.js package. The project has been run with Node.js 22.16.0.
- npm and Git.
- Python is optional and only needed to refresh the original website capture.

Clone this repository and open a terminal in its root directory, alongside `package.json`.

```sh
npm ci
npm run dev
```

Open [http://localhost:3011](http://localhost:3011).

`npm ci` installs the versions recorded in the lockfile. Use `npm install` when intentionally changing dependencies, and include the resulting lockfile changes in your commit.

Environment configuration is optional for browsing locally. To configure form delivery or sitemap URLs, copy `.env.example` to `.env.local` using your editor or one of these commands:

```sh
# Git Bash, macOS, or Linux
cp .env.example .env.local
```

```powershell
# PowerShell
Copy-Item .env.example .env.local
```

Do not commit `.env.local` or credentials. `.gitignore` excludes environment files while retaining `.env.example`.

## Commands and ports

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port **3011** |
| `npm run build` | Compile, type-check, and generate the production build |
| `npm start` | Serve the existing production build on port **3011** |
| `npm run lint` | Run ESLint |
| `npm run styles:sync` | Synchronize complete Tailwind candidates from parsed page JSON |
| `node scripts/verify-site.mjs` | Audit a running site, defaulting to `http://localhost:3011` |
| `node scripts/verify-site.mjs http://localhost:3011` | Audit an explicitly selected local server |

Development and production use the same port. **Stop one with Ctrl+C before starting the other.**

To run the production version locally:

```sh
npm run build
npm start
```

To change the default port, update both the `dev` and `start` scripts in `package.json`, the audit script's default URL, and the examples in this README. Root-relative page and asset links automatically follow the current origin and port.

## Project structure

```text
app/
  layout.tsx                   Root HTML document, shared stylesheet links, favicon
  page.tsx                     Homepage entry point
  [slug]/page.tsx               Dynamic route for legacy inner-page URLs
  api/inquiry/route.ts          POST endpoint for inquiries and applications
  globals.css                  Tailwind imports and source registration
  tailwind-variants.css         Generated selector, state, and media variants
  tailwind-exceptions.css       Necessary CSS-only font-face definition
  not-found.tsx                Missing-page screen
  robots.ts                    Generates /robots.txt
  sitemap.ts                   Generates /sitemap.xml
components/
  reference-page.tsx           Reads JSON and renders server React elements
  site-link.tsx                Prefetched Next.js page links and scroll intent
  navigation-boundary.tsx      Resets page DOM without a layout wrapper
  inquiry-form.tsx             Browser form submission and feedback
  site-interactions.tsx        Menus, filtering, dialogs, galleries, and sliders
  page-animations.tsx          Shared scroll entrances and statistic counters
content/
  manifest.json                Supported page names, titles, and descriptions
  pages/*.json                 Individual migrated page trees with utility classes
  tailwind-root.json           Shared HTML/body/skip-link utility classes
  tailwind-candidates.txt      Generated complete class names for Tailwind scanning
  tailwind-migration.json      Migration counts
public/assets/
  fonts/                       Local fonts
  img/                         Local photographs, logos, and icons
  vendor/                      Original vendor styles, scripts, and fonts
scripts/
  mirror-reference.py          Captures public source pages and assets
  convert-reference.py         Converts captured pages into content JSON
  verify-site.mjs              HTTP and content-integrity audit
  sync-tailwind-candidates.mjs  Extracts Tailwind candidates without JSON escaping
  migrate-to-tailwind.py        One-time conversion from the local legacy snapshot
  verify-tailwind.py            Audits utility migration and compiled CSS coverage
proxy.ts                       Ensures unknown legacy HTML URLs return HTTP 404
next.config.ts                 Build directories, caching, headers, and Turbopack
postcss.config.mjs             Official Tailwind PostCSS integration
.env.example                   Documented environment settings
AGENTS.md                      Repository instructions for coding agents
```

Generated directories are ignored by Git:

- `.next/`: development output.
- `.next-production/`: production output.
- `.reference/`: downloaded source capture and inventory.
- `node_modules/`: installed packages.

Edit source files rather than generated build output or installed dependencies.

## Request and rendering flow

For a request to `/contact.html`:

```text
Browser requests /contact.html
  -> proxy.ts checks the legacy URL
  -> app/[slug]/page.tsx receives slug = "contact.html"
  -> content/manifest.json confirms the page exists
  -> ReferencePage reads content/pages/contact.json
  -> renderNode converts the tree to React elements
  -> app/layout.tsx supplies the outer HTML document and shared styles
  -> browser displays the page and activates client interactions
```

The root URL `/` follows `app/page.tsx`, which calls `ReferencePage` with `index.html`. `/index.html` is also supported by the dynamic route.

Most page rendering runs on the server. Only the interaction and form components declare `'use client'`, enabling browser state and event handling. Client Components can be prerendered initially; their JavaScript then attaches interactive behavior in the browser, a process called hydration.

The renderer uses `React.createElement` to build the content tree and translates HTML attributes such as `class` and `for` into React's `className` and `htmlFor`. Form nodes become `InquiryForm` components.

## Routing and page metadata

[app/[slug]/page.tsx](app/%5Bslug%5D/page.tsx) handles a single URL segment. Examples include:

| URL | Content file |
| --- | --- |
| `/` or `/index.html` | `content/pages/index.json` |
| `/Co-Working_Goa.html` | `content/pages/Co-Working_Goa.json` |
| `/subscription.html` | `content/pages/subscription.json` |
| `/demos.html` | `content/pages/demos.json` |
| `/partner.html` | `content/pages/partner.json` |
| `/career.html` | `content/pages/career.json` |
| `/contact.html` | `content/pages/contact.json` |

Preserve filename capitalization and spelling. Some original names include spaces or `&`; use correctly encoded URLs when sharing those links. The existing route is not a catch-all for nested paths such as `/products/example`.

The manifest is the runtime authority for valid pages and their metadata. `generateStaticParams()` provides its page names for build-time rendering, and `generateMetadata()` uses its title and description. Unknown page names call `notFound()`. The proxy also sets a 404 status for unknown `.html` URLs before streaming begins.

The sitemap includes the homepage and inner pages from the manifest. `robots.ts` permits public pages and disallows `/api/`. Its directives guide crawlers; they do not provide access control.

## Content format and editing

### Page schema

Each page JSON contains:

```json
{
  "title": "Example page | BIZ Nest",
  "description": "Example page description",
  "nodes": [
    {
      "tag": "main",
      "attrs": { "id": "main" },
      "children": [
        {
          "tag": "h1",
          "attrs": { "class": "tw:[color:#ffc732]" },
          "children": ["Welcome to BIZ Nest"]
        }
      ]
    }
  ]
}
```

This is a structural example, not a complete branded page template.

- `tag`: HTML element name.
- `attrs`: attributes; values in generated content are strings.
- `children`: nested node objects or text strings.
- Page-specific CSS and inline `style` attributes have been removed. Styling lives in complete `tw:` utility tokens in `attrs.class`.

Page-level JSON also retains the captured title and description. The renderer currently obtains browser metadata from **the manifest**, so update the manifest when changing a page's SEO title or description.

### Change an existing page

1. Find its JSON file using the route-to-filename mapping above.
2. Format the JSON in your editor before editing if needed; generated files are compact.
3. Update the relevant text, attributes, utility classes, or child nodes without breaking JSON syntax.
4. Update the manifest if the title or description changes.
5. If utility classes changed while development is running, run `npm run styles:sync` so Tailwind sees the new candidates. This runs automatically before `npm run dev` and `npm run build`.
6. Inspect the page locally and run the appropriate checks.

Header and footer markup currently exists inside each migrated page tree. A navigation or footer change may therefore require updating multiple JSON files. A shared renderer does not mean those content sections are shared React components.

Treat these JSON files as trusted application source. The migration removes scripts and inline event handlers, but the renderer is **not a general-purpose sanitizer for untrusted user HTML**. Implement interactions in the React components rather than adding scripts to content.

### Add a page using the existing renderer

1. Create `content/pages/example.json` with the page schema.
2. Add `example.html` to `content/manifest.json` with its title and description.
3. Add a link to `/example.html` in the relevant navigation or content.
4. Include one main content landmark with `id="main"` so the skip link works.
5. Rebuild for production and verify `/example.html`.

No additional page route is required for a new single-segment `.html` page. For a new URL structure or a feature that needs dedicated JSX, create the appropriate App Router route and components instead.

## Styling and assets

| Location | Responsibility |
| --- | --- |
| Page JSON `attrs.class` | Exact-value Tailwind utilities for each migrated element |
| [app/globals.css](app/globals.css) | Tailwind imports, explicit source configuration, and necessary vendor imports |
| [app/tailwind-variants.css](app/tailwind-variants.css) | Ordered selector/state/media variants; no visual property declarations |
| [app/tailwind-exceptions.css](app/tailwind-exceptions.css) | Local brand font-face, which requires CSS |
| [content/tailwind-root.json](content/tailwind-root.json) | Shared root/document utilities |
| Client components | Tailwind utilities for form feedback and gallery dialogs |
| `public/assets/vendor/` | Necessary icon-font mappings and Swiper engine styles |

Tailwind Preflight is intentionally omitted because replacing the original normalization with a different reset would change the appearance. The original normalization and grid values were converted to utilities too. The original main stylesheet and Bootstrap layout stylesheet are no longer loaded.

Migrated tokens such as `tw:r005785:[font-family:logo-font]` combine a generated ordered variant with an exact-value utility. The variants preserve the original selector specificity, pseudo-elements, hover/checked/collapsed states, media conditions, and declaration order. Do not rename or reorder generated variants without repeating the comparison checks.

For new components, use ordinary prefixed utilities such as `tw:flex tw:items-center tw:p-[12px]`. To adjust an existing migrated element, edit its applicable utility rather than appending a lower-specificity conflicting class. `tw:legacy-inline:[padding:12px]` provides the precedence used to migrate original inline styles when that precedence is intentional.

Some repeating fractional grid percentages use arithmetic with small custom-property operands. This prevents CSS optimizers from rounding the original fractions and changing subpixel geometry.

`npm run styles:sync` parses the JSON and writes [content/tailwind-candidates.txt](content/tailwind-candidates.txt). Tailwind scans that raw token file plus application/components source, rather than escaped JSON text. Add complete utility names, and synchronize after class edits during a running development session. Do not edit the candidate file manually.

Files under `public` are served from the site root:

```text
File: public/assets/img/example.webp
URL:  /assets/img/example.webp
```

Use root-relative asset URLs, provide appropriate image alternative text, and avoid hardcoding a local hostname or port in page content. Preserve existing vendor license notices. The main local brand font is `public/assets/fonts/Belleza-Regular.ttf`.

## Interactive components

[components/site-interactions.tsx](components/site-interactions.tsx) handles:

- Mobile navigation and product dropdowns.
- Gallery category filtering and image/video dialogs.
- Gallery keyboard navigation, focus handling, and Escape-to-close behavior.
- Inquiry popups and scroll-to-top controls.
- Swiper initialization, with reduced-motion preferences considered.

The component loads local Bootstrap and Swiper scripts through `next/script`. Native checkbox-and-label FAQ sections retain their HTML/CSS behavior.

The testimonial carousels on Co-Working, Workation and Meeting Rooms use the reference's 600ms slide transition and 5000ms autoplay interval. They display one card below 1200px and two cards at 1200px and above, with 20px between cards. Pagination bullets are generated at runtime; their exact 12px size, gray background and dark active state are supplied through Tailwind in `renderBullet`, since runtime-created nodes are absent from the captured page JSON. Swiper observes parent layout changes and refreshes after fonts load.

[components/page-animations.tsx](components/page-animations.tsx) runs on every migrated page and restores all 431 captured entrance markers across 46 pages: `fade-up` (100px upward motion), `fade` (opacity only), and `zoom-in` (scale from 0.6). Entrances last 800ms, trigger once at the original 120px scroll offset, and retain the reference's supported 100ms delays. The reference stylesheet has no rule for its 10ms delay markers, so those retain its effective zero delay. Pages without captured entrance animations remain static. Appearance is controlled by Tailwind utilities. The two homepage `.purecounter` statistics count from 0 to 11 and 32 over one second when they enter view. Their start, end and duration come from `data-purecounter-*` attributes in [content/pages/index.json](content/pages/index.json). The component cleans up observers, listeners and animation frames on unmount. Reduced-motion users and visitors without JavaScript see the completed content immediately.

The server renderer adds the initial `data-reveal-state="pending"` and shared Tailwind classes from [components/animation-styles.ts](components/animation-styles.ts) before the first paint. The browser then transitions those elements into view; it does not first render visible content and hide it after hydration. Initial hiding applies only when scripting is enabled and reduced motion is not requested, preserving readable content without JavaScript.

With the ignored `.reference/` capture available, run `python scripts/restore-reference-animations.py` to verify every page's animation markers against the original HTML. Add `--write` only when intentionally restoring those attributes; this script leaves the Tailwind classes, content and structure intact. The normal route verification also checks that each page's animation markers and pending first-paint states reach the server-rendered HTML.

Many interactions identify elements through classes and IDs such as `.glightbox`, `.portfolio-item`, `.swiper`, and `#popup-modal`. Changing those selectors in content can break their behavior; update the interaction component alongside the markup.

Internal page destinations render through [components/site-link.tsx](components/site-link.tsx), which uses Next.js `<Link prefetch={true}>`. Production builds prefetch visible links, including their cached URL-dependent content, and navigate without reloading the HTML document. External links, gallery controls, downloads and hash-only controls keep their native behavior. Ordinary page links start at the top; hash destinations use Next.js anchor scrolling.

[components/navigation-boundary.tsx](components/navigation-boundary.tsx) keys a React Fragment by pathname around the route content. This preserves Next.js route-data caching while recreating the page DOM and its effects on page changes, including browser Back/Forward. No extra layout element, renamed IDs, scoped Bootstrap selectors or new page styling are introduced. The original document-scoped menus, tabs, FAQs, sliders, counters and entrance animations therefore operate on one current page rather than several hidden cached copies. Page-local state resets when changing pages; this deliberately retains the original full-document page behavior.

Prefetching is enabled in production, not development. For a representative speed check, stop the development server, run `npm run build`, then `npm start` (port 3011). The first request and uncached images can still require network time; existing entrance durations are preserved.

For a design regression check against a separately running unchanged build, run `python scripts/verify-navigation-parity.py BASELINE_URL OPTIMIZED_URL`. It compares every page's rendered body tree, text, attributes and Tailwind classes, ignoring framework scripts/resource hints and equivalent URL encoding. The normal route verifier checks all routes and their initial animation states.

## Forms and backend integration

The browser component is [components/inquiry-form.tsx](components/inquiry-form.tsx). It collects `FormData`, adds the current pathname as `source`, posts to `/api/inquiry`, disables fields while pending, and shows the server's response. Successful submissions reset the form.

The server endpoint is [app/api/inquiry/route.ts](app/api/inquiry/route.ts).

```text
Form -> POST /api/inquiry -> validation -> configured webhook -> user feedback
```

### Request and delivery contract

- Content type: `multipart/form-data`, with the browser generating the boundary.
- Common required fields: `name`, `email`, and `mobile`.
- The mobile validator currently requires 10 digits, starting with 1–9.
- Other original named fields, hidden page/job identifiers, and resume attachments are forwarded with the form data.
- `source` identifies the submitting page.
- The webhook request optionally includes `Authorization: Bearer <INQUIRY_WEBHOOK_TOKEN>`.
- The webhook has a 15-second timeout. Any successful HTTP status is treated as accepted delivery; its response body is not used.

The endpoint rejects requests with a mismatched `Origin` header when one is supplied. It checks declared request length above 6,000,000 bytes, individual string lengths, and nonempty file uploads. Attachment validation currently permits `.pdf`, `.doc`, or `.docx` filenames and a maximum file size of 5,000,000 bytes. These checks do not inspect document contents or scan for malware.

### Response statuses

Responses contain a JSON `message` field.

| HTTP status | Meaning |
| --- | --- |
| `200` | The configured webhook accepted the submission |
| `400` | Invalid form data, fields, or attachment |
| `403` | Supplied origin does not match the request origin |
| `413` | Declared request size exceeds the endpoint's limit |
| `502` | Delivery failed or timed out |
| `503` | No delivery webhook is configured |

Without a webhook, the UI offers `response@biznest.co.in`; it does not silently discard a submission or send it to the original PHP endpoints. The application does not persist submissions or uploaded resumes locally.

For public form delivery, configure a receiver that handles storage/email and apply hosting-level request limits, rate limiting, and spam protection. The application's content-length check is not a replacement for an enforced body-size limit at the hosting boundary. Verify origin handling with the deployed reverse proxy and test delivery using a controlled receiver before launch.

## Environment variables

Use [.env.example](.env.example) as the template.

| Variable | Purpose | Behavior when unset |
| --- | --- | --- |
| `SITE_URL` | Production origin used by sitemap and robots generation; omit a trailing slash | Falls back to `https://biznest.co.in` |
| `INQUIRY_WEBHOOK_URL` | Server-side delivery endpoint; configure an HTTPS receiver | Submissions return `503` and offer email fallback |
| `INQUIRY_WEBHOOK_TOKEN` | Optional server-side bearer token for the receiver | No authorization header is added |

Set `SITE_URL` before building. Restart after changing server environment settings; rebuild when changing settings used by generated output.

Webhook settings are read only by server code. Do not prefix these secrets with `NEXT_PUBLIC_`, expose them in page JSON, or commit real values. Port 3011 is set by the npm scripts, separately from these settings.

## Caching and builds

[next.config.ts](next.config.ts) enables Cache Components and Partial Prefetching. `ReferencePage` uses `'use cache'` with `cacheLife('max')`; the requested page name distinguishes cached page results.

The production build prepares known pages from the manifest. In production, rebuild and restart after changing committed content, renderer code, or styles. During development, filesystem-read JSON changes may require a server restart to appear because the renderer reads and caches those files.

Development output goes to `.next`, while production output goes to `.next-production`. This separates build artifacts, but does not allow both servers to listen on the same port.

The project also sets `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options` response headers in `next.config.ts`.

## Verification

Run source linting and the production build:

```sh
npm run lint
npm run build
```

With development stopped, start the production server:

```sh
npm start
```

In a second terminal, from the repository root:

```sh
node scripts/verify-site.mjs
```

The audit checks:

- The homepage, every manifest URL, robots, and sitemap return HTTP 200.
- An unknown legacy HTML URL returns HTTP 404.
- Referenced local `href`, `src`, and `poster` assets exist.
- Internal HTML links are registered in the manifest.
- Content trees contain no script nodes or inline event-handler attributes.
- An invalid form submission returns 400, and a mismatched origin returns 403.

At the initial migration size, it reports **52 route checks** and **151 distinct local assets referenced through those attributes**. The full asset capture contains 214 files, including CSS dependencies and supporting files; those counts measure different things.

The audit does not verify every CSS URL, external service, browser layout, successful webhook delivery, attachment-handling outcome, or complete accessibility behavior. It is a smoke audit, not a unit or end-to-end test suite. Use a production server for the route audit, particularly when checking filenames containing encoded characters.

The Tailwind migration has an additional audit:

```sh
# Standard-library checks of every page's migration
python scripts/verify-tailwind.py

# Also verify every generated utility exists in the compiled CSS
# This optional compiled-CSS check requires tinycss2.
python scripts/verify-tailwind.py .next-production
```

It checks all 49 pages for utility classes, removed page CSS, and removed authored inline styles. If the ignored pre-migration snapshot is available, it also verifies that text, structure, attributes and behavior hooks were preserved. The compiled-CSS check catches candidates that Tailwind could not generate, including malformed SVG data URLs.

Responsive comparisons during migration used 390×844, 768×1024 and 1440×900 viewports on 14 representative page types. Computed layout, typography, colors, borders and pseudo-element properties were compared with the pre-migration build. Lazy-image loading, running slider positions and transition timing must be settled or treated separately when repeating visual comparisons. These checks do not prove every browser and interaction state is pixel-identical.

For visible changes, manually inspect desktop and mobile layouts, navigation, galleries, sliders, FAQs, focus behavior, form pending states, and failure feedback. Test successful form delivery separately after configuring a receiver.

## Deployment

Use hosting that supports this Next.js version's Node.js runtime, server filesystem reads, route handlers, proxy behavior, and caching configuration. A static-file-only host cannot run the current form endpoint or full server application.

For a Node.js server deployment:

1. Install locked dependencies with `npm ci`.
2. Configure environment variables, including `SITE_URL` before the build.
3. Build with `npm run build`.
4. Run `npm start` from the project root under the hosting platform's process manager.
5. Route the public HTTPS domain to the application listener on port 3011.
6. Verify page URLs, assets, 404s, sitemap URLs, and form behavior on that deployment.

For a manual server installation, retain `.next-production`, `public`, `content`, the required Node dependencies, and project configuration. The renderer resolves `content/pages` from the process working directory, so do not run it from an unrelated folder or omit content files. Framework-managed deployment packaging should be checked to ensure those filesystem-read files are included.

The project does not currently configure static export or standalone output. If a host requires a platform-assigned port, adapt the startup command to that platform rather than assuming the locally fixed port will be accepted. `NEXT_DIST_DIR` optionally selects an isolated build directory for comparison work; omit it for the normal `.next`/`.next-production` directories.

No automatic deployment or GitHub Actions workflow is included.

## Source migration tools

These tools are optional and are not required to run or deploy the checked-in website.

```sh
python -m pip install beautifulsoup4 html5lib
python scripts/mirror-reference.py
python scripts/convert-reference.py
```

The mirror script downloads linked public pages and assets, writes raw HTML plus an inventory under ignored `.reference/`, and stores local assets under `public/assets/`. Inspect the inventory's failures before conversion.

The converter uses that inventory to generate `content/pages/*.json` and `content/manifest.json`. It removes source scripts and inline event handlers, localizes URLs, repairs certain invalid controls, and adds accessibility attributes and main landmarks where applicable.

**These are legacy capture tools. Raw conversion overwrites page JSON with pre-Tailwind content and must not be run as a normal content-editing step.** Preserve manual edits and the local pre-Tailwind snapshot before using them. `migrate-to-tailwind.py` operates from `.reference/tailwind-before/`, the ignored snapshot retained during this migration; it is a one-time migration utility, not part of the build or a fresh-clone setup requirement. Re-running it overwrites page trees from that snapshot. Normal development edits the committed Tailwind page trees directly.

The CSS migration utility requires `tinycss2` and `cssselect2` in addition to the optional capture dependencies. Always review the diff and repeat both content and visual verification after regenerating source. A new capture can reflect later changes on the original public website.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `EADDRINUSE` on port 3011 | Another server already owns the port. Stop the identified development or production process before restarting. |
| “Another next dev server is already running” | A development process is still using this checkout. Stop that process rather than launching a second one. |
| `npm start` cannot find a production build | Run `npm run build` successfully first. Production output is `.next-production`. |
| JSON edits are not visible | Validate the JSON, restart development if necessary, and rebuild/restart production. |
| An inner page returns 404 | Check its exact manifest key, content filename, case, and URL encoding. |
| Asset returns 404 | Confirm it exists under `public`; its URL must omit the `public` prefix. |
| A gallery or popup stops working | Check the selectors used by `site-interactions.tsx` against the page markup. |
| Forms return 503 | Configure `INQUIRY_WEBHOOK_URL`, or retain the documented email fallback. |
| Forms return 502 | Check receiver availability, authorization settings, and the 15-second timeout. |
| Forms return 403 after deployment | Check the browser origin and how the reverse proxy forwards the request origin/protocol. |
| Sitemap points to the wrong host | Set `SITE_URL` and rebuild. |
| Development route audit shows transient errors or encoded-page failures | Stop development and check a production build; capture reproducible development failures separately. |

## Contributing and maintenance

- Keep content, styles, and browser behavior changes focused and reviewable.
- Preserve existing legacy URLs unless redirects are deliberately introduced.
- Update every affected page tree when changing duplicated navigation/footer content.
- Keep secrets out of Git and browser-delivered code.
- Retain vendor attribution and license notices in copied assets.
- Run relevant checks and document what was verified in the pull request.
- Update this README and `.env.example` when commands, architecture, or configuration change.

This repository includes Next.js-version-specific instructions in [AGENTS.md](AGENTS.md). Coding agents must follow them and read the relevant bundled documentation under `node_modules/next/dist/docs/` before changing framework code. Those documents become available after dependency installation.

## Current limitations

- The content structure is a migration snapshot. Most inner pages are JSON trees, and header/footer markup is duplicated across them.
- Form delivery needs an external receiver; no database, CMS, or authentication backend is implemented here.
- Login, social profiles, embedded maps, and video destinations depend on external services. The separately hosted login application was not replicated.
- The original live site rendered blank in the available browser during initial implementation. Representative local pages and interactions were checked, but exact screenshot-to-screenshot parity and exhaustive mobile/accessibility verification have not been established.
- Installed vendor assets do not imply every original vendor script is executed. The migration replaces source tracking and page scripts with the application's own rendering and interaction code.
