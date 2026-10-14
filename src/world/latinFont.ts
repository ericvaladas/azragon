/** Blocky 5 × 7 capitals for Latin signs, rows top-down, '1' = ink. Only the letters the city's signs spell. */
export const LATIN_FONT: Readonly<Record<string, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

/** The word on each vertical board cell (0–2), read top to bottom. */
export const SIGN_WORDS = ['HOTEL', 'PIZZA', 'BANK'] as const;

/** Ink pixels of `word` stacked down the 12 × 48 board whose left edge is x0: letters 5 px wide at x0 + 3, every 9 px from y = 3. */
export function latinBoardRects(word: string, x0: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  [...word].forEach((ch, k) => {
    const rows = LATIN_FONT[ch] ?? [];
    rows.forEach((row, r) => {
      for (let c = 0; c < 5; c++) if (row[c] === '1') out.push({ x: x0 + 3 + c, y: 3 + 9 * k + r, w: 1, h: 1 });
    });
  });
  return out;
}
