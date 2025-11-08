import { describe, expect, it } from "vitest";

import { escapeCsv, resolveMonthRange } from "@/lib/reports";

describe("resolveMonthRange", () => {
  it("returns the first and last day of the given month", () => {
    const { start, end } = resolveMonthRange("2024-06-15");

    expect(start.getUTCFullYear()).toBe(2024);
    expect(start.getUTCMonth()).toBe(5);
    expect(start.getUTCDate()).toBe(1);

    expect(end.getUTCFullYear()).toBe(2024);
    expect(end.getUTCMonth()).toBe(5);
    expect(end.getUTCDate()).toBe(30);
  });

  it("falls back to current month when no argument is provided", () => {
    const now = new Date();
    const { start, end } = resolveMonthRange();

    expect(start.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(start.getUTCMonth()).toBe(now.getUTCMonth());
    expect(start.getUTCDate()).toBe(1);
    expect(end.getUTCMonth()).toBe(now.getUTCMonth());
  });
});

describe("escapeCsv", () => {
  it("wraps values containing commas", () => {
    expect(escapeCsv("hello,world")).toBe('"hello,world"');
  });

  it("escapes double quotes", () => {
    expect(escapeCsv('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("returns plain strings when no escaping is required", () => {
    expect(escapeCsv("plain")).toBe("plain");
  });
});
