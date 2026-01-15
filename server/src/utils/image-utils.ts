/**
 * Image Processing Utilities
 * Common thumbnail and image optimization functions used across routes
 */

import sharp from 'sharp';

/** Options for thumbnail creation */
export interface ThumbnailOptions {
  width?: number;
  height?: number;
  fit?: keyof sharp.FitEnum;
  format?: 'png' | 'jpeg';
}

/** Options for image optimization */
export interface OptimizeOptions {
  maxWidth?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Create a thumbnail from an image buffer or file path
 *
 * @param source - Image buffer or file path
 * @param options - Thumbnail options
 * @returns PNG buffer of the thumbnail
 */
export async function createThumbnail(
  source: Buffer | string,
  options: ThumbnailOptions = {}
): Promise<Buffer> {
  const { width = 300, height = 400, fit = 'inside', format = 'png' } = options;

  let pipeline = sharp(source).rotate(); // Auto-rotate based on EXIF

  pipeline = pipeline.resize(width, height, { fit });

  if (format === 'jpeg') {
    return pipeline.jpeg({ quality: 85 }).toBuffer();
  }
  return pipeline.png().toBuffer();
}

/**
 * Optimize an image for storage (reduce file size while maintaining quality)
 *
 * @param source - Image buffer or file path
 * @param options - Optimization options
 * @returns Optimized image buffer
 */
export async function optimizeForStorage(
  source: Buffer | string,
  options: OptimizeOptions = {}
): Promise<Buffer> {
  const { maxWidth = 800, quality = 85, format = 'jpeg' } = options;

  const pipeline = sharp(source).resize(maxWidth, undefined, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  switch (format) {
    case 'png':
      return pipeline.png().toBuffer();
    case 'webp':
      return pipeline.webp({ quality }).toBuffer();
    case 'jpeg':
    default:
      return pipeline.jpeg({ quality }).toBuffer();
  }
}

/**
 * Create a thumbnail from raw RGB buffer (for dithered e-ink images)
 *
 * @param rgbBuffer - Raw RGB buffer (3 bytes per pixel)
 * @param width - Image width
 * @param height - Image height
 * @param thumbnailWidth - Thumbnail width (default 300)
 * @param thumbnailHeight - Thumbnail height (default 400)
 * @returns PNG buffer of the thumbnail
 */
export async function createThumbnailFromRgb(
  rgbBuffer: Buffer,
  width: number,
  height: number,
  thumbnailWidth: number = 300,
  thumbnailHeight: number = 400
): Promise<Buffer> {
  return sharp(rgbBuffer, {
    raw: { width, height, channels: 3 },
  })
    .resize(thumbnailWidth, thumbnailHeight, { fit: 'fill' })
    .png()
    .toBuffer();
}

/**
 * Get image metadata (dimensions, format, etc.)
 *
 * @param source - Image buffer or file path
 * @returns Sharp metadata object
 */
export async function getImageMetadata(
  source: Buffer | string
): Promise<sharp.Metadata> {
  return sharp(source).metadata();
}
