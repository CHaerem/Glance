/**
 * Image Processing Service
 * Handles all image conversion, dithering, and color mapping for e-ink displays
 */

import sharp from 'sharp';
import { loggers } from '../logger';
import { getErrorMessage } from '../../utils/error';
import type { RGB, DitherMethod } from '../../types';
import type { EinkPaletteColor, Spectra6Color, Spectra6ColorWithLab, ConvertImageOptions } from './types';
import {
  EINK_PALETTE,
  SPECTRA_6_PALETTE,
  rgbToLab,
  deltaE2000,
  findClosestColor,
  findClosestSpectraColor,
  createPaletteLab,
} from './palette';
import {
  applyDithering,
  applyFloydSteinbergDithering,
  boostSaturation,
  createAdaptiveColorMapper,
} from './dithering';

const log = loggers.image;

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
   * Convert RGB to LAB color space
   */
  rgbToLab(r: number, g: number, b: number) {
    return rgbToLab(r, g, b);
  }

  /**
   * Delta E 2000 color difference
   */
  deltaE2000(
    L1: number,
    a1: number,
    b1: number,
    L2: number,
    a2: number,
    b2: number
  ): number {
    return deltaE2000(L1, a1, b1, L2, a2, b2);
  }

  /**
   * Initialize pre-computed LAB values for palette colors
   */
  initPaletteLab(): void {
    if (this.paletteLab === null) {
      this.paletteLab = createPaletteLab();
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
    return findClosestSpectraColor(r, g, b, this.paletteLab!, this.colorCache);
  }

  /**
   * Simple fallback color mapping
   */
  findClosestColor(rgb: RGB): EinkPaletteColor {
    return findClosestColor(rgb);
  }

  /**
   * Adaptive color mapping that analyzes the image content
   */
  createAdaptiveColorMapper(
    imageBuffer: Buffer,
    width: number,
    height: number
  ): (rgb: RGB) => EinkPaletteColor {
    return createAdaptiveColorMapper(imageBuffer, width, height);
  }

  /**
   * Floyd-Steinberg dithering for better color conversion
   */
  applyFloydSteinbergDithering(
    imageData: Buffer | Uint8ClampedArray,
    width: number,
    height: number
  ): Uint8ClampedArray {
    return applyFloydSteinbergDithering(imageData, width, height);
  }

  /**
   * Boost saturation to compensate for limited e-ink color palette
   */
  boostSaturation(
    imageData: Buffer | Uint8ClampedArray,
    boostFactor: number = 1.3
  ): Uint8ClampedArray {
    return boostSaturation(imageData, boostFactor);
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
    if (this.paletteLab === null) {
      this.initPaletteLab();
    }

    // Clear color cache before each image
    this.colorCache.clear();

    return applyDithering(
      imageData,
      width,
      height,
      algorithm,
      saturationBoost,
      this.paletteLab!,
      this.colorCache
    );
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

// Export the class and types for testing
export { ImageProcessingService };
export { SPECTRA_6_PALETTE } from './palette';
export type { Spectra6Color, Spectra6ColorWithLab, ConvertImageOptions } from './types';
