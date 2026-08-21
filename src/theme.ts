/** A palette is a set of CSS tokens selected by `data-palette` on <html>. */
export interface Palette {
  id: string;
  name: string;
  note: string;
  /** Swatch shown in settings: accent, then a few status inks, light-mode values. */
  swatch: string[];
}

export const PALETTES: Palette[] = [
  {
    id: 'default',
    name: 'Default',
    note: 'Indigo accent with the original status hues.',
    swatch: ['#2f54c9', '#1c7a3d', '#c02626', '#8a5a00', '#0e6f96', '#6d40c4'],
  },
  {
    id: 'nord',
    name: 'Nord',
    note: 'Cool blue-grey, lower chroma — quieter on a bright screen.',
    swatch: ['#4a6f9b', '#4a7a52', '#a8474f', '#8a6a33', '#3f7d8c', '#6a5f9b'],
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    note: 'Warm paper neutrals and earthy status colours.',
    swatch: ['#b4552d', '#5c7148', '#b23b2e', '#a06a10', '#3f7069', '#8a5070'],
  },
  {
    id: 'mono',
    name: 'Mono',
    note: 'One blue accent; status leans on lightness rather than hue.',
    swatch: ['#2b6cb0', '#2f6f4f', '#8f2f2f', '#6f5a2a', '#35708a', '#55506e'],
  },
  {
    id: 'contrast',
    name: 'High contrast',
    note: 'Maximum separation, heavier chip borders.',
    swatch: ['#0b46d0', '#0a6b2f', '#b00016', '#7a4a00', '#005f7d', '#5c1fb0'],
  },
];

const KEY = 'reporto.palette';
export const DEFAULT_PALETTE = 'default';

export const isPalette = (id: string | null): id is string =>
  Boolean(id) && PALETTES.some((p) => p.id === id);

export function readPalette(): string {
  try {
    const stored = localStorage.getItem(KEY);
    return isPalette(stored) ? stored : DEFAULT_PALETTE;
  } catch {
    // Private browsing or a blocked storage partition: fall back rather than throw.
    return DEFAULT_PALETTE;
  }
}

/**
 * `default` sets no attribute at all, so the base tokens apply — a palette selector is an
 * override, and leaving the attribute off keeps the DOM honest about that.
 */
export function applyPalette(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) delete root.dataset.palette;
  else root.dataset.palette = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* choice just does not persist */
  }
}
