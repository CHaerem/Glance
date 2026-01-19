/**
 * Color Palette and Color Math
 * E-ink color palettes and perceptual color matching algorithms
 */

import type { RGB, LAB } from '../../types';
import type { EinkPaletteColor, Spectra6Color, Spectra6ColorWithLab } from './types';

// E-ink color palette for Waveshare 13.3" Spectra 6 (hardware colors - do not change RGB values)
export const EINK_PALETTE: EinkPaletteColor[] = [
  { rgb: [0, 0, 0], index: 0x0 }, // Black
  { rgb: [255, 255, 255], index: 0x1 }, // White
  { rgb: [255, 255, 0], index: 0x2 }, // Yellow
  { rgb: [255, 0, 0], index: 0x3 }, // Red
  { rgb: [0, 0, 255], index: 0x5 }, // Blue
  { rgb: [0, 255, 0], index: 0x6 }, // Green
];

// E-ink Spectra 6 optimized color palette for art reproduction
// MUST MATCH ESP32 client palette exactly (see esp32-client/src/main.cpp:647-654)
export const SPECTRA_6_PALETTE: Spectra6Color[] = [
  { r: 0, g: 0, b: 0, name: 'Black' },
  { r: 255, g: 255, b: 255, name: 'White' },
  { r: 255, g: 255, b: 0, name: 'Yellow' },
  { r: 255, g: 0, b: 0, name: 'Red' },
  { r: 0, g: 0, b: 255, name: 'Blue' },
  { r: 0, g: 255, b: 0, name: 'Green' },
];

/**
 * Convert RGB to LAB color space for better perceptual color matching
 */
export function rgbToLab(r: number, g: number, b: number): LAB {
  // Normalize RGB to 0-1
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;

  // Apply gamma correction
  rNorm =
    rNorm > 0.04045
      ? Math.pow((rNorm + 0.055) / 1.055, 2.4)
      : rNorm / 12.92;
  gNorm =
    gNorm > 0.04045
      ? Math.pow((gNorm + 0.055) / 1.055, 2.4)
      : gNorm / 12.92;
  bNorm =
    bNorm > 0.04045
      ? Math.pow((bNorm + 0.055) / 1.055, 2.4)
      : bNorm / 12.92;

  // Convert to XYZ
  let x = rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375;
  let y = rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.072175;
  let z = rNorm * 0.0193339 + gNorm * 0.119192 + bNorm * 0.9503041;

  // Normalize by D65 illuminant
  x = x / 0.95047;
  y = y / 1.0;
  z = z / 1.08883;

  // Convert to LAB
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  const L = 116 * y - 16;
  const A = 500 * (x - y);
  const B = 200 * (y - z);

  return [L, A, B];
}

/**
 * Delta E 2000 - Industry standard for perceptual color difference
 */
export function deltaE2000(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number
): number {
  const kL = 1.0,
    kC = 1.0,
    kH = 1.0;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;

  const G =
    0.5 *
    (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
  const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((hp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hp - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-Math.pow((hp - 275) / 25, 2));
  const RC =
    2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
  const SL =
    1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  const dE = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );

  return dE;
}

/**
 * Simple RGB distance color matching (fallback)
 */
export function findClosestColor(rgb: RGB): EinkPaletteColor {
  const [r, g, b] = rgb;
  let minDistance = Infinity;
  let closestColor = EINK_PALETTE[1]!;

  for (const color of EINK_PALETTE) {
    const distance = Math.sqrt(
      Math.pow(r - color.rgb[0], 2) +
        Math.pow(g - color.rgb[1], 2) +
        Math.pow(b - color.rgb[2], 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  return closestColor;
}

/**
 * Create pre-computed LAB palette
 */
export function createPaletteLab(): Spectra6ColorWithLab[] {
  return SPECTRA_6_PALETTE.map((color) => ({
    ...color,
    lab: rgbToLab(color.r, color.g, color.b),
  }));
}

/**
 * Find closest Spectra 6 color using Delta E 2000
 */
export function findClosestSpectraColor(
  r: number,
  g: number,
  b: number,
  paletteLab: Spectra6ColorWithLab[],
  colorCache: Map<number, Spectra6ColorWithLab>
): Spectra6ColorWithLab {
  const cacheKey = (r << 16) | (g << 8) | b;
  const cached = colorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [L1, A1, B1] = rgbToLab(r, g, b);
  let minDistance = Infinity;
  // Default to white (index 1 in palette)
  let closestColor: Spectra6ColorWithLab = paletteLab[1] ?? paletteLab[0]!;

  for (const color of paletteLab) {
    const [L2, A2, B2] = color.lab;
    const distance = deltaE2000(L1, A1, B1, L2, A2, B2);

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  colorCache.set(cacheKey, closestColor);
  return closestColor;
}
