# NCL private endpoints (recon notes)

**Transport: Approach A (direct HTTP) CONFIRMED.** Direct `fetch`/`curl` with the
session cookie and browser-like headers (User-Agent, Accept, Referer) returns
HTTP 200 JSON past Akamai. No in-browser/CDP fetch fallback is needed.

Unofficial notes from observing ncl.com while logged in. Paths and field shapes
only — no real payloads, ids, cookies, or personal data are recorded here. These
can drift whenever NCL changes their site.

## Auth

- Cookie-backed. `ncl auth import-cdp` copies the `www.ncl.com` cookies from a
  logged-in Chrome (via the DevTools protocol) and stores them as a single
  `Cookie` header value. ~70 cookies; all are sent together.

## Endpoints used

| Purpose | Method | Path | Notes |
| --- | --- | --- | --- |
| List booked cruises | POST | `/api/account-access/v1/upcoming-cruises` | Empty body. Read-only despite POST; on the read-POST allowlist. Returns `cruises[]`. |
| Excursion catalog | GET | `/shorex/api/v1/{voyageId}/{reservationId}/explore-plan` | ~1.6 MB. Contains itinerary + all products. |
| Cart (planned items) | GET | `/shorex/api/v1/{voyageId}/{reservationId}/cart` | Read of planned/booked shore items. |
| Favorites | GET | `/shorex/api/v1/favorites/{voyageId}` | (via `api get` escape hatch) |

## Field map (upstream → domain)

`upcoming-cruises` → `cruises[]`:
- `reservationId` → reservation id (URL segment)
- `guests[0].client.id` → voyage id (URL segment; the "clientId")
- `itineraryName`, `itineraryCode` (ship derived from its leading token),
  `vacationStartDate`, `vacationEndDate`

`explore-plan`:
- `filters.itinerary[]` → ports: `portCode`, `dateOfCruise` (MM/DD/YYYY),
  `dayOfCruise`, `name`; `portCode === "AtSea"` marks a sea day.
- `products.shorex[]` → excursions:
  - `id` → product code
  - `cmsData.title` → title
  - `daysOfCruise[0]` → the itinerary day (authoritative for which port;
    `cmsData.portName` is occasionally wrong and is NOT trusted)
  - `displayPrice` / `displayChildPrice` → adult/child price
  - `durationDisplay`, `earliestStartTimeDisplay`
  - `cmsData.activityLevel` (1–4 → Easy/Moderate/Demanding/Strenuous),
    `cmsData.needToKnow`, `cmsData.description`, `cmsData.excType`
  - `hasExpired === true` OR empty `shorexAvailablePurchaseOptions` → sold out /
    not purchasable
- `reservation.currencyCode` → currency

`cart` → booked detection: an excursion is "booked" when its product code appears
anywhere in the cart payload (`offlineItems.shorex[]` / cart items).
