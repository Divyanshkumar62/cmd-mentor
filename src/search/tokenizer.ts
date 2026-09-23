const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'from',
  'up',
  'down',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'how',
  'why',
  'what',
  'when',
  'where',
  'who',
  'which',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'my',
  'your',
  'his',
  'her',
  'its',
  'our',
  'their',
  'can',
  'could',
  'should',
  'would',
  'may',
  'might',
  'must',
]);

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return [];
  }

  // Split by whitespace while preserving flag hyphens and path slashes
  const rawTokens = normalized.split(' ');
  const result: string[] = [];

  for (const token of rawTokens) {
    const cleaned = token.replace(/^[.,;!?]+|[.,;!?]+$/g, '');
    if (!cleaned) continue;

    // If it's a stopword, only skip if there are other tokens and it's not a command flag
    if (STOP_WORDS.has(cleaned) && !cleaned.startsWith('-')) {
      continue;
    }

    result.push(cleaned);
  }

  // If all tokens were stopwords (e.g. user queried "how do I"), return the cleaned raw tokens
  if (result.length === 0 && rawTokens.length > 0) {
    return rawTokens.map((t) => t.replace(/^[.,;!?]+|[.,;!?]+$/g, '')).filter(Boolean);
  }

  return result;
}
