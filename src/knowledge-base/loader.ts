import fs from 'node:fs';
import path from 'node:path';
import { CommandEntry, Platform } from '../types/command.js';
import { CommandEntrySchema } from './schema.js';

export interface LoadError {
  identifier?: string;
  sourceFile?: string;
  message: string;
}

export interface KnowledgeBaseStats {
  count: number;
  categories: string[];
  platforms: Platform[];
  schemaVersion: string;
  contentVersion: string;
}

export class KnowledgeBaseLoader {
  private entries: Map<string, CommandEntry> = new Map();
  private errors: LoadError[] = [];
  public readonly schemaVersion = '1.0.0';
  public readonly contentVersion = '2026.09.22';

  public loadEntries(rawEntries: unknown[]): LoadError[] {
    this.errors = [];
    for (const raw of rawEntries) {
      const parsed = CommandEntrySchema.safeParse(raw);
      if (parsed.success) {
        this.entries.set(parsed.data.id, parsed.data as CommandEntry);
      } else {
        const id = typeof raw === 'object' && raw !== null && 'id' in raw ? String(raw.id) : undefined;
        this.errors.push({
          identifier: id,
          message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        });
      }
    }
    return this.errors;
  }

  public loadFromDirectory(directoryPath: string): LoadError[] {
    if (!fs.existsSync(directoryPath)) {
      return [{ message: `Directory does not exist: ${directoryPath}` }];
    }

    const files = fs.readdirSync(directoryPath).filter((file) => file.endsWith('.json'));
    const allRaw: unknown[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(directoryPath, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          allRaw.push(...parsed);
        } else {
          allRaw.push(parsed);
        }
      } catch (err: unknown) {
        this.errors.push({
          sourceFile: file,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.loadEntries(allRaw);
  }

  public getAll(): CommandEntry[] {
    return Array.from(this.entries.values());
  }

  public getById(id: string): CommandEntry | undefined {
    return this.entries.get(id);
  }

  public getByCategory(category: string): CommandEntry[] {
    return this.getAll().filter((entry) => entry.category.includes(category));
  }

  public getByPlatform(platform: Platform): CommandEntry[] {
    return this.getAll().filter((entry) => entry.platforms.includes(platform));
  }

  public getStats(): KnowledgeBaseStats {
    const all = this.getAll();
    const categories = Array.from(new Set(all.flatMap((e) => e.category))).sort();
    const platforms = Array.from(new Set(all.flatMap((e) => e.platforms))).sort() as Platform[];

    return {
      count: all.length,
      categories,
      platforms,
      schemaVersion: this.schemaVersion,
      contentVersion: this.contentVersion,
    };
  }

  public getErrors(): LoadError[] {
    return [...this.errors];
  }
}
