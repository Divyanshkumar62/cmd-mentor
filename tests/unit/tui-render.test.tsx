import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import { Writable } from 'node:stream';
import { ResultList } from '../../src/tui/components/ResultList.js';
import { DetailView } from '../../src/tui/components/DetailView.js';
import { SearchBar } from '../../src/tui/components/SearchBar.js';
import { StatusBar } from '../../src/tui/components/StatusBar.js';
import { SearchResult } from '../../src/search/engine.js';
import { CommandEntry } from '../../src/types/command.js';
import { EnvironmentContext } from '../../src/types/environment.js';

class MockStdout extends Writable {
  output = '';
  columns = 100;
  rows = 30;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

describe('TUI Components Rendering', () => {
  const sampleEntry: CommandEntry = {
    id: 'filesystem.mkdir.posix',
    name: 'mkdir',
    title: 'Create a directory',
    description: 'Creates one or more directories with optional parent path creation.',
    commandTemplate: 'mkdir <directory>',
    platforms: ['linux', 'macos', 'windows'],
    shells: ['bash', 'zsh', 'powershell', 'cmd'],
    category: ['filesystem'],
    tags: ['folder', 'directory', 'create'],
    aliases: ['create a folder'],
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
      lastReviewed: '2026-03-20',
      source: 'POSIX.1-2017 specification',
    },
  };

  const sampleResults: SearchResult[] = [
    {
      entry: sampleEntry,
      score: 1.0,
      matchReasons: ['Exact command match'],
    },
  ];

  const sampleEnv: EnvironmentContext = {
    platform: 'windows',
    shell: 'powershell',
    cwd: 'C:\\dungeon\\command-reference',
    terminal: {
      isTTY: true,
      columns: 100,
      rows: 30,
      colorDepth: 24,
      hasUnicode: true,
    },
    isAmbiguousShell: false,
    rawPlatform: 'win32',
  };

  it('renders ResultList without throwing border or style errors', () => {
    const stdout = new MockStdout();
    expect(() => {
      const { unmount } = render(
        <ResultList
          results={sampleResults}
          selectedIndex={0}
          bookmarkedIds={new Set()}
          terminalCols={100}
        />,
        { stdout: stdout as any, debug: true }
      );
      unmount();
    }).not.toThrow();
  });

  it('renders DetailView cleanly without style exceptions', () => {
    const stdout = new MockStdout();
    expect(() => {
      const { unmount } = render(
        <DetailView entry={sampleEntry} isBookmarked={false} />,
        { stdout: stdout as any, debug: true }
      );
      unmount();
    }).not.toThrow();
  });

  it('renders SearchBar and StatusBar without errors', () => {
    const stdout = new MockStdout();
    expect(() => {
      const { unmount: unmountBar } = render(
        <SearchBar query="test" totalResults={1} />,
        { stdout: stdout as any, debug: true }
      );
      unmountBar();

      const { unmount: unmountStatus } = render(
        <StatusBar
          environment={sampleEnv}
          currentScreen="SEARCH"
          toastMessage={null}
        />,
        { stdout: stdout as any, debug: true }
      );
      unmountStatus();
    }).not.toThrow();
  });
});
