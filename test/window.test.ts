import { describe, expect, test } from "bun:test";
import { createDateWindow } from "../skills/last30days/src/core/window";

describe("date window", () => {
  test("builds an inclusive 30-day window", () => {
    expect(createDateWindow(30, "2026-08-12")).toEqual({
      from: "2026-07-14",
      to: "2026-08-12",
      days: 30,
    });
  });

  test("rejects invalid calendar dates", () => {
    expect(() => createDateWindow(30, "2026-02-30")).toThrow("real calendar date");
  });

  test("rejects invalid day counts", () => {
    expect(() => createDateWindow(0, "2026-08-12")).toThrow("between 1 and 3650");
  });

  test("rejects future as-of dates", () => {
    expect(() => createDateWindow(30, "2026-08-13", new Date("2026-08-12T12:00:00Z"))).toThrow("future");
  });
});
