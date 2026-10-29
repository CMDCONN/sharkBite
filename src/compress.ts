import sharp from 'sharp';

export const IMAGE_GLOB = '**/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}';
export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
// Backups written by this extension; never compress them again.
export const BACKUP_EXT = /\.orig\.(png|jpe?g|webp)$/i;

export interface CompressOptions {
  quality: number;
}

/**
 * Re-encodes an image in its own format. Returns the new bytes, or undefined
 * if the format isn't supported or the result isn't smaller than the input.
 */
export async function compressImage(input: Uint8Array, opts: CompressOptions): Promise<Buffer | undefined> {
  // rotate() bakes EXIF orientation into the pixels, since metadata is stripped on output.
  const img = sharp(input, { animated: true }).rotate();
  const { format } = await img.metadata();

  let out: Buffer;
  switch (format) {
    case 'jpeg':
      out = await img.jpeg({ quality: opts.quality, mozjpeg: true }).toBuffer();
      break;
    case 'png':
      out = await img.png({ quality: opts.quality, compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
      break;
    case 'webp':
      out = await img.webp({ quality: opts.quality, effort: 6 }).toBuffer();
      break;
    default:
      return undefined;
  }

  return out.length < input.length ? out : undefined;
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
