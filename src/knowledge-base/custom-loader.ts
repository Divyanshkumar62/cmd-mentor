import fs from 'node:fs';
import path from 'node:path';
import { CommandEntry } from '../types/command.js';
import { CommandEntrySchema } from './schema.js';
import { LoadError } from './loader.js';
import { getCustomSnippetsDirectory } from '../storage/paths.js';

export function loadCustomEntries(directoryPath?: string): { entries: CommandEntry[]; errors: LoadError[] } {
  const dir = directoryPath || getCustomSnippetsDirectory();
  const entries: CommandEntry[] = [];
  const errors: LoadError[] = [];

  if (!fs.existsSync(dir)) {
    return { entries, errors };
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        const validated = CommandEntrySchema.safeParse(item);
        if (validated.success) {
          const entry = validated.data as CommandEntry;
          if (!entry.category.includes('custom')) {
            entry.category.push('custom');
          }
          entries.push(entry);
        } else {
          errors.push({
            sourceFile: file,
            identifier: typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : undefined,
            message: validated.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          });
        }
      }
    } catch (err: unknown) {
      errors.push({
        sourceFile: file,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { entries, errors };
}
