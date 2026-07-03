import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type NclConfig = { cookie?: string; sailingRef?: string; baseUrl?: string };
export type ResolvedConfig = NclConfig & { source: "env" | "config" | "mixed" | "none" };

export const DEFAULT_BASE_URL = "https://www.ncl.com";

function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg || path.join(os.homedir(), ".config");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "ncl", "config.json");
}

export function getDisplayConfigPath(): string {
  return process.env.XDG_CONFIG_HOME?.trim() ? "$XDG_CONFIG_HOME/ncl/config.json" : "~/.config/ncl/config.json";
}

export async function readConfig(): Promise<NclConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as NclConfig) : {};
  } catch {
    return {};
  }
}

export async function writeConfig(config: NclConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    await fs.chmod(configPath, 0o600);
  } catch {
    // best effort on non-POSIX filesystems
  }
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(getConfigPath());
  } catch {
    // ignore
  }
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const fileConfig = await readConfig();
  const envCookie = process.env.NCL_COOKIE?.trim();
  const envSailing = process.env.NCL_SAILING_REF?.trim();
  const config: NclConfig = {
    cookie: envCookie || fileConfig.cookie,
    sailingRef: envSailing || fileConfig.sailingRef,
    baseUrl: stripTrailingSlash(fileConfig.baseUrl || DEFAULT_BASE_URL),
  };
  const fromEnv = Boolean(envCookie || envSailing);
  const fromConfig = Boolean(fileConfig.cookie || fileConfig.sailingRef || fileConfig.baseUrl);
  const source: ResolvedConfig["source"] = fromEnv && fromConfig ? "mixed" : fromEnv ? "env" : fromConfig ? "config" : "none";
  return { ...config, source };
}

export function redactCookie(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
