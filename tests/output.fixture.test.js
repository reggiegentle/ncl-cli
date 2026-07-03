import { test } from "node:test";
import assert from "node:assert/strict";
import { ok, fail, makeError, toErrorCode } from "../dist/output.js";

test("ok wraps data with ok:true", () => {
  assert.deepEqual(ok({ a: 1 }), { ok: true, data: { a: 1 } });
});

test("fail wraps error with ok:false", () => {
  const env = fail({ code: "X", message: "m", retryable: false });
  assert.equal(env.ok, false);
  assert.equal(env.error.code, "X");
});

test("toErrorCode maps 403 to AUTH_INVALID", () => {
  assert.equal(toErrorCode({ status: 403 }), "AUTH_INVALID");
});

test("makeError carries http status and retryable flag", () => {
  const e = makeError({ status: 429, message: "slow down" });
  assert.equal(e.code, "RATE_LIMITED");
  assert.equal(e.retryable, true);
  assert.deepEqual(e.http, { status: 429 });
});
