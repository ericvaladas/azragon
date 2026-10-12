/**
 * Screen-edge indicator for a projected point (NDC from Vector3.project). Returns null when the point
 * is on screen. Points behind the camera are mirrored so the arrow points the way to turn.
 * angle is in screen space (radians, 0 = right, +π/2 = down).
 */
export function edgeArrow(
  ndcX: number,
  ndcY: number,
  behind: boolean,
  w: number,
  h: number,
  margin: number,
): { x: number; y: number; angle: number } | null {
  if (!behind && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) return null;
  let dx = behind ? -ndcX : ndcX;
  let dy = behind ? ndcY : -ndcY; // screen y points down
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) dy = 1;
  const hw = w / 2 - margin;
  const hh = h / 2 - margin;
  const k = Math.min(hw / Math.max(Math.abs(dx), 1e-9), hh / Math.max(Math.abs(dy), 1e-9));
  dx *= k;
  dy *= k;
  return { x: w / 2 + dx, y: h / 2 + dy, angle: Math.atan2(dy, dx) };
}
