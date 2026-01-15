/**
 * Image Processing Service
 * Handles all image conversion, dithering, and color mapping for e-ink displays
 */

import sharp from 'sharp';
import { loggers } from './logger';
import { getErrorMessage } from '../utils/error';
import type { RGB, LAB, DitherMethod } from '../types';

const log = loggers.image;

/** E-ink palette color with simple index */
interface EinkPaletteColor {
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
interface ColorStats {
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

// E-ink color palette for Waveshare 13.3" Spectra 6 (hardware colors - do not change RGB values)
const EINK_PALETTE: EinkPaletteColor[] = [
  { rgb: [0, 0, 0], index: 0x0 }, // Black
  { rgb: [255, 255, 255], index: 0x1 }, // White
  { rgb: [255, 255, 0], index: 0x2 }, // Yellow
  { rgb: [255, 0, 0], index: 0x3 }, // Red
  { rgb: [0, 0, 255], index: 0x5 }, // Blue
  { rgb: [0, 255, 0], index: 0x6 }, // Green
];

// E-ink Spectra 6 optimized color palette for art reproduction
// MUST MATCH ESP32 client palette exactly (see esp32-client/src/main.cpp:647-654)
// Exported for use in routes/images.ts
export const SPECTRA_6_PALETTE: Spectra6Color[] = [
  { r: 0, g: 0, b: 0, name: 'Black' },
  { r: 255, g: 255, b: 255, name: 'White' },
  { r: 255, g: 255, b: 0, name: 'Yellow' },
  { r: 255, g: 0, b: 0, name: 'Red' },
  { r: 0, g: 0, b: 255, name: 'Blue' },
  { r: 0, g: 255, b: 0, name: 'Green' },
];

class ImageProcessingService {
  // Color lookup cache to avoid recalculating Delta E 2000 for repeated colors
  private colorCache: Map<number, Spectra6ColorWithLab>;
  // Pre-computed LAB values for palette colors
  private paletteLab: Spectra6ColorWithLab[] | null;

  constructor() {
    this.colorCache = new Map();
    this.paletteLab = null;
  }

  /**
   * Convert RGB to LAB color space for better perceptual color matching
   */
  rgbToLab(r: number, g: number, b: number): LAB {
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
  deltaE2000(
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
   * Initialize pre-computed LAB values for palette colors
   */
  initPaletteLab(): void {
    if (this.paletteLab === null) {
      this.paletteLab = SPECTRA_6_PALETTE.map((color) => ({
        ...color,
        lab: this.rgbToLab(color.r, color.g, color.b),
      }));
      log.debug('Pre-computed LAB values for Spectra 6 palette');
    }
  }

  /**
   * Find closest color using Delta E 2000 (CIEDE2000)
   */
  findClosestSpectraColor(
    r: number,
    g: number,
    b: number
  ): Spectra6ColorWithLab {
    if (this.paletteLab === null) {
      this.initPaletteLab();
    }

    const cacheKey = (r << 16) | (g << 8) | b;
    const cached = this.colorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [L1, A1, B1] = this.rgbToLab(r, g, b);
    let minDistance = Infinity;
    // Default to white (index 1 in palette)
    const palette = this.paletteLab!;
    let closestColor: Spectra6ColorWithLab = palette[1] ?? palette[0]!;

    for (const color of palette) {
      const [L2, A2, B2] = color.lab;
      const distance = this.deltaE2000(L1, A1, B1, L2, A2, B2);

      if (distance < minDistance) {
        minDistance = distance;
        closestColor = color;
      }
    }

    this.colorCache.set(cacheKey, closestColor);
    return closestColor;
  }

  /**
   * Simple fallback color mapping
   */
  findClosestColor(rgb: RGB): EinkPaletteColor {
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
   * Adaptive color mapping that analyzes the image content
   */
  createAdaptiveColorMapper(
    imageBuffer: Buffer,
    _width: number,
    _height: number
  ): (rgb: RGB) => EinkPaletteColor {
    log.debug('Analyzing image colors for adaptive mapping');

    const colorStats: ColorStats = {
      brightness: { min: 255, max: 0, avg: 0 },
      saturation: { min: 255, max: 0, avg: 0 },
      dominantHues: { red: 0, green: 0, blue: 0, yellow: 0 },
    };

    let totalBrightness = 0;
    let totalSaturation = 0;
    let pixelCount = 0;

    for (let i = 0; i < imageBuffer.length; i += 30) {
      const r = imageBuffer[i]!;
      const g = imageBuffer[i + 1]!;
      const b = imageBuffer[i + 2]!;

      const brightness = (r + g + b) / 3;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : ((max - min) / max) * 255;

      colorStats.brightness.min = Math.min(
        colorStats.brightness.min,
        brightness
      );
      colorStats.brightness.max = Math.max(
        colorStats.brightness.max,
        brightness
      );
      totalBrightness += brightness;
      totalSaturation += saturation;
      pixelCount++;

      if (saturation > 50) {
        if (r > g && r > b) colorStats.dominantHues.red++;
        else if (g > r && g > b) colorStats.dominantHues.green++;
        else if (b > r && b > g) colorStats.dominantHues.blue++;
        else if (r > 100 && g > 100 && b < 80) colorStats.dominantHues.yellow++;
      }
    }

    colorStats.brightness.avg = totalBrightness / pixelCount;
    colorStats.saturation.avg = totalSaturation / pixelCount;

    log.debug('Image analysis complete', {
      brightnessRange: [colorStats.brightness.min, colorStats.brightness.max],
      avgBrightness: colorStats.brightness.avg,
      avgSaturation: colorStats.saturation.avg,
      dominantColors: colorStats.dominantHues,
    });

    return function (rgb: RGB): EinkPaletteColor {
      const [r, g, b] = rgb;
      let minDistance = Infinity;
      let closestColor = EINK_PALETTE[1]!;

      for (const color of EINK_PALETTE) {
        const deltaR = r - color.rgb[0];
        const deltaG = g - color.rgb[1];
        const deltaB = b - color.rgb[2];

        const distance = Math.sqrt(
          2 * deltaR * deltaR + 4 * deltaG * deltaG + 3 * deltaB * deltaB
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestColor = color;
        }
      }

      return closestColor;
    };
  }

  /**
   * Floyd-Steinberg dithering for better color conversion
   */
  applyFloydSteinbergDithering(
    imageData: Buffer | Uint8ClampedArray,
    width: number,
    height: number
  ): Uint8ClampedArray {
    const ditheredData = new Uint8ClampedArray(imageData);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const oldR = ditheredData[idx]!;
        const oldG = ditheredData[idx + 1]!;
        const oldB = ditheredData[idx + 2]!;

        const newColor = this.findClosestColor([oldR, oldG, oldB]);
        const newR = newColor.rgb[0];
        const newG = newColor.rgb[1];
        const newB = newColor.rgb[2];

        ditheredData[idx] = newR;
        ditheredData[idx + 1] = newG;
        ditheredData[idx + 2] = newB;

        const errR = oldR - newR;
        const errG = oldG - newG;
        const errB = oldB - newB;

        const distributeError = (dx: number, dy: number, factor: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 3;
            ditheredData[nIdx] = Math.max(
              0,
              Math.min(255, ditheredData[nIdx]! + errR * factor)
            );
            ditheredData[nIdx + 1] = Math.max(
              0,
              Math.min(255, ditheredData[nIdx + 1]! + errG * factor)
            );
            ditheredData[nIdx + 2] = Math.max(
              0,
              Math.min(255, ditheredData[nIdx + 2]! + errB * factor)
            );
          }
        };

        distributeError(1, 0, 7 / 16);
        distributeError(-1, 1, 3 / 16);
        distributeError(0, 1, 5 / 16);
        distributeError(1, 1, 1 / 16);
      }
    }

    return ditheredData;
  }

  /**
   * Boost saturation to compensate for limited e-ink color palette
   */
  boostSaturation(
    imageData: Buffer | Uint8ClampedArray,
    boostFactor: number = 1.3
  ): Uint8ClampedArray {
    log.debug('Boosting saturation', { boostFactor });
    const boostedData = new Uint8ClampedArray(imageData);

    for (let i = 0; i < boostedData.length; i += 3) {
      const r = boostedData[i]! / 255;
      const g = boostedData[i + 1]! / 255;
      const b = boostedData[i + 2]! / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        let h: number;
        if (max === r) {
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
          h = ((b - r) / d + 2) / 6;
        } else {
          h = ((r - g) / d + 4) / 6;
        }

        s = Math.min(1, s * boostFactor);

        const hue2rgb = (p: number, q: number, t: number): number => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };

        let newR: number, newG: number, newB: number;
        if (s === 0) {
          newR = newG = newB = l;
        } else {
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          newR = hue2rgb(p, q, h + 1 / 3);
          newG = hue2rgb(p, q, h);
          newB = hue2rgb(p, q, h - 1 / 3);
        }

        boostedData[i] = Math.round(newR * 255);
        boostedData[i + 1] = Math.round(newG * 255);
        boostedData[i + 2] = Math.round(newB * 255);
      }
    }

    return boostedData;
  }

  /**
   * Art-optimized dithering algorithms for E Ink Spectra 6
   */
  applyDithering(
    imageData: Buffer | Uint8ClampedArray,
    width: number,
    height: number,
    algorithm: DitherMethod = 'floyd-steinberg',
    saturationBoost: number = 1.3
  ): Buffer {
    log.debug('Applying dithering', { algorithm });

    // Clear color cache before each image
    this.colorCache.clear();

    let ditheredData =
      saturationBoost > 1.0
        ? this.boostSaturation(imageData, saturationBoost)
        : new Uint8ClampedArray(imageData);

    const distributeError = (
      x: number,
      y: number,
      errR: number,
      errG: number,
      errB: number,
      dx: number,
      dy: number,
      factor: number
    ) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = (ny * width + nx) * 3;
        ditheredData[nIdx] = Math.max(
          0,
          Math.min(255, ditheredData[nIdx]! + errR * factor)
        );
        ditheredData[nIdx + 1] = Math.max(
          0,
          Math.min(255, ditheredData[nIdx + 1]! + errG * factor)
        );
        ditheredData[nIdx + 2] = Math.max(
          0,
          Math.min(255, ditheredData[nIdx + 2]! + errB * factor)
        );
      }
    };

    // Serpentine scanning
    for (let y = 0; y < height; y++) {
      const isRightToLeft = y % 2 === 1;
      const xStart = isRightToLeft ? width - 1 : 0;
      const xEnd = isRightToLeft ? -1 : width;
      const xStep = isRightToLeft ? -1 : 1;

      for (let x = xStart; x !== xEnd; x += xStep) {
        const idx = (y * width + x) * 3;
        const oldR = ditheredData[idx]!;
        const oldG = ditheredData[idx + 1]!;
        const oldB = ditheredData[idx + 2]!;

        const newColor = this.findClosestSpectraColor(oldR, oldG, oldB);
        const newR = newColor.r;
        const newG = newColor.g;
        const newB = newColor.b;

        ditheredData[idx] = newR;
        ditheredData[idx + 1] = newG;
        ditheredData[idx + 2] = newB;

        const errR = oldR - newR;
        const errG = oldG - newG;
        const errB = oldB - newB;

        const dir = xStep;
        if (algorithm === 'floyd-steinberg') {
          distributeError(x, y, errR, errG, errB, dir, 0, 7 / 16);
          distributeError(x, y, errR, errG, errB, -dir, 1, 3 / 16);
          distributeError(x, y, errR, errG, errB, 0, 1, 5 / 16);
          distributeError(x, y, errR, errG, errB, dir, 1, 1 / 16);
        } else if (algorithm === 'atkinson') {
          distributeError(x, y, errR, errG, errB, 1, 0, 1 / 8);
          distributeError(x, y, errR, errG, errB, 2, 0, 1 / 8);
          distributeError(x, y, errR, errG, errB, -1, 1, 1 / 8);
          distributeError(x, y, errR, errG, errB, 0, 1, 1 / 8);
          distributeError(x, y, errR, errG, errB, 1, 1, 1 / 8);
          distributeError(x, y, errR, errG, errB, 0, 2, 1 / 8);
        }
      }
    }

    const totalPixels = width * height;
    const uniqueColors = this.colorCache.size;
    const cacheHitRate = (((totalPixels - uniqueColors) / totalPixels) * 100).toFixed(1);
    log.debug('Dithering completed', {
      algorithm,
      uniqueColors,
      totalPixels,
      cacheHitRate: `${cacheHitRate}%`,
    });

    return Buffer.from(ditheredData);
  }

  /**
   * Convert image to RGB for e-ink display
   */
  async convertImageToRGB(
    imagePath: string | Buffer,
    rotation: number = 0,
    targetWidth: number = 1200,
    targetHeight: number = 1600,
    options: ConvertImageOptions = {}
  ): Promise<Buffer> {
    try {
      log.debug('Processing image for art gallery display', {
        imagePath: typeof imagePath === 'string' ? imagePath : 'Buffer',
        rotation,
      });

      const {
        ditherAlgorithm = 'floyd-steinberg',
        enhanceContrast = true,
        sharpen = false,
        autoCropWhitespace = true,
        cropX = 50,
        cropY = 50,
        zoomLevel = 1.0,
      } = options;

      let sharpPipeline = sharp(imagePath);

      // Auto-rotate based on EXIF orientation
      sharpPipeline = sharpPipeline.rotate();

      if (rotation !== 0) {
        sharpPipeline = sharpPipeline.rotate(rotation);
      }

      if (autoCropWhitespace) {
        try {
          sharpPipeline = sharpPipeline.trim({ threshold: 25 });
          log.debug('Auto-cropped whitespace margins from AI image');
        } catch {
          log.debug('No significant whitespace to crop');
        }
      }

      // Get image dimensions for crop calculations
      const metadataPipeline = sharp(imagePath).rotate();
      if (rotation !== 0) {
        metadataPipeline.rotate(rotation);
      }
      const metadata = await metadataPipeline.metadata();
      const imgWidth = metadata.width ?? 1200;
      const imgHeight = metadata.height ?? 1600;

      if (zoomLevel !== 1.0 || cropX !== 50 || cropY !== 50) {
        const visibleWidth = Math.round(imgWidth / zoomLevel);
        const visibleHeight = Math.round(imgHeight / zoomLevel);

        const maxOffsetX = imgWidth - visibleWidth;
        const maxOffsetY = imgHeight - visibleHeight;
        const extractX = Math.round((cropX / 100) * maxOffsetX);
        const extractY = Math.round((cropY / 100) * maxOffsetY);

        sharpPipeline = sharpPipeline.extract({
          left: Math.max(0, extractX),
          top: Math.max(0, extractY),
          width: Math.min(visibleWidth, imgWidth - extractX),
          height: Math.min(visibleHeight, imgHeight - extractY),
        });

        log.debug('Applied crop/zoom', {
          zoomLevel,
          cropX,
          cropY,
          extractWidth: visibleWidth,
          extractHeight: visibleHeight,
          extractX,
          extractY,
        });
      }

      sharpPipeline = sharpPipeline
        .resize(targetWidth, targetHeight, {
          fit: 'cover',
          position: 'center',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .toColourspace('srgb');

      if (enhanceContrast) {
        sharpPipeline = sharpPipeline.linear(1.25, -(128 * 0.25));
      }

      if (sharpen) {
        sharpPipeline = sharpPipeline.sharpen();
      }

      const { data: imageBuffer, info } = await sharpPipeline
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (info.channels !== 3) {
        throw new Error(`Expected 3 channels (RGB), got ${info.channels}`);
      }
      log.debug('Art preprocessing complete', {
        width: info.width,
        height: info.height,
        pixels: imageBuffer.length / 3,
      });

      if (info.width !== targetWidth || info.height !== targetHeight) {
        throw new Error(
          `Unexpected dimensions: got ${info.width}x${info.height}, expected ${targetWidth}x${targetHeight}`
        );
      }

      const ditheredBuffer = this.applyDithering(
        imageBuffer,
        targetWidth,
        targetHeight,
        ditherAlgorithm
      );

      log.info('Art gallery image ready', {
        width: targetWidth,
        height: targetHeight,
        algorithm: ditherAlgorithm,
        rotation,
      });
      return ditheredBuffer;
    } catch (error) {
      log.error('Error processing image for art gallery', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Create a text image for display
   */
  async createTextImage(
    text: string,
    targetWidth: number = 1200,
    targetHeight: number = 1600
  ): Promise<Buffer> {
    try {
      const svg = `
        <svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="white"/>
          <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="60" text-anchor="middle"
            dominant-baseline="middle" fill="black">${text}</text>
        </svg>
      `;

      const { data: imageBuffer, info } = await sharp(Buffer.from(svg))
        .resize(targetWidth, targetHeight)
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (info.channels !== 3) {
        throw new Error(
          `Text image generated ${info.channels} channels, expected 3`
        );
      }

      log.debug('Created text image', { pixels: imageBuffer.length / 3 });
      return imageBuffer;
    } catch (error) {
      log.error('Error creating text image', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get the e-ink palette
   */
  getEinkPalette(): EinkPaletteColor[] {
    return EINK_PALETTE;
  }

  /**
   * Get the Spectra 6 palette
   */
  getSpectra6Palette(): Spectra6Color[] {
    return SPECTRA_6_PALETTE;
  }
}

// Export singleton instance
const imageProcessingService = new ImageProcessingService();
export default imageProcessingService;

// Also export the class for testing
export { ImageProcessingService };
