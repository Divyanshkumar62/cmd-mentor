import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { KnowledgeBaseLoader } from '../../src/knowledge-base/loader.js';
import { validateKnowledgeBase } from '../../src/knowledge-base/validator.js';

describe('Bundled Knowledge Base Validation', () => {
  it('loads and validates all bundled JSON command files', () => {
    const loader = new KnowledgeBaseLoader();
    const commandsDir = path.resolve(process.cwd(), 'knowledge/commands');
    const errors = loader.loadFromDirectory(commandsDir);

    expect(errors).toHaveLength(0);
    const all = loader.getAll();
    expect(all.length).toBeGreaterThanOrEqual(15);

    const report = validateKnowledgeBase(all);
    expect(report.valid).toBe(true);
    expect(report.invalidEntries).toBe(0);
    expect(report.duplicateIds).toHaveLength(0);
  });
});
