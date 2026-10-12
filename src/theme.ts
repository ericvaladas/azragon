export const theme = {
  background: '#0d1110',
  surface: '#161d1a',
  primary: '#9be22d',
  secondary: '#a24bd8',
  text: '#f2f5e8',
  textMuted: 'rgba(242, 245, 232, 0.7)',
};

export type Theme = typeof theme;

export function applyTheme(t: Theme): void {
  const s = document.documentElement.style;
  s.setProperty('--color-background', t.background);
  s.setProperty('--color-surface', t.surface);
  s.setProperty('--color-primary', t.primary);
  s.setProperty('--color-secondary', t.secondary);
  s.setProperty('--color-text', t.text);
  s.setProperty('--color-text-muted', t.textMuted);
}
