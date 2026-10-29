import * as vscode from 'vscode';
import { IMAGE_GLOB } from './compress';
import { ImageItem, findImages } from './images';

/** Sidebar list of workspace images with checkboxes; ticks survive refreshes. */
export class ImagesView implements vscode.TreeDataProvider<ImageItem>, vscode.Disposable {
  private images: ImageItem[] | undefined;
  private readonly checked = new Set<string>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private readonly view: vscode.TreeView<ImageItem>;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.view = vscode.window.createTreeView('sharkbite.images', { treeDataProvider: this });

    // Picks up new/deleted images and the size changes from compressing.
    const watcher = vscode.workspace.createFileSystemWatcher(IMAGE_GLOB);
    const soon = () => this.scheduleRefresh();

    this.disposables.push(
      this.view,
      this.changed,
      watcher,
      watcher.onDidCreate(soon),
      watcher.onDidDelete(soon),
      watcher.onDidChange(soon),
      vscode.workspace.onDidChangeWorkspaceFolders(soon),
      vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration('sharkbite.exclude') && soon()),
      this.view.onDidChangeCheckboxState(e => {
        for (const [item, state] of e.items) {
          if (state === vscode.TreeItemCheckboxState.Checked) this.checked.add(item.uri.toString());
          else this.checked.delete(item.uri.toString());
        }
        this.updateDescription();
      }),
    );
  }

  get checkedImages(): ImageItem[] {
    return (this.images ?? []).filter(i => this.checked.has(i.uri.toString()));
  }

  setAllChecked(checked: boolean) {
    this.checked.clear();
    if (checked) this.images?.forEach(i => this.checked.add(i.uri.toString()));
    this.changed.fire();
    this.updateDescription();
  }

  async refresh() {
    this.images = await findImages();
    const present = new Set(this.images.map(i => i.uri.toString()));
    for (const key of this.checked) if (!present.has(key)) this.checked.delete(key);
    this.changed.fire();
    this.updateDescription();
  }

  getTreeItem(image: ImageItem): vscode.TreeItem {
    const item = new vscode.TreeItem(image.label);
    item.description = image.description;
    item.resourceUri = image.uri;
    item.tooltip = vscode.workspace.asRelativePath(image.uri);
    item.contextValue = 'image';
    item.checkboxState = this.checked.has(image.uri.toString())
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.command = { command: 'vscode.open', title: 'Open Image', arguments: [image.uri] };
    return item;
  }

  async getChildren(element?: ImageItem): Promise<ImageItem[]> {
    if (element) return [];
    if (!this.images) await this.refresh();
    return this.images ?? [];
  }

  dispose() {
    clearTimeout(this.refreshTimer);
    this.disposables.forEach(d => d.dispose());
  }

  private scheduleRefresh() {
    // Only once the view has loaded, and batch the burst of events a compression run causes.
    if (!this.images) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 500);
  }

  private updateDescription() {
    const total = this.images?.length ?? 0;
    this.view.description = total ? `${this.checked.size} of ${total} selected` : undefined;
  }
}
