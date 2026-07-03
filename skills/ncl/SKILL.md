---
name: ncl
description: "Use the read-only NCL CLI to pull a booked sailing's itinerary and shore-excursion catalog (prices, duration, start time, activity level, availability, booked status) and render a per-port planning digest. Never books, holds, or pays. Prefer summarized JSON; never print the session cookie."
---

# NCL Excursion CLI Skill

Use for questions about a booked NCL cruise's ports and shore excursions.

## Command

```bash
node dist/cli.js --help    # from the ncl-cli checkout
```

## First checks

```bash
node dist/cli.js auth status --json
node dist/cli.js doctor --json
```

If auth is missing or invalid, ask the user to open ncl.com in Chrome launched
with `--remote-debugging-port=9333`, log in, then run:

```bash
node dist/cli.js auth import-cdp --port 9333
```

## Reading

```bash
node dist/cli.js cruise list                    # booked sailings (summarized)
node dist/cli.js cruise get                      # ship, dates, itinerary
node dist/cli.js excursions list                 # all excursions, summarized
node dist/cli.js excursions list --port port-005 # one port of call
node dist/cli.js excursions get exc-004          # full detail (needToKnow, description)
node dist/cli.js excursions report --format markdown --out excursions.md
node dist/cli.js excursions report --format json # machine-readable digest
```

## Safety rules

- Read-only. Never run, suggest, or add a booking/cart-write/checkout/payment
  command. The tool only ever issues GETs plus one allowlisted account-read POST.
- Never print, paste, or commit the session cookie or a real reservation/voyage id.
- Prefer summarized rows (local `exc-###` / `port-###` refs). Use `--raw` on
  `excursions list` only for short-lived local debugging.
- The `api get <path> --unsafe-raw` escape hatch is GET-only and host-locked to
  `*.ncl.com`.
