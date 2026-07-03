import { createRequire } from "node:module";
import { writeConfig, type NclConfig } from "./config.js";
import { NclApiClient, type Transport } from "./ncl-api.js";

// chrome-remote-interface ships CommonJS; load it via require for ESM interop.
const require = createRequire(import.meta.url);

export type ValidationResult = { ok: boolean; reason?: string; errorCode?: string };

export async function validateConfig(config: NclConfig, opts: { transport?: Transport } = {}): Promise<ValidationResult> {
  if (!config.cookie) return { ok: false, reason: "Missing NCL session cookie", errorCode: "AUTH_MISSING" };
  try {
    const client = new NclApiClient({ config, transport: opts.transport });
    await client.getReservations();
    return { ok: true };
  } catch (error: any) {
    const status = error?.status;
    const errorCode = status === 401 || status === 403 ? "AUTH_INVALID" : "CHECK_FAILED";
    return { ok: false, reason: error?.message || "Validation failed", errorCode };
  }
}

export async function saveAndValidate(config: NclConfig): Promise<{ config: NclConfig; validation: ValidationResult; saved: boolean }> {
  const validation = await validateConfig(config);
  if (validation.ok) {
    await writeConfig(config);
    return { config, validation, saved: true };
  }
  return { config, validation, saved: false };
}

export async function importFromCdp({ port = 9333, host = "127.0.0.1" }: { port?: number; host?: string } = {}): Promise<NclConfig> {
  const CDP = require("chrome-remote-interface");
  const targets = await CDP.List({ host, port });
  const target = targets.find((c: any) => c.type === "page" && String(c.url || "").includes("ncl.com"));
  if (!target) throw new Error("No ncl.com tab found in the Chrome on that debug port. Open ncl.com and log in first.");
  const client = await CDP({ host, port, target });
  try {
    await client.Network.enable();
    const { cookies } = await client.Network.getCookies({ urls: ["https://www.ncl.com"] });
    const usable = (cookies || []).filter((c: any) => c.name && c.value != null);
    if (usable.length === 0) throw new Error("No ncl.com cookies found in the attached Chrome session.");
    const cookieHeader = usable.map((c: any) => `${c.name}=${c.value}`).join("; ");
    return { cookie: cookieHeader, baseUrl: "https://www.ncl.com" };
  } finally {
    await client.close();
  }
}
