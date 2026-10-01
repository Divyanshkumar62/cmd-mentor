import { describe, it, expect, vi } from 'vitest';
import { TerminalManager } from '../../src/tui/terminal.js';

describe('TerminalManager', () => {
  it('manages cursor and alternate screen state safely without throwing', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(() => {
      TerminalManager.enterAlternateScreen();
      TerminalManager.showCursor();
      TerminalManager.hideCursor();
      TerminalManager.exitAlternateScreen();
      TerminalManager.restoreTerminal();
    }).not.toThrow();

    stdoutWrite.mockRestore();
  });

  it('emits clear screen and cursor home sequences when entering alternate screen in TTY', () => {
    const originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    const writes: string[] = [];
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      writes.push(chunk.toString());
      return true;
    });

    // Reset internal state by exiting first
    TerminalManager.restoreTerminal();

    TerminalManager.enterAlternateScreen();
    expect(writes).toContain('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H');

    TerminalManager.clearScreen();
    expect(writes).toContain('\x1b[2J\x1b[3J\x1b[H');

    TerminalManager.exitAlternateScreen();
    expect(writes).toContain('\x1b[?1049l');

    stdoutWrite.mockRestore();
    process.stdout.isTTY = originalIsTTY;
  });
});
