import fs from 'node:fs';
import path from 'node:path';
import { getAppStorageDirectory } from './paths.js';

export class BookmarkStore {
  private filePath: string;
  private bookmarks: Set<string>;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(getAppStorageDirectory(), 'bookmarks.json');
    this.bookmarks = this.load();
  }

  private load(): Set<string> {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map(String));
        }
      }
    } catch {
      // Return empty set on corrupt file
    }
    return new Set();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(Array.from(this.bookmarks), null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error(`Failed to save bookmarks to ${this.filePath}:`, err);
    }
  }

  public add(commandId: string): void {
    this.bookmarks.add(commandId);
    this.save();
  }

  public remove(commandId: string): void {
    this.bookmarks.delete(commandId);
    this.save();
  }

  public isBookmarked(commandId: string): boolean {
    return this.bookmarks.has(commandId);
  }

  public list(): string[] {
    return Array.from(this.bookmarks);
  }
}
