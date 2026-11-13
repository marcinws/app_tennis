import { describe, expect, it } from "vitest";

import { pointLabel } from "./scoring";

describe("pointLabel", () => {
  it.each([
    [0, "0"],
    [1, "15"],
    [2, "30"],
    [3, "40"],
  ])("labels %i points as %s", (points, label) => {
    expect(pointLabel(points)).toBe(label);
  });

  it.each([4, -1, 1.5])("throws RangeError for %s", (points) => {
    expect(() => pointLabel(points)).toThrow(RangeError);
    expect(() => pointLabel(points)).toThrow(String(points));
  });
});
