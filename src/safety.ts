import { codeError } from "./output.js";

// Host lock: the session cookie is only ever sent to https *.ncl.com hosts.
export function assertNclHost(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw codeError("HOST_BLOCKED", "HOST_BLOCKED: Invalid URL for NCL request.");
  }
  const okHost = url.hostname === "www.ncl.com" || url.hostname.endsWith(".ncl.com");
  if (url.protocol !== "https:" || !okHost) {
    throw codeError("HOST_BLOCKED", "HOST_BLOCKED: Refusing to send the NCL session cookie to a non-NCL host.");
  }
}

// Read-only enforcement matched to NCL's real surface.
//
// GET is always allowed — a GET never mutates NCL state (reading the itinerary,
// the excursion catalog, the cart, or favorites are all GETs, and NCL exposes
// the cart *read* at a `/cart` path, so a path-keyword denylist would wrongly
// block a legitimate read).
//
// Non-GET is refused by default. The ONLY exception is a tiny allowlist of
// known account *read* endpoints that NCL happens to serve over POST (listing
// your booked cruises). None of these book, hold, pay, or otherwise mutate.
// Nothing here can ever reach a cart-write, checkout, or payment endpoint.
const READ_POST_ALLOWLIST = [
  "/api/account-access/v1/upcoming-cruises",
  "/api/account-access/v1/client-info",
  "/api/account-access/v1/client-loyalty-programs",
];

function pathOnly(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl, "https://www.ncl.com").pathname;
  } catch {
    return pathOrUrl.split("?")[0];
  }
}

export function assertReadOnlyRequest(method: string, pathOrUrl: string): void {
  const m = method.toUpperCase();
  if (m === "GET") return;
  if (m === "POST" && READ_POST_ALLOWLIST.includes(pathOnly(pathOrUrl))) return;
  throw codeError(
    "METHOD_BLOCKED",
    `METHOD_BLOCKED: ncl-cli is read-only; ${m} ${pathOnly(pathOrUrl)} is not an allowed read request.`,
  );
}

export function isReadPostAllowed(pathOrUrl: string): boolean {
  return READ_POST_ALLOWLIST.includes(pathOnly(pathOrUrl));
}

export function localRef(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

export function safeRowMeta(prefix: string, index: number, row: { id?: unknown } | null | undefined): Record<string, unknown> {
  return { ref: localRef(prefix, index), hasId: Boolean(row?.id) };
}
