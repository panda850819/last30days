import type { DateWindow } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`Invalid --as-of date: ${value}; expected YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid --as-of date: ${value}; expected a real calendar date`);
  }
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDateWindow(days = 30, asOf?: string, now = new Date()): DateWindow {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error("--days must be an integer between 1 and 3650");
  }
  const end = asOf ? parseIsoDate(asOf) : new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (end.getTime() > today.getTime()) throw new Error("--as-of cannot be in the future");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: iso(start), to: iso(end), days };
}
