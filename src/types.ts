export type PortCall = {
  ref: string;        // port-001
  name: string;       // "Nassau, Bahamas"
  portCode: string;   // "NAS"
  date: string;       // ISO date, "2026-09-02"
  dayOfCruise: number;
  isSeaDay: boolean;
};

export type CruiseSailing = {
  ref: string;           // sailing-001
  ship: string;          // best-effort from itinerary code, e.g. "Norwegian Bliss"
  itineraryName: string; // "7-Day Mediterranean From Rome To Barcelona"
  sailDate: string;      // ISO date
  returnDate: string;    // ISO date
  nights: number;
  ports: PortCall[];
};

export type ExcursionImages = {
  thumb?: string;   // ~204x138
  large?: string;   // ~1920x1080
  xlarge?: string;  // ~1920x1080, higher quality
  gallery: string[];
};

export type Excursion = {
  ref: string;        // exc-001
  code: string;       // NCL product code, e.g. "NASA01"
  title: string;
  portRef: string;    // port-001
  portName: string;
  date: string;       // ISO date
  durationText?: string;
  startTime?: string; // "09:00 am"
  priceAdult?: number;
  priceChild?: number;
  currency: string;   // "USD"
  activityLevel?: string;    // "Easy" | "Moderate" | "Demanding" | "Strenuous"
  activityLevelRaw?: string; // upstream numeric level
  excType?: unknown;  // NCL activity-type taxonomy (array of category objects)
  soldOut: boolean;   // expired or not purchasable
  booked: boolean;    // present in the cart
  images: ExcursionImages;
  description?: string;
  needToKnow?: string;
};

export type ExcursionSummary = {
  ref: string;
  title: string;
  port: string;
  date: string;
  duration?: string;
  startTime?: string;
  priceAdult?: number;
  priceChild?: number;
  currency: string;
  activityLevel?: string;
  soldOut: boolean;
  booked: boolean;
  image?: string; // large image URL (thumb fallback)
};
