import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigStore } from '../../src/storage/config.js';
import { BookmarkStore } from '../../src/storage/bookmarks.js';
import { HistoryStore, maskSensitiveTokens } from '../../src/storage/history.js';

describe('Storage & Configuration', () => {
  let tempDir: string;
  let configPath: string;
  let bookmarksPath: string;
  let historyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-test-'));
    configPath = path.join(tempDir, 'config.json');
    bookmarksPath = path.join(tempDir, 'bookmarks.json');
    historyPath = path.join(tempDir, 'history.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('loads default configuration when file does not exist', () => {
    const configStore = new ConfigStore(configPath);
    const config = configStore.get();
    expect(config.execution.enabled).toBe(true);
    expect(config.history.enabled).toBe(true);
  });

  it('updates configuration and persists to disk', () => {
    const configStore = new ConfigStore(configPath);
    configStore.set('execution.enabled', false);

    expect(configStore.get().execution.enabled).toBe(false);

    // Verify written to disk
    const reloaded = new ConfigStore(configPath);
    expect(reloaded.get().execution.enabled).toBe(false);
  });

  it('manages bookmarks (add, list, remove, check)', () => {
    const bookmarkStore = new BookmarkStore(bookmarksPath);
    expect(bookmarkStore.list()).toHaveLength(0);

    bookmarkStore.add('filesystem.mkdir.posix');
    expect(bookmarkStore.isBookmarked('filesystem.mkdir.posix')).toBe(true);
    expect(bookmarkStore.list()).toContain('filesystem.mkdir.posix');

    bookmarkStore.remove('filesystem.mkdir.posix');
    expect(bookmarkStore.isBookmarked('filesystem.mkdir.posix')).toBe(false);
  });

  it('masks sensitive tokens in history', () => {
    const maskedBearer = maskSensitiveTokens('curl -H "Authorization: Bearer mySecretToken123"');
    expect(maskedBearer).toContain('[REDACTED]');
    expect(maskedBearer).not.toContain('mySecretToken123');

    const maskedPassword = maskSensitiveTokens('mysql -u root -ppassword123');
    expect(maskedPassword).toContain('[REDACTED]');
    expect(maskedPassword).not.toContain('password123');
  });

  it('records history when enabled and respects disabled flag', () => {
    const historyStore = new HistoryStore(historyPath);
    historyStore.record('create a folder', true);
    expect(historyStore.list()).toHaveLength(1);

    historyStore.record('find port', false); // disabled
    expect(historyStore.list()).toHaveLength(1);

    historyStore.clear();
    expect(historyStore.list()).toHaveLength(0);
  });
});
