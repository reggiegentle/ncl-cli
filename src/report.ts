import type { CruiseSailing, Excursion, ExcursionSummary } from "./types.js";
import { summarizeExcursion } from "./summaries.js";

export type PortDay = { port: string; portCode: string; date: string; dayOfCruise: number; isSeaDay: boolean; excursions: ExcursionSummary[] };
export type ReportModel = {
  ship: string;
  itineraryName: string;
  sailDate: string;
  returnDate: string;
  nights: number;
  portDays: PortDay[];
  counts: { ports: number; excursions: number; booked: number; soldOut: number };
};

export function buildReport(sailing: CruiseSailing, excursions: Excursion[]): ReportModel {
  const byPort = new Map<string, Excursion[]>();
  for (const e of excursions) {
    const list = byPort.get(e.portRef) ?? [];
    list.push(e);
    byPort.set(e.portRef, list);
  }
  const portDays: PortDay[] = sailing.ports.map((p) => {
    const list = (byPort.get(p.ref) ?? []).slice().sort(sortExcursions);
    return {
      port: p.name,
      portCode: p.portCode,
      date: p.date,
      dayOfCruise: p.dayOfCruise,
      isSeaDay: p.isSeaDay,
      excursions: list.map(summarizeExcursion),
    };
  });
  return {
    ship: sailing.ship,
    itineraryName: sailing.itineraryName,
    sailDate: sailing.sailDate,
    returnDate: sailing.returnDate,
    nights: sailing.nights,
    portDays,
    counts: {
      ports: sailing.ports.filter((p) => !p.isSeaDay).length,
      excursions: excursions.length,
      booked: excursions.filter((e) => e.booked).length,
      soldOut: excursions.filter((e) => e.soldOut).length,
    },
  };
}

// Booked first, then available before sold-out, then by start time, then price.
function sortExcursions(a: Excursion, b: Excursion): number {
  if (a.booked !== b.booked) return a.booked ? -1 : 1;
  if (a.soldOut !== b.soldOut) return a.soldOut ? 1 : -1;
  const at = a.startTime ?? "";
  const bt = b.startTime ?? "";
  if (at !== bt) return at.localeCompare(bt);
  return (a.priceAdult ?? Infinity) - (b.priceAdult ?? Infinity);
}

function money(n: number | undefined, currency: string): string {
  return n === undefined ? "—" : `${currency} ${n.toFixed(2)}`;
}

export function renderMarkdown(report: ReportModel): string {
  const lines: string[] = [];
  lines.push(`# ${report.ship} — Excursion Plan`);
  lines.push("");
  if (report.itineraryName) lines.push(`**${report.itineraryName}**`);
  lines.push(`**Sailing:** ${report.sailDate} → ${report.returnDate} · ${report.nights} nights · ${report.counts.ports} ports of call`);
  lines.push(`**Excursions:** ${report.counts.excursions} listed · ${report.counts.booked} booked · ${report.counts.soldOut} sold out`);
  lines.push("");
  for (const day of report.portDays) {
    const header = day.isSeaDay
      ? `Day ${day.dayOfCruise} · ${day.date} — ${day.port} (Sea Day)`
      : `Day ${day.dayOfCruise} · ${day.date} — ${day.port}`;
    lines.push(`## ${header}`);
    lines.push("");
    if (day.excursions.length === 0) {
      lines.push(day.isSeaDay ? "_No shore excursions (day at sea)._" : "_No excursions listed._");
      lines.push("");
      continue;
    }
    lines.push("| Excursion | Start | Duration | Adult | Child | Activity | Status |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of day.excursions) {
      const status = e.booked ? "✅ Booked" : e.soldOut ? "⛔ Sold out" : "Available";
      lines.push(
        `| ${e.title} | ${e.startTime ?? "—"} | ${e.duration ?? "—"} | ${money(e.priceAdult, e.currency)} | ${money(e.priceChild, e.currency)} | ${e.activityLevel ?? "—"} | ${status} |`,
      );
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("_Unofficial. Not affiliated with Norwegian Cruise Line. Prices/availability as of pull time._");
  return lines.join("\n");
}
