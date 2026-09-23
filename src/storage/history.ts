import fs from 'node:fs';
import path from 'node:path';
import { getAppStorageDirectory } from './paths.js';

export interface HistoryEntry {
  query: string;
  timestamp: string;
  type: 'SEARCH' | 'EXECUTE';
}

export function maskSensitiveTokens(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(-p|--password\s*=?\s*|password\s*=\s*)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*=?\s*)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(sk-[a-zA-Z0-9_-]{15,})/gi, '[REDACTED]');
}

export class HistoryStore {
  private filePath: string;
  private entries: HistoryEntry[];
  private readonly maxEntries = 100;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(getAppStorageDirectory(), 'history.json');
    this.entries = this.load();
  }

  private load(): HistoryEntry[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return [];
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.entries, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error(`Failed to save history to ${this.filePath}:`, err);
    }
  }

  public record(rawText: string, enabled = true, type: 'SEARCH' | 'EXECUTE' = 'SEARCH'): void {
    if (!enabled || !rawText.trim()) {
      return;
    }

    const masked = maskSensitiveTokens(rawText.trim());
    const newEntry: HistoryEntry = {
      query: masked,
      timestamp: new Date().toISOString(),
      type,
    };

    // Prepend and limit size
    this.entries = [newEntry, ...this.entries.filter((e) => e.query !== masked)].slice(0, this.maxEntries);
    this.save();
  }

  public list(): HistoryEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries = [];
    this.save();
  }
}
