import { describe, it, expect } from 'vitest';
import { CommandEntrySchema } from '../../src/knowledge-base/schema.js';

describe('CommandEntrySchema', () => {
  const validEntry = {
    id: 'filesystem.mkdir.linux',
    name: 'mkdir',
    title: 'Create a directory',
    description: 'Creates one or more new directories in the file system.',
    commandTemplate: 'mkdir <directory>',
    platforms: ['linux', 'macos', 'windows'] as const,
    shells: ['bash', 'zsh', 'powershell', 'cmd'] as const,
    category: ['filesystem'],
    tags: ['folder', 'directory', 'create'],
    aliases: ['create a folder', 'make a directory'],
    flags: [
      {
        name: '-p',
        description: 'Creates intermediate parent directories as needed.',
      },
    ],
    examples: [
      {
        command: 'mkdir project',
        explanation: 'Creates a directory named project in the current directory.',
      },
    ],
    risk: {
      level: 'low' as const,
      destructive: false,
      requiresElevation: false,
      sideEffects: 'Creates new directory node.',
      reversibility: 'Reversible with rmdir',
    },
    verification: {
      status: 'reviewed' as const,
      lastReviewed: '2026-09-22',
      source: 'POSIX standard / Linux man pages',
    },
  };

  it('validates a correct command entry', () => {
    const result = CommandEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid ID format', () => {
    const invalid = { ...validEntry, id: 'invalid_id_without_dots' };
    const result = CommandEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid date format in verification', () => {
    const invalid = {
      ...validEntry,
      verification: { ...validEntry.verification, lastReviewed: '22-09-2026' },
    };
    const result = CommandEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid risk level', () => {
    const invalid = {
      ...validEntry,
      risk: { ...validEntry.risk, level: 'super-dangerous' },
    };
    const result = CommandEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires at least one example', () => {
    const invalid = { ...validEntry, examples: [] };
    const result = CommandEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
