import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeSailing, normalizeExcursions } from "../dist/summaries.js";
import { buildReport, renderMarkdown } from "../dist/report.js";

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

function fixtures() {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  return { s, excs };
}

test("buildReport groups every excursion under exactly one port day", () => {
  const { s, excs } = fixtures();
  const report = buildReport(s, excs);
  assert.equal(report.portDays.length, s.ports.length);
  assert.equal(report.counts.excursions, excs.length);
  const total = report.portDays.reduce((n, d) => n + d.excursions.length, 0);
  assert.equal(total, excs.length);
  assert.equal(report.counts.booked, 1);
  assert.equal(report.counts.soldOut, 2);
});

test("booked excursions sort before available and sold-out within a port", () => {
  const { s, excs } = fixtures();
  const report = buildReport(s, excs);
  const nassau = report.portDays.find((d) => d.portCode === "NAS");
  assert.equal(nassau.excursions[0].booked, true); // NASA01 booked -> first
});

test("renderMarkdown includes ship, itinerary, a sea-day note, and no leaked ids", () => {
  const { s, excs } = fixtures();
  const md = renderMarkdown(buildReport(s, excs));
  assert.match(md, /# Norwegian Sample — Excursion Plan/);
  assert.ok(md.includes("3-Day Sample Bahamas & Cozumel From Miami"));
  assert.match(md, /Sea Day/);
  assert.match(md, /✅ Booked/);
  assert.match(md, /⛔ Sold out/);
  assert.doesNotMatch(md, /NASA01|99999999|88888888/); // no raw codes/ids in the report
});
