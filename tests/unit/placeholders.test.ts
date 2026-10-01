import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  buildPrompts,
  collectPlaceholderValues,
  parseSetPairs,
} from '../../src/execution/placeholders.js';
import {
  extractPlaceholders,
  interpolateTemplate,
  splitCommandArgs,
} from '../../src/safety/sanitizer.js';
import { generateExecutionPreview } from '../../src/execution/preview.js';
import { CommandEntry } from '../../src/types/command.js';

function ttyStream(lines: string[]): NodeJS.ReadableStream & { isTTY?: boolean } {
  const s = new Readable({
    read() {
      for (const l of lines) this.push(l + '\n');
      this.push(null);
    },
  }) as Readable & { isTTY?: boolean };
  s.isTTY = true;
  return s;
}

function pipeStream(): NodeJS.ReadableStream & { isTTY?: boolean } {
  const s = new Readable({ read() { this.push(null); } }) as Readable & { isTTY?: boolean };
  s.isTTY = false;
  return s;
}

const sink = { write: () => true } as unknown as NodeJS.WritableStream;

const mkdirEntry: CommandEntry = {
  id: 'filesystem.mkdir.posix',
  name: 'mkdir',
  title: 'Create a directory',
  description: 'Creates directories.',
  commandTemplate: 'mkdir <directory>',
  platforms: ['linux'],
  shells: ['bash'],
  category: ['filesystem'],
  tags: ['mkdir'],
  aliases: ['create a folder'],
  flags: [],
  examples: [{ command: 'mkdir project', explanation: 'Creates project.' }],
  risk: { level: 'low', destructive: false, requiresElevation: false },
  verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'test' },
};

describe('Placeholder extraction and interpolation', () => {
  it('extracts distinct placeholder names, including dotted ones', () => {
    expect(extractPlaceholders('mkdir <directory>')).toEqual(['directory']);
    expect(extractPlaceholders('unzip <archive.zip> -d <dir>')).toEqual(['archive.zip', 'dir']);
    expect(extractPlaceholders('cp <src> <src> <dst>')).toEqual(['src', 'dst']);
    expect(extractPlaceholders('git status')).toEqual([]);
  });

  it('substitutes only the tokens present in the template', () => {
    expect(interpolateTemplate('mkdir <directory>', { directory: 'demo' })).toBe('mkdir demo');
  });

  it('leaves unknown placeholders intact rather than blanking them', () => {
    // A blank would silently change the command's meaning; the execution gate
    // refuses the leftover token instead.
    expect(interpolateTemplate('cp <src> <dst>', { src: 'a' })).toBe('cp a <dst>');
  });

  it('does not treat a placeholder name as a regular expression', () => {
    const out = interpolateTemplate('run <a.b>', { 'a.b': 'value' });
    expect(out).toBe('run value');
  });

  it('rejects values carrying shell metacharacters', () => {
    for (const payload of ['x; rm -rf /', 'x && calc', 'x | sh', '$(id)', '`id`', 'x > f']) {
      expect(() => interpolateTemplate('mkdir <directory>', { directory: payload })).toThrow(
        /invalid characters|metacharacter/i
      );
    }
  });
});

describe('splitCommandArgs quoting', () => {
  it('keeps quoted strings together as one argument', () => {
    expect(splitCommandArgs('git commit -m "a b c"')).toEqual(['git', 'commit', '-m', 'a b c']);
  });

  it('preserves an explicitly quoted empty argument', () => {
    expect(splitCommandArgs('cmd "" x')).toEqual(['cmd', '', 'x']);
  });

  it('collapses runs of whitespace', () => {
    expect(splitCommandArgs('  a   b  ')).toEqual(['a', 'b']);
  });
});

describe('Placeholder prompt construction', () => {
  it('infers a hint from a same-shaped example', () => {
    const prompts = buildPrompts('mkdir <directory>', mkdirEntry);
    expect(prompts).toEqual([{ name: 'directory', hint: 'project' }]);
  });

  it('omits a hint when no example lines up', () => {
    const prompts = buildPrompts('mkdir <directory>', {
      ...mkdirEntry,
      examples: [{ command: 'mkdir -p a/b', explanation: 'nested' }],
    });
    expect(prompts[0]?.hint).toBeUndefined();
  });
});

describe('Collecting placeholder values', () => {
  it('uses preset values without prompting', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory' }],
      preset: { directory: 'demo' },
      input: pipeStream(),
      output: sink,
    });
    expect(outcome).toEqual({ filled: true, values: { directory: 'demo' } });
  });

  it('prompts interactively for missing values', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory' }],
      input: ttyStream(['my_folder']),
      output: sink,
    });
    expect(outcome).toEqual({ filled: true, values: { directory: 'my_folder' } });
  });

  it('accepts the hint when the answer is blank', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory', hint: 'project' }],
      input: ttyStream(['']),
      output: sink,
    });
    expect(outcome).toEqual({ filled: true, values: { directory: 'project' } });
  });

  it('cancels on a blank answer when there is no hint to fall back on', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory' }],
      input: ttyStream(['']),
      output: sink,
    });
    expect(outcome).toEqual({ filled: false, reason: 'canceled' });
  });

  it('re-prompts after rejecting a dangerous value, then accepts a clean one', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory' }],
      input: ttyStream(['bad; rm -rf /', 'good_dir']),
      output: sink,
    });
    expect(outcome).toEqual({ filled: true, values: { directory: 'good_dir' } });
  });

  it('refuses to prompt when there is no interactive terminal', async () => {
    const outcome = await collectPlaceholderValues({
      prompts: [{ name: 'directory' }],
      input: pipeStream(),
      output: sink,
    });
    expect(outcome).toEqual({ filled: false, reason: 'no-tty' });
  });
});

describe('parseSetPairs', () => {
  it('parses name=value pairs, keeping = inside the value', () => {
    expect(parseSetPairs(['a=1', 'b=x=y'])).toEqual({ a: '1', b: 'x=y' });
  });

  it('rejects malformed pairs', () => {
    expect(() => parseSetPairs(['novalue'])).toThrow(/name=value/);
    expect(() => parseSetPairs(['=empty'])).toThrow(/name=value/);
  });
});

describe('Preview source selection', () => {
  it('defaults to the first reviewed example', () => {
    expect(generateExecutionPreview(mkdirEntry).finalCommand).toBe('mkdir project');
  });

  it('uses the template when asked, leaving placeholders for the prompt stage', () => {
    const preview = generateExecutionPreview(mkdirEntry, { useTemplate: true });
    expect(preview.finalCommand).toBe('mkdir <directory>');
    expect(preview.executability.reason).toBe('unfilled-placeholder');
  });

  it('becomes executable once the placeholder is filled', () => {
    const preview = generateExecutionPreview(mkdirEntry, {
      useTemplate: true,
      params: { directory: 'demo' },
    });
    expect(preview.finalCommand).toBe('mkdir demo');
    expect(preview.executability.executable).toBe(true);
  });

  it('selects a specific example by index', () => {
    const entry = {
      ...mkdirEntry,
      examples: [
        { command: 'mkdir project', explanation: 'one' },
        { command: 'mkdir -p a/b', explanation: 'two' },
      ],
    };
    expect(generateExecutionPreview(entry, { selectedExampleIndex: 1 }).finalCommand).toBe(
      'mkdir -p a/b'
    );
  });
});
