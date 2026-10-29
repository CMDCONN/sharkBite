import * as vscode from 'vscode';
import * as path from 'path';
import { BACKUP_FILE, CompressionLevel, IMAGE_GLOB, backupPath, compressImage, formatBytes, optionsForLevel, runLimited } from './compress';

interface ImageItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  size: number;
}

// sharp runs as WebAssembly (see .npmrc), which shares one memory heap, so keep this modest.
const CONCURRENCY = 4;

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('SharkBite');
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('sharkbite.compressImages', compressImagesCommand),
  );
}

export function deactivate() {}

async function compressImagesCommand() {
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showWarningMessage('SharkBite: open a folder first.');
    return;
  }

  const items = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'SharkBite: finding images' },
    findImages,
  );
  if (items.length === 0) {
    vscode.window.showInformationMessage('SharkBite: no images found in this workspace.');
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    matchOnDescription: true,
    placeHolder: `Select images to compress (${items.length} found) — Space to toggle, Enter to compress`,
  });
  if (!picked?.length) {
    return;
  }

  const level = await vscode.window.showQuickPick(LEVEL_ITEMS, {
    placeHolder: `How hard should ${picked.length} image${picked.length === 1 ? '' : 's'} be compressed?`,
  });
  if (!level) {
    return;
  }

  await compressAll(picked, level.level);
}

const LEVEL_ITEMS: (vscode.QuickPickItem & { level: CompressionLevel })[] = [
  { level: 'default', label: 'Default', description: 'Good balance of size and quality' },
  { level: 'light', label: 'Light', description: 'Barely noticeable changes, smaller savings (PNGs stay lossless)' },
  { level: 'heavy', label: 'Heavy', description: 'Smallest files, visible quality loss is possible' },
];

async function findImages(): Promise<ImageItem[]> {
  const exclude = vscode.workspace.getConfiguration('sharkbite').get<string>('exclude') || null;
  const uris = (await vscode.workspace.findFiles(IMAGE_GLOB, exclude)).filter(u => !BACKUP_FILE.test(u.path));
  const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;

  const items = await Promise.all(uris.map(async (uri): Promise<ImageItem> => {
    const { size } = await vscode.workspace.fs.stat(uri);
    const dir = path.posix.dirname(vscode.workspace.asRelativePath(uri, multiRoot));
    return {
      uri,
      size,
      label: path.posix.basename(uri.path),
      description: `${dir === '.' ? '' : dir + ' · '}${formatBytes(size)}`,
    };
  }));
  return items.sort((a, b) => a.uri.path.localeCompare(b.uri.path));
}

async function compressAll(items: ImageItem[], level: CompressionLevel) {
  const config = vscode.workspace.getConfiguration('sharkbite');
  const options = optionsForLevel(level, config.get<number>('quality', 80));
  const backup = config.get<boolean>('backupOriginals', true);

  let done = 0, compressed = 0, saved = 0;
  const failed: string[] = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'SharkBite', cancellable: true },
    (progress, token) => runLimited(items, CONCURRENCY, async item => {
      if (token.isCancellationRequested) return;
      const name = vscode.workspace.asRelativePath(item.uri);
      try {
        const input = await vscode.workspace.fs.readFile(item.uri);
        const out = await compressImage(input, item.uri.path, options);
        if (out) {
          // Keep an existing backup: it holds the true original if this image was compressed before.
          const backupUri = item.uri.with({ path: backupPath(item.uri.path) });
          if (backup && !(await exists(backupUri))) {
            await vscode.workspace.fs.writeFile(backupUri, input);
          }
          await vscode.workspace.fs.writeFile(item.uri, out);
          compressed++;
          saved += input.length - out.length;
          output.appendLine(`${name}: ${formatBytes(input.length)} → ${formatBytes(out.length)}`);
        } else {
          output.appendLine(`${name}: already optimal, left unchanged`);
        }
      } catch (err) {
        failed.push(name);
        output.appendLine(`${name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      }
      done++;
      progress.report({ increment: 100 / items.length, message: `${done}/${items.length} — ${name}` });
    }),
  );

  let summary = `SharkBite (${level}): compressed ${compressed} of ${items.length} images, saved ${formatBytes(saved)}.`;
  if (done < items.length) summary += ` Cancelled after ${done}.`;
  if (failed.length) {
    const choice = await vscode.window.showWarningMessage(`${summary} ${failed.length} failed.`, 'Show Log');
    if (choice) output.show();
  } else {
    vscode.window.showInformationMessage(summary);
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
