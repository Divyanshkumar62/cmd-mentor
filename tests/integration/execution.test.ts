import { describe, it, expect } from 'vitest';
import { executeCommand } from '../../src/execution/runner.js';

describe('Execution Runner', () => {
  it('executes a safe command and captures output and exit code 0', async () => {
    // node -e "console.log('Hello from test')"
    const result = await executeCommand({
      commandLine: 'node -e "console.log(\'Hello from test\')"',
      executionEnabled: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello from test');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('rejects execution when kill switch is active', async () => {
    await expect(
      executeCommand({
        commandLine: 'node -v',
        executionEnabled: false,
      })
    ).rejects.toThrow(/execution is globally disabled/i);
  });

  it('captures non-zero exit codes from failing child processes', async () => {
    const result = await executeCommand({
      commandLine: 'node -e "process.exit(42)"',
      executionEnabled: true,
    });

    expect(result.exitCode).toBe(42);
  });
});
