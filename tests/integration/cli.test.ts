import { describe, it, expect } from 'vitest';
import { createCLI } from '../../src/cli/index.js';

describe('CLI Commands and Subcommands', () => {
  it('creates commander instance with Phase 3 & 4 subcommands', () => {
    const cli = createCLI();
    expect(cli.name()).toBe('cmdmentor');
    expect(cli.version()).toBe('0.1.0');

    const commandNames = cli.commands.map((c) => c.name());
    expect(commandNames).toContain('search');
    expect(commandNames).toContain('show');
    expect(commandNames).toContain('copy');
    expect(commandNames).toContain('exec');
    expect(commandNames).toContain('bookmarks');
    expect(commandNames).toContain('config');
    expect(commandNames).toContain('kb');
  });

  it('provides bookmarks subcommands (list, add, remove)', () => {
    const cli = createCLI();
    const bookmarks = cli.commands.find((c) => c.name() === 'bookmarks');
    expect(bookmarks).toBeDefined();
    const subnames = bookmarks?.commands.map((c) => c.name());
    expect(subnames).toContain('list');
    expect(subnames).toContain('add');
    expect(subnames).toContain('remove');
  });

  it('provides config subcommands (get, set)', () => {
    const cli = createCLI();
    const config = cli.commands.find((c) => c.name() === 'config');
    expect(config).toBeDefined();
    const subnames = config?.commands.map((c) => c.name());
    expect(subnames).toContain('get');
    expect(subnames).toContain('set');
  });

  it('provides kb version and validate subcommands', () => {
    const cli = createCLI();
    const kb = cli.commands.find((c) => c.name() === 'kb');
    expect(kb).toBeDefined();
    const subnames = kb?.commands.map((c) => c.name());
    expect(subnames).toContain('version');
    expect(subnames).toContain('validate');
  });
});
