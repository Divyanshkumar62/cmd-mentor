import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCustomEntries } from '../../src/knowledge-base/custom-loader.js';

describe('Custom Command Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-custom-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('returns empty array if custom directory does not exist', () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    const result = loadCustomEntries(nonExistent);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('loads valid custom JSON files from directory', () => {
    const customCommand = {
      id: 'custom.mytool.deploy',
      name: 'mytool-deploy',
      title: 'Deploy microservice to staging',
      description: 'Internal deployment tool for running staging cluster updates.',
      commandTemplate: 'mytool deploy --env staging',
      platforms: ['linux', 'windows', 'macos'],
      shells: ['bash', 'powershell'],
      category: ['custom', 'devops'],
      tags: ['deploy', 'staging'],
      aliases: ['deploy to staging'],
      flags: [],
      examples: [
        {
          command: 'mytool deploy --env staging',
          explanation: 'Deploys to staging.',
        },
      ],
      risk: {
        level: 'moderate',
        destructive: false,
        requiresElevation: false,
      },
      verification: {
        status: 'reviewed',
        lastReviewed: '2026-09-22',
        source: 'Internal Team Docs',
      },
    };

    fs.writeFileSync(path.join(tempDir, 'deploy.json'), JSON.stringify(customCommand), 'utf-8');

    const result = loadCustomEntries(tempDir);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('mytool-deploy');
    expect(result.errors).toHaveLength(0);
  });

  it('reports errors for invalid custom snippets without crashing', () => {
    fs.writeFileSync(
      path.join(tempDir, 'invalid.json'),
      JSON.stringify({ id: 'bad', name: '' }),
      'utf-8'
    );

    const result = loadCustomEntries(tempDir);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
