# Submissions API for external tables and edit forms

**Endpoint:** `GET http://localhost:3011/api/submissions`

Form submissions are stored in the `partner`, `product`, and `career` collections. Answers and `sourceCompany` are top-level fields. The list API is protected, paginated and uncached.

## Authentication and sharing

Send `Authorization: Bearer <SUBMISSIONS_API_KEY>`. A private random key has been prepared in this project's ignored `.env`. Copy its value into the external project's **server-side** secret configuration. Never commit it, put it in a URL, or expose it in a `NEXT_PUBLIC_` variable or frontend bundle.

The recommended integration is: authenticated table UI → your external project's protected backend → this API. That backend must enforce its own user permissions before returning records. The key grants access to all submitted fields, including career details. It is a shared read credential, not per-user authentication.

Restart the BIZ Nest server after configuring or rotating the key. An empty key disables reads (`503`); missing/incorrect credentials return `401`.

`localhost` works only when the caller runs on the same computer. For another server, use the reachable deployed/LAN host and actual port; use HTTPS for deployed integrations. Do not expose MongoDB port 27017 to table clients.

Server-side fetch example (place both settings in the external project's private env):

```js
const query = new URLSearchParams({
  page: '1', pageSize: '25', sortBy: 'createdAt', sortOrder: 'desc',
});
const response = await fetch(
  `${process.env.BIZNEST_API_BASE_URL}/api/submissions?${query}`,
  {
    headers: { Authorization: `Bearer ${process.env.BIZNEST_API_KEY}` },
    cache: 'no-store',
  },
);
if (!response.ok) throw new Error(`Submissions API returned ${response.status}`);
const result = await response.json();
const rows = result.data;
const totalRows = result.pagination.filteredTotal;
```

## Edit a submission

Read the selected row from `GET /api/submissions` and keep its `id` and `kind`. The `id` is the 24-character MongoDB ObjectId returned as a string. Use the collection that corresponds to the row’s `kind`.

| Row `kind` | Collection | Endpoint |
| --- | --- | --- |
| `partnership` | `partner` | `PATCH /api/submissions/partner/{id}` |
| `product` | `product` | `PATCH /api/submissions/product/{id}` |
| `application` | `career` | `PATCH /api/submissions/career/{id}` |

Call PATCH from the external project’s authenticated backend. Configure `SUBMISSIONS_WRITE_API_KEY` on BIZ Nest and put the same value in the external backend’s secret configuration. The read key continues to authorize GET only. Keep both keys server-side. An empty write key disables PATCH.

```http
PATCH /api/submissions/product/507f1f77bcf86cd799439011
Authorization: Bearer <SUBMISSIONS_WRITE_API_KEY>
Content-Type: application/json

{"sdate":"2027-01-15","status":"contacted"}
```

Send a flat JSON object with just the changed fields. Values are strings, including date fields (`YYYY-MM-DD`) and numeric answers. An empty string clears an optional field. Edits apply only to editable fields present on the original form.

- Partner offers `name`, `email`, `mobile`, and `message`.
- Product offers `name`, `email`, `mobile`, `count`, `sdate`, and `category`, depending on the form. Changing the Virtual Office Goa selection also refreshes its subtype.
- Career offers applicant contact details and the visible application answers, such as `dob`, `experience`, `linkedin`, and `skills`.
- All three accept a `status` of up to 64 characters using letters, numbers, spaces, underscores, or hyphens, starting with a letter or number.

IDs, source and kind, hidden form labels such as `pagename` and `job_position`, classification fields, timestamps and attachments are managed by BIZ Nest. PATCH returns `200` with `{ "data": { … } }` in the same row shape as GET. Invalid edits return `400`, missing or wrong credentials return `401`, and a valid ID in the wrong collection returns `404`.

## Query parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `page` | `1` | One-based page number |
| `pageSize` | `25` | 1–100 rows per request |
| `kind` | All | `product`, `application`, `partnership`, or a [form filter](#form-filters) |
| `source` | All | Exact original pathname, e.g. `/Co-Working_Space.html` |
| `status` | All | Exact submission status, e.g. `new` |
| `search` | Empty | Literal case-insensitive search across name, email, mobile, product/form, company type, category, job position, location and message |
| `from`, `to` | Unbounded | Inclusive submission dates in `YYYY-MM-DD`, interpreted in UTC |
| `sortBy` | `createdAt` | A sortable field from returned `columns` |
| `sortOrder` | `desc` | `asc` or `desc`; ID is the stable tie-breaker |
| `format` | `table` | `table` or `datatables` |

Examples:

```text
/api/submissions?page=1&pageSize=25
/api/submissions?kind=application&sortBy=createdAt&sortOrder=desc
/api/submissions?kind=private-workspace
/api/submissions?kind=partnership&search=example
/api/submissions?from=2026-11-01&to=2026-11-30
```

To fetch the complete dataset, iterate pages until `pagination.hasNextPage` is false, keeping the same filters and sort. There is deliberately no unbounded “all records” request. Pagination is offset-based (maximum offset 1,000,000), not a transaction snapshot: new submissions during a long export can shift pages. For a stable historical window, set a fixed `to` date. Large exports should use a dedicated snapshot/export workflow.

## Table response

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "filteredTotal": 0,
    "totalPages": 0,
    "hasNextPage": false
  },
  "columns": [
    { "field": "id", "headerName": "ID", "sortable": true },
    { "field": "kind", "headerName": "Type", "sortable": true }
  ]
}
```

The column list above is abbreviated. `total` counts all submissions; `filteredTotal` counts matching submissions. Every row uses the same keys, with `null` for answers absent from that form:

- Metadata: `id` (MongoDB ID as a string), `kind`, `source`, `status`, `createdAt`, `updatedAt` (ISO timestamps).
- Common/product fields: `name`, `email`, `mobile`, `count`, `sdate`, `pagename`, `category`, `companyType`, `companySubtype`.
- Application/partner fields: `dob`, `location`, `experience`, `linkedin`, `currentmonthlysalary`, `expectedsalary`, `canjoin`, `relocategoa`, `personality`, `skills`, `specialexperience`, `willing`, `message`, `job_position`.
- Additional metadata: `notificationStatus`, `hasResume`, `resumeLink`, and `sourceCompany` (always `"BIZ Nest"`). The link identifies a private S3 object and requires authorized AWS access. For legacy resumes, it is null until migrated.

Submitted answers are top-level fields in the `partner`, `product`, and `career` collections. The server derives `companyType` from the product page’s subscription group: Co-Working, Workation, Meetings, or Alternate Channels. The field is null for partner and career rows. Original answer types are preserved, so salary/experience remain strings as submitted; `count` may contain values such as `10+`. Resume binary contents, fingerprint, retry key and arbitrary extra document properties are excluded with an inclusion projection.

`companySubtype` is assigned by the server from the submitted form. Subscription cards use the selected offering’s name. For example, Company Campus opens `/Exclusive_Campus.html` and saves under Workation with the Company Campus subtype. Co-Working Goa, Meeting Rooms Goa, and Workation Goa use Co-Working Space, Meeting Room, and Regular Workations respectively. Virtual Office Goa uses the existing virtual office selection. The field is searchable and sortable and appears as `null` when no subtype is stored. Start Date is required on the Goa landing forms and is saved as `sdate` in `YYYY-MM-DD` format.

Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the server's `.env` for resume uploads. Use `AWS_SESSION_TOKEN` with temporary credentials. The storage prefix is `wono/BizNest/New BIZ Nest Website/Resumes/` in `wonov-aws-s3-storage`. Run `npm run db:migrate-resumes` to count legacy resumes and `node scripts/database.mjs migrate-resumes --apply` to upload them. The migration replaces each MongoDB file payload with its S3 link after S3 accepts the upload. The `npm run db:resume` command can export both legacy and S3 resumes.

Render user-submitted values as text, not raw HTML. DataTables supports `DataTable.render.text()`; use default text cells rather than unsafe HTML renderers in other grids.

## AG Grid and other grids

Use `result.data` as rows, `result.columns` as column definitions (`field`, `headerName`, `sortable`), and `result.pagination.filteredTotal` as the filtered row count. Map your grid's paging/search/sort controls to the query parameters above. The endpoint does not accept AG Grid's raw `filterModel` or `sortModel` objects; translate supported filters in your external backend.

## DataTables server-side mode

Use `format=datatables`. Supported parameters are `draw`, `start`, `length` (1–100), `search[value]`, and the first `order[0][column]` / `order[0][dir]` with corresponding `columns[n][data]`. The regular `kind`, `status`, `source`, `from` and `to` filters also apply.

The response matches the [DataTables server-side contract](https://datatables.net/manual/core/server-side):

```json
{ "draw": 1, "recordsTotal": 50, "recordsFiltered": 12, "data": [] }
```

Configure your protected external-backend URL as `ajax`, forwarding its query parameters to this API and adding the bearer header server-side. Map column definitions to `{ data: column.field, title: column.headerName, orderable: column.sortable, render: DataTable.render.text() }`.

Only single-column ordering and the documented global search are implemented. Per-column search and multi-sort are not applied. Regex searching and `length=-1` are rejected; omit the “All” page-size option and disable multi-ordering in the table configuration.

## CORS and response statuses

Server-to-server requests need no CORS setting. Browser requests from other origins require an explicit comma-separated `SUBMISSIONS_ALLOWED_ORIGINS` allowlist, e.g. `http://localhost:4200,https://admin.example.com` (no trailing slashes). No wildcard origin or credential cookie sharing is enabled. CORS does not replace authentication. Prefer the backend integration so the shared API key remains private.

| Status | Meaning |
| --- | --- |
| `200` | Success, including empty result sets |
| `204` | Allowed OPTIONS preflight |
| `400` | Invalid query, date, sort, page size, or draw value |
| `401` | Missing/incorrect bearer key |
| `403` | Browser origin not allowed |
| `503` | Key not configured, database unavailable, or query timeout |

Errors return `{ "message": "..." }`. All responses use `Cache-Control: private, no-store`. Database reads have a five-second query time limit. Search uses escaped literal text, not caller-provided regular expressions or database operators.

## Form filters

Append one query below to `GET /api/submissions`. Returned rows keep their original submission type in `data[].kind`.

### Book Your Subscription

| Form | Query |
| --- | --- |
| All Book Your Subscription listings | `?kind=book-your-subscription` |
| Work from Café | `?kind=work-from-cafe` |
| Car Renting | `?kind=car-renting` |
| Co-Living Space | `?kind=co-living-space` |
| Co-Working Space | `?kind=co-working-space` |
| Exclusive Campus | `?kind=exclusive-campus` |
| Exclusive Workations | `?kind=exclusive-workations` |
| Managed Workspace | `?kind=managed-workspace` |
| Meeting & Board Rooms | `?kind=meetings-and-conferences` |
| Private Apartments / Villas | `?kind=private-apartments-villas` |
| Private Workspace | `?kind=private-workspace` |
| Training & Events | `?kind=training-and-events` |
| Virtual Office listing | `?kind=virtual-office` |
| Yacht Renting | `?kind=yacht-renting` |

### Product landing page forms

| Form | Query |
| --- | --- |
| Co-Working Goa | `?kind=co-working-goa` |
| Meeting Rooms Goa | `?kind=meeting-rooms-goa` |
| Virtual Office Goa | `?kind=virtual-office-goa` |
| Workation Goa | `?kind=workation-goa` |

### Partnership and career forms

| Form | Query |
| --- | --- |
| Partner form | `?kind=partnership` |
| All job application forms | `?kind=application` |
| Open Job Application | `?kind=open-job-application` |
| Assistant Manager, Civil & Maintenance | `?kind=assistant-manager-civil-maintenance` |
| Executive Assistant to CEO | `?kind=executive-assistant-to-ceo` |
| Finance Intern | `?kind=finance-intern` |
| Full Stack React Developer | `?kind=full-stack-react-developer` |
| HR Generalist | `?kind=hr-generalist` |
| Interiors & Civil Engineer | `?kind=interiors-civil-engineer` |
| Junior Executive Receptionist | `?kind=junior-executive-receptionist` |
| Junior Network Engineer | `?kind=junior-network-engineer` |
| Junior UI/UX Developer | `?kind=junior-ui-ux-developer` |
| Legal Associate | `?kind=legal-associate` |
| Maintenance Executive | `?kind=maintenance-executive` |
| Marketing Analytics | `?kind=marketing-analytics` |
| PHP Developer | `?kind=php-developer` |
| Receptionist / Admin Associate | `?kind=receptionist-admin-associate` |
| Social Media Marketing | `?kind=social-media-marketing` |
| Senior Manager, Sales & Business Development | `?kind=senior-manager-sales-business-development` |
| Senior IT Manager | `?kind=senior-it-manager` |
| Web Developer Intern | `?kind=web-developer-intern` |
