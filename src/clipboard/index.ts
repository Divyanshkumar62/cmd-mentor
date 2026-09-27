
export interface CopyResult {
  success: boolean;
  copiedText: string;
  error?: string;
}

export async function copyToClipboard(text: string): Promise<CopyResult> {
  try {
    // Imported lazily: clipboardy costs ~60ms to load and is never needed by
    // plain-text or CI runs, which must stay fast.
    const { default: clipboardy } = await import('clipboardy');
    await clipboardy.write(text);
    return {
      success: true,
      copiedText: text,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      copiedText: text,
      error: `Clipboard unavailable (${errorMsg}). Command text: "${text}"`,
    };
  }
}
