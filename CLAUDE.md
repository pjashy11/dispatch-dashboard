# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev      # Start dev server (Next.js 16 + Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Project Overview

Dispatch Dashboard — internal tool for dispatchers to view load status and create new loads via the Welltrax API. Split-screen layout: load list on the left, load detail/creation form on the right. Filtered by terminal and pickup date.

**Tech stack:** Next.js 16.2.1, React 19, TypeScript 5, TailwindCSS 4

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Main page — split layout, state management
│   ├── api/loads/route.ts          # GET loads from Ticket API (ASSIGNED/ONGOING)
│   ├── api/loads/create/route.ts   # POST create load via WAPI_TMS11
│   └── api/setupinfo/route.ts     # POST entity lookup (terminals, scenarios, search)
├── components/
│   ├── FilterBar.tsx               # Terminal, date, historical toggle
│   ├── LoadList.tsx                # Left panel — sortable load table
│   ├── LoadForm.tsx                # Right panel — create form / detail view
│   └── EntitySearch.tsx            # Reusable debounced entity search dropdown
└── lib/
    ├── welltrax.ts                 # Welltrax API client (both auth systems)
    └── types.ts                    # Load, LoadFormData, Entity, Terminal, Scenario
```

**Data flow:**
- Load list: `page.tsx` → `GET /api/loads` → `fetchTickets()` (Ticket API) → mapped to `Load[]`
- Load creation: `LoadForm` → `POST /api/loads/create` → `createLoad()` (WAPI_TMS11)
- Entity search: `EntitySearch` → `POST /api/setupinfo` → `fetchSetupInfo()` (WAPI_TMS11)
- Terminals/scenarios are fetched on mount and cached server-side for 30 min

**Key patterns from Ticket Dashboard (sibling project):**
- Entity search for PICK_UP: results are nested — `retList[0]` is the ACCOUNT, pickup is at `retList[0].pickUpList[0]`
- Same for DROP_OFF: nested under account's `dropOffList[]`
- Both API token caches use in-memory caching with 60s buffer before expiry

## Welltrax API Reference

Welltrax (WolfePak Cloud) exposes **two separate APIs** with different auth. Both share the same base URL but have independent credentials and token systems.

**Base URL:** `https://welltrax-api.wolfepakcloud.com` (exported as `WOLFEPAK_BASE_URL` from `src/lib/welltrax.ts`)

### API 1: Ticket API (Read-Only)

OAuth2 client_credentials flow.

```
POST /ticketAPI/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={WOLFEPAK_CLIENT_ID}&client_secret={WOLFEPAK_CLIENT_SECRET}
```

Response: `{ "access_token": "...", "token_type": "BEARER", "expires_in": 604800000 }` (7 days, milliseconds, snake_case field)

#### Fetch Tickets

```
POST /ticketAPI/v1/tickets/{company}
Authorization: Bearer {access_token}
Content-Type: application/json
```

```json
{
  "dateRangeStart": { "date": "MM/DD/YYYY", "time": "HH:MM" },
  "dateRangeEnd": { "date": "MM/DD/YYYY", "time": "HH:MM" },
  "dateType": "DROP_OFF_COMPLETED",
  "statusList": ["COMPLETE"],
  "offset": 1,
  "limit": 500
}
```

- `dateType` values: `LOAD_CREATION`, `REQUESTED_PICKUP`, `DISPATCHER_ASSIGNED`, `DRIVER_ACCEPTED`, `PICK_UP_ARRIVAL`, `PICK_UP_SEAL_OFF`, `PICK_UP_SEAL_ON`, `PICK_UP_PICKUP`, `DROP_OFF_ARRIVAL`, `DROP_OFF_COMPLETED`, `LAST_AUDITED`, `LAST_LOAD_OR_TICKET_MODIFIED`
- `statusList` values: `ASSIGNED`, `ONGOING`, `COMPLETE`, `REJECT`
- `offset` — 1-based page number (max 500); `limit` — page size (max 15,000)
- **Max date range: 15 days** — split into chunks for longer ranges
- Optional filters: `bolList`, `ticketNumberList`, `confirmationNumberList`, `accountNameList`, `operatorNameList`, `commodityName`, `audited` ("Yes"/"No"/"ALL")
- Returns JSON array of ticket objects. Returns `"no results"` text when empty.
- Error codes: 400 (bad date range), 403 (wrong credentials), 503 (company unavailable)

### API 2: WAPI_TMS11 (Read/Write)

Username/password/company sign-in (completely separate from Ticket API).

```
POST /WAPI_TMS11/api/auth/signin
Content-Type: application/json

{ "userName": "...", "password": "...", "companyName": "..." }
```

Response: `{ "accessToken": "...", "tokenType": "Bearer" }` (camelCase — different from Ticket API)

#### Key WAPI Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /WAPI_TMS11/api/v1/client/setupinfo` | Entity lookup (pickup locations, accounts, etc.) |
| `POST /WAPI_TMS11/api/inbound/loads` | Create new loads |
| `POST /WAPI_TMS11/api/v2/client/{entity}` | CRUD for operators, pickups, accounts, terminals, etc. |

#### Setupinfo (Entity Lookup)

```json
[{
  "target": "PICK_UP",
  "isExists": "false",
  "searchCriteria": {
    "pickUpName": "SUMMIT ARIA",
    "offset": "0", "limit": "20", "sortBy": "name", "sortOrder": "ASC"
  }
}]
```

**Response nesting (critical):** `retList[0]` is the **ACCOUNT**, not the pickup. Pickup is at `retList[0].pickUpList[0]`. Confusing these gives wrong entity IDs.

Other `target` values: `"DRIVER"`, `"TRUCK_TRAILER"`, `"ACCOUNT"`, `"DROP_OFF"`.

### Key Ticket Fields

- `item.load` — BOL, status, `confirmationNos`, `pickUpList[]`, `dropOffList[]`
- `item.dynamicLoad.pickUpList[0]` (puDynamic) — `ticketNumber`, `arrivalDateTime`, `departureDateTime`, `dynamicValues[]`, `runTicketPdfUrl`, `driver.contact.fullName`
- `item.dynamicLoad.dropOffList[0]` (doDynamic) — dropoff meter readings, departure info
- `item.driverAssigned.contact` — driver name

### Dynamic Values

Welltrax splits fields across two locations on `puDynamic`:

**`dynamicValues[]`** — Array of `{ fieldName, stringValue }` or `{ fieldName, optionName }`:
- Gauging: `"Observed Gravity"`, `"Corrected Gravity"`, `"BS&W(%)"`, `"Net Barrels"`, `"GSV"`
- Gauge Type: `"Gauge Type"` uses `optionName`: `"HAND"`, `"TRAILER"`, `"LACT"`
- Temps: `"Top"`, `"Bottom"`, `"Observed"` (not "Top Temp" or "Observed Temp")
- Seals: `"Seal Off #"`, `"Seal On #"`, `"Seal Off Time"`, `"Seal On Time"`
- Meters: `"Start Meter"`, `"End Meter"` (pickup); `"Start Meter Reading"`, `"End Meter Reading"` (dropoff)
- HAND gauges: `"TOP GAUGE"`, `"BOTTOM GAUGE"`, `"BOTTOM HEIGHT"` — values in **pure total inches**
- TRAILER: `"Gross Barrels"`
- LACT: `"Start Meter"`, `"End Meter"`

**Direct properties on `puDynamic`** (NOT in dynamicValues):
- `otherNotes`, `waitTimeNotes`, `waitTimeMinutes`, `reRoutedNotes`, `reRoutedMiles`
- `rejectReasonNotes`, `rejectReason` (object), `reviewedNotes`
- `ticketNumber`, `arrivalDateTime`, `departureDateTime`
- `driver.contact.fullName`, `truck.number`, `trailer.number`
- `tank.tankNumber`, `tank.capacity`, `runTicketPdfUrl`

### Pagination & Date Formats

- Max date range: 15 days per request
- Page size: 1–15,000 (use 500)
- Page offset: 1-based (max 500)
- Date format: `MM/DD/YYYY`, time: `HH:MM` (24-hour)
- Token expiry: 7 days for both APIs

## Deployment

Runs on a Mac Mini via Cloudflare Tunnel. Subdomain: `portal.exploretickets.org` (alongside the employee Ticket Dashboard at `dashboard.exploretickets.org`).
