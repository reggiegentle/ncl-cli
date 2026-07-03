import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NclApiClient, NclApiError } from "../dist/ncl-api.js";

const explorePlan = readFileSync(new URL("./fixtures/explore-plan.json", import.meta.url), "utf8");

function recorder(text = "{}") {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status: 200, text };
  };
  return { calls, transport };
}

test("getExplorePlan sends a GET to ncl.com with the cookie and returns parsed JSON", async () => {
  const { calls, transport } = recorder(explorePlan);
  const client = new NclApiClient({ config: { cookie: "abc=1; def=2", baseUrl: "https://www.ncl.com" }, transport });
  const data = await client.getExplorePlan("88888888", "99999999");
  assert.ok(data.products.shorex.length > 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /^https:\/\/www\.ncl\.com\/shorex\/api\/v1\/88888888\/99999999\/explore-plan$/);
  assert.match(calls[0].headers.cookie, /abc=1/);
});

test("getReservations uses the allowlisted POST", async () => {
  const { calls, transport } = recorder('{"cruises":[]}');
  const client = new NclApiClient({ config: { cookie: "c", baseUrl: "https://www.ncl.com" }, transport });
  await client.getReservations();
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/api\/account-access\/v1\/upcoming-cruises$/);
});

test("constructor refuses a non-ncl base url", () => {
  assert.throws(
    () => new NclApiClient({ config: { cookie: "c", baseUrl: "https://evil.com" }, transport: async () => ({ status: 200, text: "{}" }) }),
    /HOST_BLOCKED/,
  );
});

test("getRaw refuses a protocol-relative path that resolves off ncl.com", async () => {
  const { transport } = recorder();
  const client = new NclApiClient({ config: { cookie: "c", baseUrl: "https://www.ncl.com" }, transport });
  // "//evil.com/steal" resolves to https://evil.com/steal — the host lock must catch it
  await assert.rejects(() => client.getRaw("//evil.com/steal"), /HOST_BLOCKED/);
});

test("missing cookie raises before any request", async () => {
  const { calls, transport } = recorder();
  const client = new NclApiClient({ config: { baseUrl: "https://www.ncl.com" }, transport });
  await assert.rejects(() => client.getReservations(), (e) => e instanceof NclApiError && e.status === 401);
  assert.equal(calls.length, 0);
});

test("non-2xx raises NclApiError with status", async () => {
  const client = new NclApiClient({
    config: { cookie: "c", baseUrl: "https://www.ncl.com" },
    transport: async () => ({ status: 403, text: "denied" }),
  });
  await assert.rejects(() => client.getCart("1", "2"), (e) => e.status === 403);
});
