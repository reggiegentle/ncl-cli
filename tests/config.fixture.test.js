import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { redactCookie, writeConfig, readConfig, getConfigPath } from "../dist/config.js";

test("redactCookie masks the middle", () => {
  assert.equal(redactCookie("abcdef0123456789"), "abcdef...6789");
  assert.equal(redactCookie(undefined), null);
});

test("writeConfig persists and readConfig round-trips, mode 0600", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ncl-cfg-"));
  process.env.XDG_CONFIG_HOME = dir;
  await writeConfig({ cookie: "secret", sailingRef: "sailing-001" });
  const back = await readConfig();
  assert.equal(back.sailingRef, "sailing-001");
  const stat = await fs.stat(getConfigPath());
  assert.equal(stat.mode & 0o777, 0o600);
  delete process.env.XDG_CONFIG_HOME;
});
