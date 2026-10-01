import { describe, it, expect } from 'vitest';
import { copyToClipboard } from '../../src/clipboard/index.js';

describe('Clipboard Adapter', () => {
  it('copies text to clipboard or falls back with text', async () => {
    const res = await copyToClipboard('mkdir test_dir');
    expect(res.copiedText).toBe('mkdir test_dir');
    // On systems with working clipboard (Windows), success is true
    // If headless, res.error contains fallback message
    if (!res.success) {
      expect(res.error).toContain('Clipboard unavailable');
    } else {
      expect(res.success).toBe(true);
    }
  });
});
