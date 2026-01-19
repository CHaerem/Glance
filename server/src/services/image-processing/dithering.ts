/**
 * Dithering Algorithms
 * Floyd-Steinberg, Atkinson, and other dithering implementations for e-ink displays
 */

import type { RGB, DitherMethod } from '../../types';
import type { EinkPaletteColor, Spectra6ColorWithLab, ColorStats } from './types';
import { EINK_PALETTE, findClosestColor, findClosestSpectraColor } from './palette';
import { loggers } from '../logger';

const log = loggers.image;

/**
 * Boost saturation to compensate for limited e-ink color palette
 */
export function boostSaturation(
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
 * Floyd-Steinberg dithering (basic version using RGB distance)
 */
export function applyFloydSteinbergDithering(
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

      const newColor = findClosestColor([oldR, oldG, oldB]);
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
 * Art-optimized dithering using Delta E 2000 color matching
 */
export function applyDithering(
  imageData: Buffer | Uint8ClampedArray,
  width: number,
  height: number,
  algorithm: DitherMethod = 'floyd-steinberg',
  saturationBoost: number = 1.3,
  paletteLab: Spectra6ColorWithLab[],
  colorCache: Map<number, Spectra6ColorWithLab>
): Buffer {
  log.debug('Applying dithering', { algorithm });

  // Clear color cache before each image
  colorCache.clear();

  let ditheredData =
    saturationBoost > 1.0
      ? boostSaturation(imageData, saturationBoost)
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

      const newColor = findClosestSpectraColor(oldR, oldG, oldB, paletteLab, colorCache);
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
  const uniqueColors = colorCache.size;
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
 * Adaptive color mapping that analyzes the image content
 */
export function createAdaptiveColorMapper(
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
