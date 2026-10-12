/** Low-res render target size for a CSS viewport. Keeps aspect, floors height at minH, never upsamples past CSS size. */
export function internalSize(cssW: number, cssH: number, pixelScale: number, minH: number): { w: number; h: number } {
  if (cssW <= 0 || cssH <= 0) return { w: 1, h: 1 };
  const h = Math.min(cssH, Math.max(minH, Math.round(cssH / pixelScale)));
  const w = Math.max(1, Math.round(h * (cssW / cssH)));
  return { w, h: Math.max(1, h) };
}
