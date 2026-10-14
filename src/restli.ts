/**
 * Helpers for Rest.li 2.0 encoding, which LinkedIn's REST API uses for URNs in
 * paths and for structured query parameters such as `List(...)` and `(k:v)`.
 */

/** A query value that is already Rest.li-encoded and must not be escaped again. */
export class Raw {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export const raw = (value: string) => new Raw(value);

/** Escapes a primitive for use inside a Rest.li structure (URNs, strings). */
export function encodeValue(value: string | number | boolean): string {
  return encodeURIComponent(String(value)).replace(/[()',:]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `List(a,b,c)` with each element escaped. */
export function list(values: Array<string | number>): Raw {
  return raw(`List(${values.map(encodeValue).join(",")})`);
}

type RecordValue = string | number | boolean | Raw | { [k: string]: RecordValue };

/** `(k1:v1,k2:(nested:v))` with leaf values escaped. */
export function record(obj: Record<string, RecordValue>): Raw {
  const encode = (v: RecordValue): string =>
    v instanceof Raw ? v.value : typeof v === "object" ? record(v).value : encodeValue(v);
  return raw(
    `(${Object.entries(obj)
      .map(([k, v]) => `${k}:${encode(v)}`)
      .join(",")})`,
  );
}

export type QueryValue = string | number | boolean | Raw | undefined;

export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${v instanceof Raw ? v.value : encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** URN for use as a path segment, e.g. `/rest/posts/{urn}`. */
export const urnPath = (urn: string) => encodeURIComponent(urn);

export function personUrn(id: string): string {
  return id.startsWith("urn:") ? id : `urn:li:person:${id}`;
}

export function organizationUrn(id: string | number): string {
  const s = String(id);
  return s.startsWith("urn:") ? s : `urn:li:organization:${s}`;
}

/** Accepts a post URN or a linkedin.com post URL and returns the URN. */
export function postUrn(input: string): string {
  const s = input.trim();
  if (s.startsWith("urn:li:")) return s;
  const m = s.match(/urn:li:(share|ugcPost|activity):(\d+)/) ??
    decodeURIComponent(s).match(/urn:li:(share|ugcPost|activity):(\d+)/);
  if (m) return `urn:li:${m[1]}:${m[2]}`;
  const activity = s.match(/activity-(\d+)/);
  if (activity) return `urn:li:activity:${activity[1]}`;
  throw new Error(`Could not find a post URN in "${input}".`);
}

/** Rest.li date for analytics: `(day:1,month:2,year:2026)`. */
export function restliDate(iso: string): Raw {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date "${iso}", expected YYYY-MM-DD.`);
  return record({ day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
}
