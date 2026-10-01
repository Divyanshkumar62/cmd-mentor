import { describe, it, expect } from 'vitest';
import { KnowledgeBaseLoader } from '../../src/knowledge-base/loader.js';
import { validateKnowledgeBase } from '../../src/knowledge-base/validator.js';

describe('KnowledgeBaseLoader', () => {
  const sampleEntries = [
    {
      id: 'filesystem.mkdir.linux',
      name: 'mkdir',
      title: 'Create a directory',
      description: 'Creates one or more new directories in the file system.',
      commandTemplate: 'mkdir <directory>',
      platforms: ['linux', 'macos', 'windows'],
      shells: ['bash', 'zsh', 'powershell', 'cmd'],
      category: ['filesystem'],
      tags: ['folder', 'directory', 'create'],
      aliases: ['create a folder', 'make a directory'],
      flags: [
        {
          name: '-p',
          description: 'Create parent directories as needed.',
        },
      ],
      examples: [
        {
          command: 'mkdir project',
          explanation: 'Creates a directory named project.',
        },
      ],
      risk: {
        level: 'low',
        destructive: false,
        requiresElevation: false,
      },
      verification: {
        status: 'reviewed',
        lastReviewed: '2026-09-22',
        source: 'POSIX man pages',
      },
    },
    {
      id: 'git.status.all',
      name: 'git status',
      title: 'Show working tree status',
      description: 'Displays paths that have differences between the index file and the current HEAD commit.',
      commandTemplate: 'git status',
      platforms: ['linux', 'macos', 'windows'],
      shells: ['bash', 'zsh', 'powershell', 'cmd', 'git-bash'],
      category: ['git'],
      tags: ['git', 'status', 'working tree'],
      aliases: ['check git status', 'what files changed'],
      flags: [
        {
          name: '-s',
          shorthand: '--short',
          description: 'Give the output in the short-format.',
        },
      ],
      examples: [
        {
          command: 'git status -s',
          explanation: 'Shows modified files in compact format.',
        },
      ],
      risk: {
        level: 'informational',
        destructive: false,
        requiresElevation: false,
      },
      verification: {
        status: 'reviewed',
        lastReviewed: '2026-09-22',
        source: 'Git Documentation',
      },
    },
  ];

  it('loads and validates entries accurately', () => {
    const kb = new KnowledgeBaseLoader();
    kb.loadEntries(sampleEntries);

    expect(kb.getAll()).toHaveLength(2);
    expect(kb.getById('filesystem.mkdir.linux')?.name).toBe('mkdir');
    expect(kb.getByCategory('git')).toHaveLength(1);
    expect(kb.getByPlatform('windows')).toHaveLength(2);
  });

  it('skips corrupt entries without crashing', () => {
    const kb = new KnowledgeBaseLoader();
    const withCorrupt = [...sampleEntries, { id: 'invalid_entry', name: '' }];
    const errors = kb.loadEntries(withCorrupt);

    expect(errors).toHaveLength(1);
    expect(kb.getAll()).toHaveLength(2);
  });

  it('validates knowledge base integrity and cross-references', () => {
    const report = validateKnowledgeBase(sampleEntries);
    expect(report.valid).toBe(true);
    expect(report.totalEntries).toBe(2);
    expect(report.errors).toHaveLength(0);
  });
});
