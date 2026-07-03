import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgram } from "../dist/commands.js";

test("buildProgram registers the full read-only surface", () => {
  const names = new Set(buildProgram().commands.map((c) => c.name()));
  for (const n of ["auth", "doctor", "cruise", "excursions", "api"]) {
    assert.ok(names.has(n), `missing command: ${n}`);
  }
});

test("no command or subcommand exposes a write/mutation verb", () => {
  const program = buildProgram();
  const all = JSON.stringify(program.commands.map((c) => [c.name(), c.commands.map((s) => s.name())]));
  for (const bad of ["book", "cart", "checkout", "pay", "reserve", "hold", "delete", "update", "create", "add"]) {
    assert.doesNotMatch(all, new RegExp(`\\b${bad}\\b`, "i"), `surface exposes "${bad}"`);
  }
});

test("excursions and cruise expose exactly the read subcommands", () => {
  const program = buildProgram();
  const sub = (name) => program.commands.find((c) => c.name() === name).commands.map((s) => s.name()).sort();
  assert.deepEqual(sub("excursions"), ["get", "list", "report"]);
  assert.deepEqual(sub("cruise"), ["get", "list"]);
});
