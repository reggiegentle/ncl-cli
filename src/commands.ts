import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fail, makeError, ok, printJson } from "./output.js";
import { clearConfig, getDisplayConfigPath, redactCookie, resolveConfig } from "./config.js";
import { importFromCdp, saveAndValidate, validateConfig } from "./auth.js";
import { NclApiClient } from "./ncl-api.js";
import {
  normalizeExcursions, normalizeReservations, normalizeSailing, pickReservation, summarizeExcursion,
} from "./summaries.js";
import { buildReport, renderMarkdown } from "./report.js";

async function api() {
  const config = await resolveConfig();
  return { config, client: new NclApiClient({ config }) };
}

// Resolve the raw reservation row + upstream ids for a sailing ref (or the default).
async function loadSailing(client: NclApiClient, preferredRef?: string) {
  const reservationsRaw = await client.getReservations();
  const ids = pickReservation(reservationsRaw, preferredRef);
  if (!ids) throw Object.assign(new Error("No booked cruises found on this NCL account."), { code: "NOT_FOUND" });
  const cruises = normalizeReservations(reservationsRaw);
  const rawCruises = (reservationsRaw as any)?.cruises ?? [];
  const row = rawCruises[cruises.findIndex((c) => c.ref === ids.ref)];
  const explorePlan = await client.getExplorePlan(ids.voyageId, ids.reservationId);
  const sailing = normalizeSailing(explorePlan, row);
  return { ids, explorePlan, sailing };
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("ncl").description("Read-only CLI to pull NCL cruise itinerary and shore-excursion data as JSON").version("0.1.0");

  // --- auth ---
  const auth = program.command("auth").description("session management");
  auth
    .command("import-cdp")
    .description("import ncl.com session cookies from a Chrome running with --remote-debugging-port")
    .option("--port <port>", "Chrome remote debugging port", "9333")
    .action(async (opts) => {
      try {
        const config = await importFromCdp({ port: Number(opts.port) });
        const { validation, saved } = await saveAndValidate(config);
        printJson(
          saved
            ? ok({ saved, path: getDisplayConfigPath() })
            : fail(makeError({ message: validation.reason, code: validation.errorCode })),
        );
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });
  auth
    .command("status")
    .description("show whether a session is saved (never prints the cookie)")
    .action(async () => {
      const config = await resolveConfig();
      printJson(ok({ hasCookie: Boolean(config.cookie), cookie: redactCookie(config.cookie), source: config.source, path: getDisplayConfigPath() }));
    });
  auth
    .command("clear")
    .description("delete the saved session")
    .action(async () => {
      await clearConfig();
      printJson(ok({ cleared: true }));
    });

  // --- doctor ---
  program
    .command("doctor")
    .description("check session health via one cheap authenticated read")
    .action(async () => {
      const config = await resolveConfig();
      const validation = await validateConfig(config);
      printJson(validation.ok ? ok({ session: "ok" }) : fail(makeError({ message: validation.reason, code: validation.errorCode })));
    });

  // --- cruise ---
  const cruise = program.command("cruise").description("booked sailing");
  cruise
    .command("list")
    .description("list booked cruises (summarized)")
    .action(async () => {
      try {
        const { client } = await api();
        printJson(ok(normalizeReservations(await client.getReservations())));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });
  cruise
    .command("get")
    .description("ship, dates, and itinerary for the booked sailing")
    .option("--sailing <ref>", "sailing ref from `cruise list` (default: first)")
    .action(async (opts) => {
      try {
        const { client } = await api();
        const { sailing } = await loadSailing(client, opts.sailing);
        printJson(ok(sailing));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });

  // --- excursions ---
  const exc = program.command("excursions").description("shore excursions");
  exc
    .command("list")
    .description("excursions across all ports (summarized)")
    .option("--sailing <ref>", "sailing ref from `cruise list` (default: first)")
    .option("--port <ref>", "filter to a port ref, e.g. port-002")
    .option("--full", "return full excursion objects (detail + image URLs) instead of summaries")
    .option("--raw", "return the full upstream explore-plan payload")
    .action(async (opts) => {
      try {
        const { client } = await api();
        const { ids, explorePlan, sailing } = await loadSailing(client, opts.sailing);
        if (opts.raw) return printJson(ok(explorePlan));
        const cart = await safeCart(client, ids);
        let excs = normalizeExcursions(explorePlan, sailing, cart);
        if (opts.port) excs = excs.filter((e) => e.portRef === opts.port);
        printJson(ok(opts.full ? excs : excs.map(summarizeExcursion)));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });
  exc
    .command("images")
    .description("download excursion images to a folder (read-only GETs)")
    .requiredOption("--out <dir>", "destination folder for the images")
    .option("--sailing <ref>", "sailing ref from `cruise list` (default: first)")
    .option("--size <size>", "thumb | large | xlarge", "large")
    .option("--port <ref>", "only this port ref, e.g. port-002")
    .action(async (opts) => {
      try {
        const size = (["thumb", "large", "xlarge"].includes(opts.size) ? opts.size : "large") as "thumb" | "large" | "xlarge";
        const { client } = await api();
        const { ids, explorePlan, sailing } = await loadSailing(client, opts.sailing);
        const cart = await safeCart(client, ids);
        let excs = normalizeExcursions(explorePlan, sailing, cart);
        if (opts.port) excs = excs.filter((e) => e.portRef === opts.port);
        await mkdir(opts.out, { recursive: true });
        const targets = excs
          .map((e) => ({ ref: e.ref, code: e.code, url: e.images[size] }))
          .filter((t): t is { ref: string; code: string; url: string } => Boolean(t.url));
        const result = await downloadImages(client, targets, opts.out);
        printJson(ok({ size, out: opts.out, total: excs.length, withoutImage: excs.length - targets.length, ...result }));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });
  exc
    .command("get")
    .description("full detail for one excursion ref, e.g. exc-004")
    .argument("<ref>", "excursion ref")
    .option("--sailing <ref>", "sailing ref from `cruise list` (default: first)")
    .action(async (ref, opts) => {
      try {
        const { client } = await api();
        const { ids, explorePlan, sailing } = await loadSailing(client, opts.sailing);
        const cart = await safeCart(client, ids);
        const match = normalizeExcursions(explorePlan, sailing, cart).find((e) => e.ref === ref);
        printJson(match ? ok(match) : fail({ code: "NOT_FOUND", message: `No excursion ${ref}`, retryable: false }));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });
  exc
    .command("report")
    .description("per-port-day planning digest (markdown or json)")
    .option("--sailing <ref>", "sailing ref from `cruise list` (default: first)")
    .option("--format <fmt>", "markdown | json", "markdown")
    .option("--out <path>", "write to a file instead of stdout")
    .action(async (opts) => {
      try {
        const { client } = await api();
        const { ids, explorePlan, sailing } = await loadSailing(client, opts.sailing);
        const cart = await safeCart(client, ids);
        const report = buildReport(sailing, normalizeExcursions(explorePlan, sailing, cart));
        const body = opts.format === "json" ? JSON.stringify(report, null, 2) : renderMarkdown(report);
        if (opts.out) {
          await writeFile(opts.out, body, "utf8");
          printJson(ok({ written: opts.out, format: opts.format }));
        } else if (opts.format === "json") {
          printJson(ok(report));
        } else {
          process.stdout.write(body + "\n");
        }
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });

  // --- api (read-only escape hatch) ---
  const apiCmd = program.command("api").description("read-only escape hatch");
  apiCmd
    .command("get")
    .description("GET an uncovered ncl.com /path and print raw JSON")
    .argument("<path>", "an ncl.com path, e.g. /shorex/api/v1/<v>/<r>/favorites")
    .option("--unsafe-raw", "required to print raw upstream JSON")
    .action(async (path, opts) => {
      if (!opts.unsafeRaw) return printJson(fail({ code: "VALIDATION", message: "api get requires --unsafe-raw", retryable: false }));
      try {
        const { client } = await api();
        printJson(ok(await client.getRaw(path)));
      } catch (e) {
        printJson(fail(makeError(e)));
      }
    });

  return program;
}

// The cart read is best-effort — a failure there must not sink an excursions pull.
async function safeCart(client: NclApiClient, ids: { voyageId: string; reservationId: string }) {
  try {
    return await client.getCart(ids.voyageId, ids.reservationId);
  } catch {
    return null;
  }
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");

// Download image targets with limited concurrency. Each file is {ref}_{code}.jpg.
async function downloadImages(
  client: NclApiClient,
  targets: Array<{ ref: string; code: string; url: string }>,
  outDir: string,
): Promise<{ downloaded: number; failed: number }> {
  const queue = targets.slice();
  let downloaded = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift()!;
      try {
        const bytes = await client.getImageBytes(t.url);
        await writeFile(join(outDir, `${t.ref}_${safeName(t.code)}.jpg`), bytes);
        downloaded++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, targets.length) || 1 }, worker));
  return { downloaded, failed };
}
