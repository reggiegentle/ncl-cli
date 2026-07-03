import { printJson } from "./output.js";

export function handleParseFailure(err: any): void {
  if (err?.code === "commander.helpDisplayed" || err?.code === "commander.version" || err?.code === "commander.help") return;
  printJson({ ok: false, error: { code: err?.code || "CLI_ERROR", message: err?.message || "Command failed", retryable: false } });
  process.exitCode = 1;
}
