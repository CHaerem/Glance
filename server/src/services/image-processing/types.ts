/**
 * Image Processing Types
 * Type definitions for e-ink image processing
 */

import type { RGB, LAB, DitherMethod } from '../../types';

/** E-ink palette color with simple index */
export interface EinkPaletteColor {
  rgb: RGB;
  index: number;
}

/** Spectra 6 palette color with name */
export interface Spectra6Color {
  r: number;
  g: number;
  b: number;
  name: string;
}

/** Spectra 6 color with pre-computed LAB values */
export interface Spectra6ColorWithLab extends Spectra6Color {
  lab: LAB;
}

/** Color statistics for adaptive mapping */
export interface ColorStats {
  brightness: { min: number; max: number; avg: number };
  saturation: { min: number; max: number; avg: number };
  dominantHues: { red: number; green: number; blue: number; yellow: number };
}

/** Image conversion options */
export interface ConvertImageOptions {
  ditherAlgorithm?: DitherMethod;
  enhanceContrast?: boolean;
  sharpen?: boolean;
  autoCropWhitespace?: boolean;
  cropX?: number;
  cropY?: number;
  zoomLevel?: number;
}
