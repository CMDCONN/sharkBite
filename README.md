# SharkBite Image Compressor

Compress lots of images in one go from the command palette.

## Usage

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **SharkBite: Compress Images**.
2. Every image in the workspace is listed with its folder and size. Type to filter, press `Space` to
   select images (or tick the box at the top to select all).
3. Press `Enter`, then choose how hard to compress:
   - **Default**: a good balance of size and quality.
   - **Light**: barely noticeable changes and smaller savings. PNGs are recompressed losslessly.
   - **Heavy**: the smallest files, but quality loss may be visible. PNG and GIF are cut to 64 colours.
4. The selected images are compressed in place, and a summary shows how much was saved.
   Per-file results are in the **SharkBite** output channel.

### Sidebar

Click the **SharkBite** icon in the activity bar for the same thing as a panel. It lists every image with a
checkbox and shows how many are ticked. The buttons at the top compress the ticked images, select all, clear
the selection, and refresh the list. Hover over an image to compress just that one, or click it to open it.
The list updates when images are added, deleted or compressed, and your ticks are kept.

An image is only overwritten if the compressed version is smaller. Before overwriting, the original is
saved next to it as `name.bac.ext` (e.g. `photo.png` → `photo.bac.png`). If a backup already exists it is
left alone, so compressing an image twice never replaces the true original. Backups are hidden from the list.

## Supported formats

| Format | How it's compressed |
| --- | --- |
| JPEG (`.jpg`, `.jpeg`, `.jfif`) | mozjpeg re-encode at the configured quality |
| PNG | palette quantisation + max zlib compression |
| WebP | lossy re-encode at the configured quality |
| AVIF | re-encode at the configured quality |
| GIF (incl. animated) | palette reuse + max effort |
| TIFF (`.tif`, `.tiff`) | lossless deflate |
| SVG | minified with SVGO |

Metadata (EXIF etc.) is stripped; EXIF rotation is applied to the pixels first so photos stay upright.

## Settings

- `sharkbite.quality` (default `80`): quality for lossy formats at the Default level, 1–100. Light uses this +12, Heavy uses this −25.
- `sharkbite.backupOriginals` (default `true`) — keep a copy as `name.bac.ext` before overwriting.
- `sharkbite.exclude` — glob of paths to leave out of the list (default skips `node_modules`, `.git`, `out`, `dist`).

## Development

```sh
npm install
npm run compile
```

`.npmrc` sets `cpu=wasm32` so npm installs sharp's WebAssembly build instead of the native one. The native
build segfaults inside VS Code's Electron runtime (libvips clashes with Electron), taking the extension host
down with it. The WebAssembly build is a bit slower but stable, and makes the `.vsix` work on every platform.

Press `F5` in VS Code to launch an Extension Development Host. `npm run package` builds a `.vsix`.
