import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNclHost, assertReadOnlyRequest, isReadPostAllowed, localRef, safeRowMeta } from "../dist/safety.js";

test("assertNclHost allows www.ncl.com and subdomains over https", () => {
  assert.doesNotThrow(() => assertNclHost("https://www.ncl.com/api/x"));
  assert.doesNotThrow(() => assertNclHost("https://book.ncl.com/api/x"));
});

test("assertNclHost rejects non-ncl, non-https, and lookalike hosts", () => {
  assert.throws(() => assertNclHost("https://evil.com/api"), /HOST_BLOCKED/);
  assert.throws(() => assertNclHost("http://www.ncl.com/api"), /HOST_BLOCKED/);
  assert.throws(() => assertNclHost("https://notncl.com.evil.com/x"), /HOST_BLOCKED/);
  assert.throws(() => assertNclHost("https://www.ncl.com.evil.com/x"), /HOST_BLOCKED/);
});

test("assertReadOnlyRequest allows all GETs (reads never mutate), incl. /cart", () => {
  assert.doesNotThrow(() => assertReadOnlyRequest("GET", "/shorex/api/v1/1/2/explore-plan"));
  assert.doesNotThrow(() => assertReadOnlyRequest("get", "/shorex/api/v1/1/2/cart"));
  assert.doesNotThrow(() => assertReadOnlyRequest("GET", "https://www.ncl.com/shorex/api/v1/favorites/1"));
});

test("assertReadOnlyRequest allows POST only to the read allowlist", () => {
  assert.doesNotThrow(() => assertReadOnlyRequest("POST", "/api/account-access/v1/upcoming-cruises"));
  assert.doesNotThrow(() => assertReadOnlyRequest("POST", "https://www.ncl.com/api/account-access/v1/upcoming-cruises?x=1"));
});

test("assertReadOnlyRequest blocks all mutating methods and non-allowlisted POSTs", () => {
  for (const m of ["PATCH", "PUT", "DELETE", "patch"]) {
    assert.throws(() => assertReadOnlyRequest(m, "/anything"), /METHOD_BLOCKED/);
  }
  // POST to a booking/cart/checkout endpoint is refused — not on the allowlist.
  for (const p of ["/shorex/api/v1/1/2/cart", "/api/checkout", "/api/bookings", "/api/payment"]) {
    assert.throws(() => assertReadOnlyRequest("POST", p), /METHOD_BLOCKED/);
  }
});

test("isReadPostAllowed reflects the allowlist", () => {
  assert.equal(isReadPostAllowed("/api/account-access/v1/upcoming-cruises"), true);
  assert.equal(isReadPostAllowed("/api/account-access/v1/cart-add"), false);
});

test("localRef zero-pads", () => {
  assert.equal(localRef("exc", 0), "exc-001");
  assert.equal(localRef("port", 11), "port-012");
});

test("safeRowMeta returns a local ref and hasId flag without leaking the id", () => {
  assert.deepEqual(safeRowMeta("exc", 0, { id: 42 }), { ref: "exc-001", hasId: true });
  assert.deepEqual(safeRowMeta("port", 2, {}), { ref: "port-003", hasId: false });
  assert.deepEqual(safeRowMeta("sailing", 0, null), { ref: "sailing-001", hasId: false });
});
