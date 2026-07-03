import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../dist/auth.js";

test("validateConfig fails fast when cookie missing", async () => {
  const res = await validateConfig({}, { transport: async () => ({ status: 200, text: "{}" }) });
  assert.equal(res.ok, false);
  assert.equal(res.errorCode, "AUTH_MISSING");
});

test("validateConfig ok on 200", async () => {
  const res = await validateConfig(
    { cookie: "c", baseUrl: "https://www.ncl.com" },
    { transport: async () => ({ status: 200, text: '{"cruises":[]}' }) },
  );
  assert.equal(res.ok, true);
});

test("validateConfig maps 403 to AUTH_INVALID", async () => {
  const res = await validateConfig(
    { cookie: "c", baseUrl: "https://www.ncl.com" },
    { transport: async () => ({ status: 403, text: "no" }) },
  );
  assert.equal(res.ok, false);
  assert.equal(res.errorCode, "AUTH_INVALID");
});
