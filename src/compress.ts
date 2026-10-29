import sharp from 'sharp';
import { optimize } from 'svgo';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'avif', 'gif', 'tif', 'tiff', 'svg'];

// findFiles globs are case-sensitive on Linux, so list both cases.
export const IMAGE_GLOB = `**/*.{${IMAGE_EXTENSIONS.flatMap(e => [e, e.toUpperCase()]).join(',')}}`;

// Backups written by this extension (photo.png -> photo.bac.png); never offer them for compression.
export const BACKUP_FILE = /\.bac\.[^./\\]+$/i;

export function backupPath(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return filePath.slice(0, dot) + '.bac' + filePath.slice(dot);
}

export interface CompressOptions {
  quality: number;
}

/**
 * Re-encodes an image in its own format. Returns the new bytes, or undefined
 * if the format isn't supported or the result isn't smaller than the input.
 */
export async function compressImage(input: Uint8Array, fileName: string, opts: CompressOptions): Promise<Buffer | undefined> {
  const out = /\.svg$/i.test(fileName) ? compressSvg(input) : await compressRaster(input, opts);
  return out && out.length < input.length ? out : undefined;
}

function compressSvg(input: Uint8Array): Buffer {
  const { data } = optimize(Buffer.from(input).toString('utf8'), { multipass: true });
  return Buffer.from(data, 'utf8');
}

async function compressRaster(input: Uint8Array, opts: CompressOptions): Promise<Buffer | undefined> {
  const { quality } = opts;
  let img = sharp(input, { animated: true });
  const meta = await img.metadata();

  // Metadata is stripped on output, so bake EXIF orientation into the pixels first.
  if ((meta.orientation ?? 1) > 1 && (meta.pages ?? 1) === 1) {
    img = img.rotate();
  }

  switch (meta.format) {
    case 'jpeg':
      return img.jpeg({ quality, mozjpeg: true }).toBuffer();
    case 'png':
      return img.png({ quality, compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
    case 'webp':
      return img.webp({ quality, effort: 6 }).toBuffer();
    case 'gif':
      // Higher quality → smaller allowed error when reusing palettes between frames.
      return img.gif({ effort: 10, reuse: true, interFrameMaxError: Math.round((100 - quality) / 4) }).toBuffer();
    case 'tiff':
      return img.tiff({ compression: 'deflate', predictor: 'horizontal' }).toBuffer();
    case 'heif':
      // sharp's bundled libheif only handles AV1, i.e. AVIF.
      return meta.compression === 'av1' ? img.avif({ quality, effort: 6 }).toBuffer() : undefined;
    default:
      return undefined;
  }
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
export async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(lanes);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
