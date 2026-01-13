/**
 * Image Processing Type Definitions
 * E-ink display color conversion and dithering
 */

// RGB color tuple
export type RGB = [number, number, number];

// LAB color space tuple (for Delta E 2000 calculations)
export type LAB = [number, number, number];

// E-ink palette color definition
export interface PaletteColor {
  rgb: RGB;
  index: number;
  name: string;
}

// Spectra 6 color palette (6-color e-ink display)
export const SPECTRA_6_PALETTE: readonly PaletteColor[] = [
  { rgb: [0, 0, 0], index: 0x00, name: 'black' },
  { rgb: [255, 255, 255], index: 0x01, name: 'white' },
  { rgb: [0, 255, 0], index: 0x02, name: 'green' },
  { rgb: [0, 0, 255], index: 0x03, name: 'blue' },
  { rgb: [255, 0, 0], index: 0x04, name: 'red' },
  { rgb: [255, 255, 0], index: 0x05, name: 'yellow' },
] as const;

// Dithering method options
export type DitherMethod = 'floyd-steinberg' | 'atkinson' | 'none';

// Dithering options
export interface DitherOptions {
  width: number;
  height: number;
  palette?: readonly PaletteColor[];
  method?: DitherMethod;
  saturationBoost?: number;
}

// Image processing result
export interface ImageProcessingResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'raw' | 'png' | 'jpeg';
  colorDepth?: number;
}

// Image metadata from sharp
export interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
  depth?: string;
  density?: number;
  hasAlpha?: boolean;
  orientation?: number;
}

// Display dimensions
export interface DisplayDimensions {
  width: number;
  height: number;
}

// E-ink display constants
export const EINK_DISPLAY: DisplayDimensions = {
  width: 1200,
  height: 1600,
} as const;

// Image orientation
export type Orientation = 'portrait' | 'landscape';
