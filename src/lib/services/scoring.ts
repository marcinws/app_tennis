const POINT_LABELS = ["0", "15", "30", "40"] as const;

// Label for points won by one player in a regular (non-tiebreak) game.
export function pointLabel(points: number): string {
  if (!Number.isInteger(points) || points < 0 || points >= POINT_LABELS.length) {
    throw new RangeError(`Invalid point count: ${points}`);
  }
  return POINT_LABELS[points];
}
