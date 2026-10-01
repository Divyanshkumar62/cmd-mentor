import { describe, it, expect, beforeEach } from 'vitest';
import { SearchEngine } from '../../src/search/engine.js';
import { tokenizeQuery } from '../../src/search/tokenizer.js';
import { CommandEntry } from '../../src/types/command.js';

describe('Search Tokenizer', () => {
  it('tokenizes and removes common stopwords while keeping keywords', () => {
    const tokens = tokenizeQuery('how do I create a new directory in bash');
    expect(tokens).toContain('create');
    expect(tokens).toContain('directory');
    expect(tokens).toContain('bash');
    expect(tokens).not.toContain('how');
    expect(tokens).not.toContain('do');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('in');
  });

  it('preserves command flag tokens', () => {
    const tokens = tokenizeQuery('rm -rf node_modules');
    expect(tokens).toContain('rm');
    expect(tokens).toContain('-rf');
    expect(tokens).toContain('node_modules');
  });

  it('handles empty query', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('Search Engine', () => {
  let engine: SearchEngine;

  const mockCommands: CommandEntry[] = [
    {
      id: 'filesystem.mkdir.posix',
      name: 'mkdir',
      title: 'Create a directory',
      description: 'Creates one or more directories in the filesystem.',
      commandTemplate: 'mkdir <directory>',
      platforms: ['linux', 'macos', 'windows'],
      shells: ['bash', 'zsh', 'powershell', 'cmd'],
      category: ['filesystem'],
      tags: ['folder', 'directory', 'create'],
      aliases: ['create a folder', 'make directory'],
      flags: [{ name: '-p', description: 'Parents' }],
      examples: [{ command: 'mkdir project', explanation: 'Creates project' }],
      risk: { level: 'low', destructive: false, requiresElevation: false },
      verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'POSIX' },
    },
    {
      id: 'filesystem.newitem.powershell',
      name: 'New-Item',
      title: 'Create a directory or file (PowerShell)',
      description: 'PowerShell cmdlet to create directory or files.',
      commandTemplate: 'New-Item -ItemType Directory -Path <path>',
      platforms: ['windows'],
      shells: ['powershell'],
      category: ['filesystem'],
      tags: ['folder', 'directory', 'create', 'powershell'],
      aliases: ['create a folder in powershell'],
      flags: [{ name: '-ItemType', description: 'Item type' }],
      examples: [{ command: 'New-Item -ItemType Directory', explanation: 'Creates directory' }],
      risk: { level: 'low', destructive: false, requiresElevation: false },
      verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'MS Learn' },
    },
    {
      id: 'git.status.all',
      name: 'git status',
      title: 'Show working tree status',
      description: 'Displays paths with differences.',
      commandTemplate: 'git status',
      platforms: ['linux', 'macos', 'windows'],
      shells: ['bash', 'zsh', 'powershell'],
      category: ['git'],
      tags: ['git', 'status', 'modified'],
      aliases: ['check git status'],
      flags: [],
      examples: [{ command: 'git status', explanation: 'Show status' }],
      risk: { level: 'informational', destructive: false, requiresElevation: false },
      verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'Git' },
    },
  ];

  beforeEach(() => {
    engine = new SearchEngine(mockCommands);
  });

  it('returns default listing for empty query', () => {
    const results = engine.search('');
    expect(results.length).toBe(3);
  });

  it('ranks exact command name highest', () => {
    const results = engine.search('mkdir');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.name).toBe('mkdir');
  });

  it('finds command by plain English alias task query', () => {
    const results = engine.search('create a folder');
    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r) => r.entry.name);
    expect(names).toContain('mkdir');
    expect(names).toContain('New-Item');
  });

  it('handles typos using fuzzy matching', () => {
    const results = engine.search('mddir');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.name).toBe('mkdir');
  });

  it('boosts platform and shell compatibility', () => {
    const resultsWindows = engine.search('create a folder', {
      preferredPlatform: 'windows',
      preferredShell: 'powershell',
    });
    expect(resultsWindows.length).toBeGreaterThan(0);
    expect(resultsWindows[0]?.entry.platforms).toContain('windows');
  });

  it('filters by category, platform, shell, and risk level', () => {
    expect(engine.search('', { category: 'git' })).toHaveLength(1);
    expect(engine.search('', { platform: 'windows' })).toHaveLength(3);
    expect(engine.search('', { platform: 'linux' })).toHaveLength(2);
    expect(engine.search('', { shell: 'cmd' })).toHaveLength(1);
    expect(engine.search('', { riskLevel: 'informational' })).toHaveLength(1);
  });
});
