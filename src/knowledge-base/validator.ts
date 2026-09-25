import { CommandEntrySchema } from './schema.js';

export interface ValidationReport {
  valid: boolean;
  totalEntries: number;
  validEntries: number;
  invalidEntries: number;
  errors: Array<{
    id?: string;
    errors: string[];
  }>;
  duplicateIds: string[];
}

export function validateKnowledgeBase(entries: unknown[]): ValidationReport {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const errors: Array<{ id?: string; errors: string[] }> = [];
  let validEntries = 0;

  for (const raw of entries) {
    const parsed = CommandEntrySchema.safeParse(raw);
    const rawId = typeof raw === 'object' && raw !== null && 'id' in raw ? String(raw.id) : undefined;

    if (rawId) {
      if (seenIds.has(rawId)) {
        duplicateIds.push(rawId);
      } else {
        seenIds.add(rawId);
      }
    }

    if (parsed.success) {
      validEntries++;
    } else {
      errors.push({
        id: rawId,
        errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
    }
  }

  const valid = errors.length === 0 && duplicateIds.length === 0;

  return {
    valid,
    totalEntries: entries.length,
    validEntries,
    invalidEntries: errors.length,
    errors,
    duplicateIds,
  };
}
