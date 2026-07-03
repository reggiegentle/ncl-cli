import { DEFAULT_BASE_URL, type NclConfig, stripTrailingSlash } from "./config.js";
import { assertNclHost, assertReadOnlyRequest } from "./safety.js";

export class NclApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "NclApiError";
    this.status = status;
    this.data = data;
  }
}

export type TransportRequest = { url: string; method: "GET" | "POST"; headers: Record<string, string> };
export type Transport = (req: TransportRequest) => Promise<{ status: number; text: string }>;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

// Approach A (confirmed in recon): direct HTTP with the session cookie succeeds
// past Akamai when browser-like headers are sent.
const defaultTransport: Transport = async ({ url, method, headers }) => {
  const res = await fetch(url, { method, headers });
  return { status: res.status, text: await res.text() };
};

export class NclApiClient {
  private cookie: string;
  private baseUrl: string;
  private transport: Transport;

  constructor({ config, transport = defaultTransport }: { config: NclConfig; transport?: Transport }) {
    this.cookie = config.cookie || "";
    this.baseUrl = stripTrailingSlash(config.baseUrl || DEFAULT_BASE_URL);
    this.transport = transport;
    assertNclHost(this.baseUrl); // fail fast on a bad base url
  }

  // POST read endpoint (allowlisted): list the account's booked cruises.
  getReservations(): Promise<unknown> {
    return this.request("POST", "/api/account-access/v1/upcoming-cruises");
  }

  // The full excursion catalog for a sailing: itinerary + products.shorex.
  getExplorePlan(voyageId: string, reservationId: string): Promise<unknown> {
    return this.request("GET", `/shorex/api/v1/${enc(voyageId)}/${enc(reservationId)}/explore-plan`, {
      referer: `${this.baseUrl}/shorex/${enc(voyageId)}/${enc(reservationId)}/vacation-summary`,
    });
  }

  // Planned/booked shore excursions (read).
  getCart(voyageId: string, reservationId: string): Promise<unknown> {
    return this.request("GET", `/shorex/api/v1/${enc(voyageId)}/${enc(reservationId)}/cart`, {
      referer: `${this.baseUrl}/shorex/${enc(voyageId)}/${enc(reservationId)}/vacation-summary`,
    });
  }

  // Read-only GET escape hatch for uncovered paths.
  getRaw(path: string): Promise<unknown> {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return this.request("GET", normalized);
  }

  // Fetch an image (or any binary asset) from an ncl.com URL. Host-locked and
  // GET-only, same as every other request.
  async getImageBytes(imageUrl: string): Promise<Buffer> {
    assertReadOnlyRequest("GET", imageUrl);
    assertNclHost(imageUrl);
    const res = await fetch(imageUrl, { method: "GET", headers: { "user-agent": USER_AGENT, cookie: this.cookie } });
    if (!res.ok) throw new NclApiError(`Image request failed (${res.status}).`, res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  private async request(method: "GET" | "POST", path: string, extraHeaders: Record<string, string> = {}): Promise<unknown> {
    if (!this.cookie) throw new NclApiError("No NCL session cookie configured. Run `ncl auth import-cdp`.", 401);
    assertReadOnlyRequest(method, path); // read-only guard (throws METHOD_BLOCKED)
    const url = new URL(path, this.baseUrl).toString();
    assertNclHost(url); // host lock (throws HOST_BLOCKED)
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      "user-agent": USER_AGENT,
      cookie: this.cookie,
      ...extraHeaders,
    };
    const { status, text } = await this.transport({ url, method, headers });
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (status < 200 || status >= 300) {
      const msg =
        status === 401 || status === 403
          ? "NCL session rejected — re-run `ncl auth import-cdp`."
          : `NCL request failed (${status}).`;
      throw new NclApiError(msg, status, data);
    }
    return data;
  }
}

function enc(v: string): string {
  return encodeURIComponent(v);
}
