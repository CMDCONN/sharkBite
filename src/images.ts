import * as vscode from 'vscode';
import * as path from 'path';
import { BACKUP_FILE, IMAGE_GLOB, formatBytes } from './compress';

export interface ImageItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  size: number;
}

/** Every compressible image in the workspace (minus excludes and backups), sorted by path. */
export async function findImages(): Promise<ImageItem[]> {
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
