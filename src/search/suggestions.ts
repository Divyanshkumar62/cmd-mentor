import { CommandEntry } from '../types/command.js';
import { tokenizeQuery } from './tokenizer.js';

export interface ZeroMatchGuidance {
  query: string;
  categories: string[];
  relatedTerms: string[];
}

/**
 * PRD §12.3: when nothing matches, show the user where to look next instead of
 * inventing a command. Related terms are drawn only from tags that actually
 * exist in the knowledge base, ranked by shared character trigrams with the
 * query, so suggestions are always real and locally verifiable.
 */
export function buildZeroMatchGuidance(
  query: string,
  entries: CommandEntry[],
  limit = 8
): ZeroMatchGuidance {
  const categories = Array.from(new Set(entries.flatMap((e) => e.category))).sort();
  const tags = Array.from(new Set(entries.flatMap((e) => e.tags)));
  const tokens = tokenizeQuery(query);

  const scored = tags
    .map((tag) => ({ tag, score: similarity(tag.toLowerCase(), tokens) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((t) => t.tag);

  return { query, categories, relatedTerms: scored };
}

/** Max trigram overlap between a tag and any single query token. */
function similarity(tag: string, tokens: string[]): number {
  let best = 0;
  for (const token of tokens) {
    if (token.length < 3) {
      // Too short for trigrams; fall back to prefix affinity.
      if (tag.startsWith(token)) best = Math.max(best, 0.4);
      continue;
    }
    const a = trigrams(tag);
    const b = trigrams(token);
    if (a.size === 0 || b.size === 0) continue;
    let shared = 0;
    for (const g of b) {
      if (a.has(g)) shared++;
    }
    best = Math.max(best, shared / Math.max(a.size, b.size));
  }
  return best;
}

function trigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= value.length - 3; i++) {
    out.add(value.slice(i, i + 3));
  }
  return out;
}

export function formatZeroMatchGuidance(guidance: ZeroMatchGuidance): string {
  const lines = [
    `No verified command entry matched "${guidance.query}".`,
    '',
    'CmdMentor only reports reviewed offline entries - it will not invent a command.',
  ];

  if (guidance.relatedTerms.length > 0) {
    lines.push('', `Related terms in the knowledge base: ${guidance.relatedTerms.join(', ')}`);
  }

  lines.push('', `Browse by category: ${guidance.categories.join(', ')}`);
  lines.push('', "Try a broader query, e.g. 'cmdmentor search git' or 'cmdmentor search \"copy files\"'.");
  return lines.join('\n');
}
