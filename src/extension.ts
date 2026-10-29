import * as vscode from 'vscode';
import { BACKUP_EXT, IMAGE_EXT, IMAGE_GLOB, compressImage, formatBytes, runLimited } from './compress';

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('SharkBite');

  context.subscriptions.push(
    output,
    // Explorer passes the right-clicked item plus the full multi-selection.
    vscode.commands.registerCommand('sharkbite.compress', async (clicked?: vscode.Uri, selected?: vscode.Uri[]) => {
      const targets = selected?.length ? selected : clicked ? [clicked] : [];
      if (!targets.length) {
        vscode.window.showWarningMessage('SharkBite: right-click files or folders in the Explorer to compress them.');
        return;
      }
      await compressTargets(targets);
    }),
    vscode.commands.registerCommand('sharkbite.compressWorkspace', async () => {
      const folders = vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [];
      if (!folders.length) {
        vscode.window.showWarningMessage('SharkBite: open a folder first.');
        return;
      }
      await compressTargets(folders);
    }),
  );
}

export function deactivate() {}

async function compressTargets(targets: vscode.Uri[]) {
  const config = vscode.workspace.getConfiguration('sharkbite');
  const quality = config.get<number>('quality', 80);
  const minSize = config.get<number>('minSizeKB', 0) * 1024;
  const backup = config.get<boolean>('backupOriginals', false);
  const concurrency = Math.max(1, config.get<number>('concurrency', 4));
  const exclude = config.get<string>('exclude', '**/{node_modules,.git}/**');

  const files = await collectImages(targets, exclude);
  if (!files.length) {
    vscode.window.showInformationMessage('SharkBite: no PNG, JPEG or WebP images found.');
    return;
  }

  let done = 0, compressed = 0, saved = 0, failed = 0;
  output.appendLine(`--- Compressing ${files.length} image(s) at quality ${quality} ---`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'SharkBite', cancellable: true },
    (progress, token) => runLimited(files, concurrency, async uri => {
      if (token.isCancellationRequested) return;
      const name = vscode.workspace.asRelativePath(uri);
      try {
        const input = await vscode.workspace.fs.readFile(uri);
        if (input.length < minSize) {
          output.appendLine(`skip   ${name} (below min size)`);
        } else {
          const result = await compressImage(input, { quality });
          if (result) {
            if (backup) {
              const backupUri = uri.with({ path: uri.path.replace(IMAGE_EXT, '.orig$&') });
              await vscode.workspace.fs.writeFile(backupUri, input);
            }
            await vscode.workspace.fs.writeFile(uri, result);
            compressed++;
            saved += input.length - result.length;
            const pct = ((1 - result.length / input.length) * 100).toFixed(1);
            output.appendLine(`ok     ${name}  ${formatBytes(input.length)} -> ${formatBytes(result.length)} (-${pct}%)`);
          } else {
            output.appendLine(`skip   ${name} (already optimal)`);
          }
        }
      } catch (err) {
        failed++;
        output.appendLine(`error  ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      done++;
      progress.report({ increment: 100 / files.length, message: `${done}/${files.length} · saved ${formatBytes(saved)}` });
    }),
  );

  const summary = `Compressed ${compressed} of ${files.length} image(s), saved ${formatBytes(saved)}` +
    (failed ? `, ${failed} failed` : '') + '.';
  output.appendLine(summary);
  const choice = await (failed
    ? vscode.window.showWarningMessage(`SharkBite: ${summary}`, 'Show Log')
    : vscode.window.showInformationMessage(`SharkBite: ${summary}`, 'Show Log'));
  if (choice) output.show();
}

async function collectImages(targets: vscode.Uri[], exclude: string): Promise<vscode.Uri[]> {
  const seen = new Map<string, vscode.Uri>();
  for (const uri of targets) {
    const stat = await vscode.workspace.fs.stat(uri);
    const found = stat.type & vscode.FileType.Directory
      ? await vscode.workspace.findFiles(new vscode.RelativePattern(uri, IMAGE_GLOB), exclude)
      : [uri];
    for (const file of found) {
      if (IMAGE_EXT.test(file.path) && !BACKUP_EXT.test(file.path)) {
        seen.set(file.toString(), file);
      }
    }
  }
  return [...seen.values()];
}
