import { describe, it, expect } from 'vitest';
import { detectEnvironment, resolvePlatformFromNode } from '../../src/environment/detector.js';

describe('Environment Detector', () => {
  it('maps node platforms accurately', () => {
    expect(resolvePlatformFromNode('win32')).toBe('windows');
    expect(resolvePlatformFromNode('linux')).toBe('linux');
    expect(resolvePlatformFromNode('darwin')).toBe('macos');
  });

  it('detects powershell when PSModulePath or PWSH is present', () => {
    const env = detectEnvironment({
      mockEnv: {
        PSModulePath: 'C:\\Program Files\\PowerShell\\Modules',
      },
      mockPlatform: 'win32',
      mockIsTTY: true,
    });
    expect(env.platform).toBe('windows');
    expect(env.shell).toBe('powershell');
    expect(env.terminal.isTTY).toBe(true);
  });

  it('detects git-bash when MSYSTEM or Git Bash SHELL is present on Windows', () => {
    const env = detectEnvironment({
      mockEnv: {
        MSYSTEM: 'MINGW64',
        SHELL: '/usr/bin/bash',
      },
      mockPlatform: 'win32',
    });
    expect(env.platform).toBe('windows');
    expect(env.shell).toBe('git-bash');
  });

  it('detects zsh on macOS/Linux from SHELL variable', () => {
    const env = detectEnvironment({
      mockEnv: {
        SHELL: '/bin/zsh',
      },
      mockPlatform: 'darwin',
    });
    expect(env.platform).toBe('macos');
    expect(env.shell).toBe('zsh');
  });

  it('detects bash on Linux from SHELL variable', () => {
    const env = detectEnvironment({
      mockEnv: {
        SHELL: '/bin/bash',
      },
      mockPlatform: 'linux',
    });
    expect(env.platform).toBe('linux');
    expect(env.shell).toBe('bash');
  });

  it('respects explicit platform and shell overrides', () => {
    const env = detectEnvironment({
      mockPlatform: 'win32',
      overridePlatform: 'linux',
      overrideShell: 'bash',
    });
    expect(env.platform).toBe('linux');
    expect(env.shell).toBe('bash');
  });
});
