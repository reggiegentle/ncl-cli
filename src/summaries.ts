import type { CruiseSailing, Excursion, ExcursionImages, ExcursionSummary, PortCall } from "./types.js";
import { localRef } from "./safety.js";

// NCL serves excursion images as site-relative Drupal paths off www.ncl.com.
const IMAGE_BASE = "https://www.ncl.com/";

function firstOf(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function toImageUrl(pathOrNull: unknown): string | undefined {
  const p = firstOf(pathOrNull);
  return p ? IMAGE_BASE + encodeURI(p) : undefined;
}

function imagesFromCms(cms: any): ExcursionImages {
  const gallery = Array.isArray(cms?.imagesPath)
    ? cms.imagesPath.map(toImageUrl).filter((u: string | undefined): u is string => Boolean(u))
    : [];
  return {
    thumb: toImageUrl(cms?.smallImgPath),
    large: toImageUrl(cms?.largeImgPath),
    xlarge: toImageUrl(cms?.xlargeImgPath),
    gallery,
  };
}

// --- helpers ----------------------------------------------------------------

function asCruises(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const r = raw as any;
    if (Array.isArray(r.cruises)) return r.cruises;
    if (Array.isArray(r.reservations)) return r.reservations;
    if (Array.isArray(r.items)) return r.items;
  }
  return [];
}

export function toIsoDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // epoch millis
    const d = new Date(value);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof value !== "string" || !value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/); // 2026-09-01 or 2026-09-01T...
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // 09/01/2026
  if (us) return `${us[3]}-${pad(+us[1])}-${pad(+us[2])}`;
  return value;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// NCL itinerary codes lead with a ship token, e.g. "BLISS7XYZ..." -> Norwegian Bliss.
const SHIP_NAMES: Record<string, string> = {
  EPIC: "Norwegian Epic", BLISS: "Norwegian Bliss", ENCORE: "Norwegian Encore",
  JOY: "Norwegian Joy", ESCAPE: "Norwegian Escape", GETAWAY: "Norwegian Getaway",
  BREAKAWAY: "Norwegian Breakaway", PEARL: "Norwegian Pearl", JEWEL: "Norwegian Jewel",
  GEM: "Norwegian Gem", DAWN: "Norwegian Dawn", STAR: "Norwegian Star",
  SUN: "Norwegian Sun", SKY: "Norwegian Sky", SPIRIT: "Norwegian Spirit",
  JADE: "Norwegian Jade", PRIMA: "Norwegian Prima", VIVA: "Norwegian Viva",
  AQUA: "Norwegian Aqua", LUNA: "Norwegian Luna",
};

export function deriveShip(itineraryCode?: string): string {
  if (!itineraryCode) return "Unknown ship";
  const token = (itineraryCode.match(/^[A-Za-z]+/)?.[0] || "").toUpperCase();
  if (!token) return "Unknown ship";
  return SHIP_NAMES[token] || `Norwegian ${token.charAt(0)}${token.slice(1).toLowerCase()}`;
}

const ACTIVITY_LABELS: Record<string, string> = { "1": "Easy", "2": "Moderate", "3": "Demanding", "4": "Strenuous" };

export function activityLabel(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  const key = String(raw);
  return ACTIVITY_LABELS[key] || key;
}

// --- reservations -----------------------------------------------------------

export type ReservationSummary = {
  ref: string;
  itineraryName: string;
  ship: string;
  sailDate: string;
  nights: number;
  hasId: boolean;
};

export function normalizeReservations(raw: unknown): ReservationSummary[] {
  return asCruises(raw).map((c, i) => ({
    ref: localRef("sailing", i),
    itineraryName: String(c.itineraryName ?? ""),
    ship: deriveShip(c.itineraryCode),
    sailDate: toIsoDate(c.vacationStartDate ?? c.startDate),
    nights: nightsBetween(c.vacationStartDate ?? c.startDate, c.vacationEndDate ?? c.endDate),
    hasId: Boolean(c.reservationId ?? c.id),
  }));
}

function nightsBetween(start: unknown, end: unknown): number {
  const s = Date.parse(toIsoDate(start));
  const e = Date.parse(toIsoDate(end));
  if (Number.isFinite(s) && Number.isFinite(e) && e > s) return Math.round((e - s) / 86400000);
  return 0;
}

// Internal resolution of the upstream ids needed to build shorex URLs.
// Not exposed in summarized command output.
export function pickReservation(raw: unknown, preferredRef?: string): { ref: string; voyageId: string; reservationId: string } | null {
  const cruises = asCruises(raw);
  if (cruises.length === 0) return null;
  const rows = normalizeReservations(raw);
  const idx = preferredRef ? rows.findIndex((r) => r.ref === preferredRef) : 0;
  const useIdx = idx >= 0 ? idx : 0;
  const c = cruises[useIdx];
  const voyageId = String(c?.guests?.[0]?.client?.id ?? c?.clientId ?? "");
  const reservationId = String(c?.reservationId ?? c?.id ?? "");
  return { ref: rows[useIdx].ref, voyageId, reservationId };
}

// --- sailing / itinerary ----------------------------------------------------

function itineraryOf(explorePlan: any): any[] {
  const it = explorePlan?.filters?.itinerary;
  return Array.isArray(it) ? it : [];
}

export function normalizeSailing(explorePlan: any, reservationRow?: any): CruiseSailing {
  const ports: PortCall[] = itineraryOf(explorePlan).map((p, i) => {
    const name = String(p.name ?? p.portName ?? "");
    const portCode = String(p.portCode ?? p.mappedCode ?? "");
    return {
      ref: localRef("port", i),
      name,
      portCode,
      date: toIsoDate(p.dateOfCruise ?? p.date),
      dayOfCruise: Number(p.dayOfCruise ?? i + 1),
      isSeaDay: portCode === "AtSea" || /at sea|sea day/i.test(name),
    };
  });
  const firstDate = ports[0]?.date ?? "";
  const lastDate = ports[ports.length - 1]?.date ?? "";
  return {
    ref: "sailing-001",
    ship: deriveShip(reservationRow?.itineraryCode),
    itineraryName: String(reservationRow?.itineraryName ?? ""),
    sailDate: toIsoDate(reservationRow?.vacationStartDate) || firstDate,
    returnDate: toIsoDate(reservationRow?.vacationEndDate) || lastDate,
    nights: Math.max(0, ports.length - 1),
    ports,
  };
}

// --- excursions -------------------------------------------------------------

// Booked excursions live in the cart. Collect every product code / id present
// so an excursion can be flagged booked. Defensive against unknown nesting.
export function collectBookedCodes(cart: unknown): Set<string> {
  const codes = new Set<string>();
  const visit = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(visit);
    for (const [k, v] of Object.entries(o)) {
      if ((k === "id" || k === "code" || k === "productCode") && (typeof v === "string" || typeof v === "number")) {
        const s = String(v);
        if (/^[A-Za-z]/.test(s)) codes.add(s); // product codes are alpha-prefixed, skip pure numeric ids
      }
      if (v && typeof v === "object") visit(v);
    }
  };
  visit(cart);
  return codes;
}

function shorexOf(explorePlan: any): any[] {
  const s = explorePlan?.products?.shorex;
  return Array.isArray(s) ? s : [];
}

export function normalizeExcursions(explorePlan: any, sailing: CruiseSailing, cart?: unknown): Excursion[] {
  const booked = collectBookedCodes(cart);
  const portByDay = new Map<number, PortCall>();
  for (const p of sailing.ports) portByDay.set(p.dayOfCruise, p);

  return shorexOf(explorePlan).map((x, i) => {
    const cms = x.cmsData ?? {};
    const day = Array.isArray(x.daysOfCruise) ? Number(x.daysOfCruise[0]) : NaN;
    const port = portByDay.get(day);
    const code = String(x.id ?? cms.code ?? "");
    const purchaseOptions = x.shorexAvailablePurchaseOptions;
    const soldOut = x.hasExpired === true || (Array.isArray(purchaseOptions) && purchaseOptions.length === 0);
    return {
      ref: localRef("exc", i),
      code,
      title: String(cms.title ?? x.title ?? ""),
      portRef: port?.ref ?? "port-001",
      // The day-matched itinerary port is authoritative: NCL's cmsData.portName
      // is occasionally wrong (some excursions carry a mismatched port name).
      portName: String(port?.name ?? cms.portName ?? ""),
      date: port?.date ?? "",
      durationText: x.durationDisplay ?? (x.duration ? `${x.duration} hours` : undefined),
      startTime: x.earliestStartTimeDisplay ?? undefined,
      priceAdult: toNumber(x.displayPrice),
      priceChild: toNumber(x.displayChildPrice),
      currency: String(explorePlan?.reservation?.currencyCode ?? "USD"),
      activityLevel: activityLabel(cms.activityLevel),
      activityLevelRaw: cms.activityLevel != null ? String(cms.activityLevel) : undefined,
      excType: cms.excType ?? undefined,
      soldOut,
      booked: booked.has(code),
      images: imagesFromCms(cms),
      description: cms.description ?? undefined,
      needToKnow: cms.needToKnow ?? undefined,
    };
  });
}

export function summarizeExcursion(exc: Excursion): ExcursionSummary {
  return {
    ref: exc.ref,
    title: exc.title,
    port: exc.portName,
    date: exc.date,
    duration: exc.durationText,
    startTime: exc.startTime,
    priceAdult: exc.priceAdult,
    priceChild: exc.priceChild,
    currency: exc.currency,
    activityLevel: exc.activityLevel,
    soldOut: exc.soldOut,
    booked: exc.booked,
    image: exc.images.large ?? exc.images.thumb,
  };
}
