import process from 'node:process';

export class TerminalManager {
  private static isAlternateScreenActive = false;
  private static isTrapped = false;

  public static enterAlternateScreen(): void {
    if (process.stdout.isTTY && !this.isAlternateScreenActive) {
      // 1. Enter alternate screen buffer: \x1b[?1049h
      // 2. Clear visible screen and scrollback buffer: \x1b[2J\x1b[3J
      // 3. Move cursor to top-left home (row 1, col 1): \x1b[H
      process.stdout.write('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H');
      this.isAlternateScreenActive = true;
    }
  }

  public static clearScreen(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  }

  public static exitAlternateScreen(): void {
    if (this.isAlternateScreenActive) {
      process.stdout.write('\x1b[?1049l');
      this.isAlternateScreenActive = false;
    }
  }

  public static showCursor(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?25h');
    }
  }

  public static hideCursor(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?25l');
    }
  }

  public static restoreTerminal(): void {
    this.showCursor();
    this.exitAlternateScreen();

    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // Ignore errors during emergency exit
      }
    }

    if (typeof process.stdin.pause === 'function') {
      process.stdin.pause();
    }
  }

  public static setupSignalTraps(): void {
    if (this.isTrapped) return;
    this.isTrapped = true;

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const signal of signals) {
      process.on(signal, () => {
        TerminalManager.restoreTerminal();
        process.exit(130);
      });
    }

    process.on('uncaughtException', (err) => {
      TerminalManager.restoreTerminal();
      console.error('Uncaught Exception in CmdMentor:', err);
      process.exit(1);
    });

    process.on('exit', () => {
      TerminalManager.restoreTerminal();
    });
  }
}
