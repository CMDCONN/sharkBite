# SharkBite

Bulk-compress PNG, JPEG and WebP images in VS Code. Right-click files or folders in the Explorer and choose **Compress Images**, or run **SharkBite: Compress All Images in Workspace** from the Command Palette.

Settings live under `sharkbite.*` (quality, min size, backups, concurrency, exclude glob).

## Development

```sh
npm install
npm run compile
```

Press F5 to launch an Extension Development Host.

`sharp` ships native binaries, so build one `.vsix` per platform, e.g. `npx vsce package --target linux-x64`.
