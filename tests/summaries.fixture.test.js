import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeReservations, pickReservation, normalizeSailing, normalizeExcursions,
  summarizeExcursion, deriveShip, activityLabel, toIsoDate, collectBookedCodes,
} from "../dist/summaries.js";

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test("deriveShip maps known codes and falls back gracefully", () => {
  assert.equal(deriveShip("BLISS7ABCDEF"), "Norwegian Bliss");
  assert.equal(deriveShip("SAMPLE3MIA"), "Norwegian Sample");
  assert.equal(deriveShip(undefined), "Unknown ship");
});

test("activityLabel maps numeric levels", () => {
  assert.equal(activityLabel("1"), "Easy");
  assert.equal(activityLabel("3"), "Demanding");
  assert.equal(activityLabel(undefined), undefined);
});

test("toIsoDate handles MM/DD/YYYY, ISO, and epoch", () => {
  assert.equal(toIsoDate("09/02/2026"), "2026-09-02");
  assert.equal(toIsoDate("2026-09-02T00:00:00"), "2026-09-02");
  assert.equal(toIsoDate(1788307200000), "2026-09-02"); // epoch is a UTC instant
});

test("normalizeReservations returns local refs, no raw ids leaked", () => {
  const rows = normalizeReservations(load("reservations.json"));
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.match(r.ref, /^sailing-\d{3}$/);
  assert.equal(r.ship, "Norwegian Sample");
  assert.equal(r.sailDate, "2026-09-01");
  assert.equal(r.nights, 3);
  assert.equal(r.hasId, true);
  assert.ok(!("reservationId" in r) && !("id" in r), "must not expose raw upstream id");
});

test("pickReservation resolves the upstream voyage + reservation ids", () => {
  const ids = pickReservation(load("reservations.json"));
  assert.equal(ids.ref, "sailing-001");
  assert.equal(ids.voyageId, "88888888");
  assert.equal(ids.reservationId, "99999999");
});

test("normalizeSailing builds ordered ports with sea-day flags", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  assert.equal(s.ship, "Norwegian Sample");
  assert.equal(s.itineraryName, "3-Day Sample Bahamas & Cozumel From Miami");
  assert.equal(s.ports.length, 4);
  assert.equal(s.ports[0].ref, "port-001");
  assert.equal(s.ports[2].isSeaDay, true); // At Sea
  assert.equal(s.ports[1].isSeaDay, false);
  assert.equal(s.ports[1].date, "2026-09-02");
  assert.equal(s.nights, 3);
});

test("normalizeExcursions maps shorex to domain rows keyed to ports", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  assert.equal(excs.length, 4);
  const first = excs[0];
  assert.equal(first.code, "NASA01");
  assert.equal(first.title, "Sample Reef Snorkel Adventure");
  assert.equal(first.portName, "Nassau, Bahamas");
  assert.equal(first.portRef, "port-002"); // day 2 -> Nassau
  assert.equal(first.date, "2026-09-02");
  assert.equal(first.priceAdult, 89.99);
  assert.equal(first.priceChild, 59.99);
  assert.equal(first.currency, "USD");
  assert.equal(first.activityLevel, "Moderate");
  assert.equal(first.startTime, "09:00 am");
  assert.equal(first.booked, true); // NASA01 is in the cart fixture
});

test("portName uses the day-matched itinerary port, not a mislabeled cmsData.portName", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  const czma02 = excs.find((e) => e.code === "CZMA02"); // cmsData.portName is "Mislabeled Port, Nowhere"
  assert.equal(czma02.portName, "Cozumel, Mexico"); // day 4 -> Cozumel wins
  assert.equal(czma02.portRef, "port-004");
});

test("soldOut is set for expired or non-purchasable excursions", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  const byCode = Object.fromEntries(excs.map((e) => [e.code, e]));
  assert.equal(byCode.NASA02.soldOut, true); // empty purchase options
  assert.equal(byCode.CZMA02.soldOut, true); // hasExpired
  assert.equal(byCode.CZMA01.soldOut, false);
  assert.equal(byCode.CZMA01.booked, false);
});

test("collectBookedCodes pulls alpha-prefixed product codes from the cart", () => {
  const codes = collectBookedCodes(load("cart.json"));
  assert.ok(codes.has("NASA01"));
  assert.equal([...codes].every((c) => /^[A-Za-z]/.test(c)), true);
});

test("normalizeExcursions resolves image paths to ncl.com URLs (spaces encoded)", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  const nasa01 = excs.find((e) => e.code === "NASA01");
  assert.equal(nasa01.images.large, "https://www.ncl.com/sites/default/files/NAS_01%201920%20LG.jpg");
  assert.equal(nasa01.images.thumb, "https://www.ncl.com/sites/default/files/NAS_01_204x138.jpg");
  assert.equal(nasa01.images.xlarge, "https://www.ncl.com/sites/default/files/NAS_01_1920_XL.jpg");
  assert.deepEqual(nasa01.images.gallery, ["https://www.ncl.com/sites/default/files/NAS_01_281x146.jpg"]);
  // an excursion with no image fields yields undefined urls and an empty gallery
  const czma02 = excs.find((e) => e.code === "CZMA02");
  assert.equal(czma02.images.large, undefined);
  assert.deepEqual(czma02.images.gallery, []);
});

test("summary carries the large image url (thumb fallback)", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const excs = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  assert.equal(summarizeExcursion(excs.find((e) => e.code === "NASA01")).image, "https://www.ncl.com/sites/default/files/NAS_01%201920%20LG.jpg");
  assert.equal(summarizeExcursion(excs.find((e) => e.code === "CZMA02")).image, undefined);
});

test("summarizeExcursion drops detail fields", () => {
  const res = load("reservations.json");
  const s = normalizeSailing(load("explore-plan.json"), res.cruises[0]);
  const [first] = normalizeExcursions(load("explore-plan.json"), s, load("cart.json"));
  const sum = summarizeExcursion(first);
  assert.ok(!("description" in sum) && !("needToKnow" in sum) && !("code" in sum));
  assert.equal(sum.title, "Sample Reef Snorkel Adventure");
});
