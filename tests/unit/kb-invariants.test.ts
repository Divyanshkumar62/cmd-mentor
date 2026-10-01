import { describe, it, expect } from 'vitest';
import { KnowledgeBaseLoader } from '../../src/knowledge-base/loader.js';
import { validateKnowledgeBase } from '../../src/knowledge-base/validator.js';
import { resolveKnowledgeDirectory } from '../../src/cli/index.js';
import { requiresShellEvaluation } from '../../src/safety/shell-requirement.js';

const loader = new KnowledgeBaseLoader();
loader.loadFromDirectory(resolveKnowledgeDirectory());
const entries = loader.getAll();

describe('Bundled knowledge base invariants', () => {
  it('loads every bundled entry without validation errors', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(loader.getErrors()).toEqual([]);
    expect(validateKnowledgeBase(entries).valid).toBe(true);
  });

  it('has no duplicate ids', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every entry whose examples need shell evaluation', () => {
    const unmarked = entries
      .filter((e) => e.examples.some((ex) => requiresShellEvaluation(ex.command)))
      .filter((e) => !e.requiresShell)
      .map((e) => e.id);

    expect(unmarked).toEqual([]);
  });

  it('does not mark entries that are safe to execute as argv', () => {
    const overMarked = entries
      .filter((e) => e.requiresShell)
      .filter((e) => !e.examples.some((ex) => requiresShellEvaluation(ex.command)))
      .map((e) => e.id);

    expect(overMarked).toEqual([]);
  });

  it('classifies destructive commands as at least moderate risk', () => {
    const underClassified = entries
      .filter((e) => e.risk.destructive)
      .filter((e) => e.risk.level === 'informational' || e.risk.level === 'low')
      .map((e) => `${e.id} (${e.risk.level})`);

    expect(underClassified).toEqual([]);
  });

  it('points relatedCommands at ids that actually exist', () => {
    const known = new Set(entries.map((e) => e.id));
    const dangling = entries.flatMap((e) =>
      (e.relatedCommands ?? [])
        .filter((id) => !known.has(id))
        .map((id) => `${e.id} -> ${id}`)
    );

    expect(dangling).toEqual([]);
  });

  it('gives every entry at least one searchable alias or tag', () => {
    const bare = entries
      .filter((e) => e.aliases.length === 0 && e.tags.length === 0)
      .map((e) => e.id);

    expect(bare).toEqual([]);
  });
});
