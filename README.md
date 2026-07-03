# ncl-cli

A lightweight, **read-only** CLI that pulls your booked Norwegian Cruise Line
sailing's itinerary and shore-excursion catalog and hands it back as clean JSON
(or a per-port-day markdown planning digest). Built because ncl.com is painful to
browse when you just want to compare excursions across ports.

> **Unofficial.** Not affiliated with, endorsed by, or an official API client for
> Norwegian Cruise Line. It reads NCL's private web surfaces with your own logged-in
> session and can break when NCL changes their site. It is **read-only**: it never
> books, holds, adds to cart, or pays for anything.

## What it does

- Lists your booked cruises and full itinerary (ports, dates, sea days).
- Pulls every shore excursion for the sailing with price (adult/child), duration,
  start time, activity level, sold-out status, whether it's already in your cart,
  and image URLs (thumb / large / xlarge / gallery).
- Can download the excursion images to a folder for design/planning use.
- Renders a per-port-day markdown digest so you can plan at a glance.
- Agent-first: every command emits a uniform JSON envelope (`{ ok, data | error }`).

## Install

Requires Node.js 22+.

```bash
git clone https://github.com/reggiegentle/ncl-cli
cd ncl-cli
npm install
npm run build
node dist/cli.js --help
```

## Auth

The CLI reads your ncl.com session cookies from a logged-in Chrome via the DevTools
protocol. Nothing is typed or stored except the resulting cookie (saved `0600` at
`~/.config/ncl/config.json`).

```bash
# Launch Chrome with a debug port (a fresh/isolated profile works fine), then log
# into ncl.com in it:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9333

# Import the session:
node dist/cli.js auth import-cdp --port 9333
node dist/cli.js doctor
```

## Commands

```bash
ncl auth import-cdp --port 9333   # import session cookies from Chrome
ncl auth status                   # is a session saved? (never prints the cookie)
ncl auth clear                    # forget the session
ncl doctor                        # session health check

ncl cruise list                   # booked cruises (summarized)
ncl cruise get                    # ship, dates, itinerary

ncl excursions list               # all excursions (summarized, incl. image url)
ncl excursions list --port port-005
ncl excursions list --full        # full objects: detail + all image URLs
ncl excursions get exc-004        # full detail for one excursion
ncl excursions images --out ./imgs                 # download hero images (large)
ncl excursions images --out ./imgs --size thumb    # or thumb | large | xlarge
ncl excursions report --format markdown --out excursions.md
ncl excursions report --format json

ncl api get <path> --unsafe-raw   # read-only GET escape hatch for uncovered paths
```

With more than one booked cruise, pass `--sailing <ref>` (from `cruise list`);
it defaults to the first.

## Safety model

- **Read-only by construction.** The HTTP layer only ever issues `GET`, plus a
  tiny allowlist of known account-**read** endpoints that NCL happens to serve over
  `POST` (listing your cruises). It cannot reach a cart-write, checkout, or payment
  endpoint.
- **Host-locked.** The session cookie is only ever sent to `*.ncl.com` over https.
  There is no override.
- **Cookie hygiene.** The cookie is stored `0600`, never printed by any command,
  and never accepted as a CLI flag. `config.json` is git-ignored.
- Committed test fixtures are **synthetic** (a fake sample sailing) — no real
  booking data is in this repo.

## Development

```bash
npm test               # build + node --test
npm run typecheck
npm run secret-sweep   # guards against committing cookies / real ids / captures
```

## Publishing (later)

Not published to npm yet. When ready: bump the version, remove `"private": true`
from `package.json`, and `npm publish`.

## License

MIT — see [LICENSE](./LICENSE).
