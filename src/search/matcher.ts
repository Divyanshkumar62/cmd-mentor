import { CommandEntry } from '../types/command.js';
import { normalizeQuery, tokenizeQuery } from './tokenizer.js';

export interface MatchScore {
  entry: CommandEntry;
  score: number;
  matchReasons: string[];
}

export function scoreDeterministicMatch(entry: CommandEntry, rawQuery: string): MatchScore {
  const normalized = normalizeQuery(rawQuery);
  const queryTokens = tokenizeQuery(rawQuery);
  let score = 0;
  const matchReasons: string[] = [];

  const entryNameLower = entry.name.toLowerCase();
  const entryTitleLower = entry.title.toLowerCase();
  const entryDescLower = entry.description.toLowerCase();

  // 1. Exact command name match
  if (entryNameLower === normalized) {
    score += 100;
    matchReasons.push('Exact command name match');
  } else if (entryNameLower.startsWith(normalized)) {
    score += 80;
    matchReasons.push('Command name prefix match');
  } else if (entryNameLower.includes(normalized)) {
    score += 60;
    matchReasons.push('Command name contains query');
  }

  // 2. Alias match
  for (const alias of entry.aliases) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower === normalized) {
      score += 75;
      matchReasons.push(`Exact match for task alias: "${alias}"`);
      break;
    } else if (aliasLower.includes(normalized) || normalized.includes(aliasLower)) {
      score += 45;
      matchReasons.push(`Matched task alias: "${alias}"`);
      break;
    }
  }

  // 3. Title match
  if (entryTitleLower === normalized) {
    score += 70;
    matchReasons.push('Exact title match');
  } else if (entryTitleLower.includes(normalized)) {
    score += 50;
    matchReasons.push('Title contains query');
  }

  // 4. Token overlap across title, tags, and description
  let tokenMatches = 0;
  for (const token of queryTokens) {
    if (token.length < 2) continue;

    if (entry.tags.some((t) => t.toLowerCase() === token)) {
      score += 35;
      tokenMatches++;
      matchReasons.push(`Matched tag: "${token}"`);
    } else if (entryTitleLower.includes(token)) {
      score += 25;
      tokenMatches++;
    } else if (entryDescLower.includes(token)) {
      score += 15;
      tokenMatches++;
    }
  }

  // Multi-token query bonus: if all query tokens matched somewhere
  if (queryTokens.length > 1 && tokenMatches >= queryTokens.length) {
    score += 30;
    matchReasons.push('All query terms matched');
  }

  return {
    entry,
    score,
    matchReasons,
  };
}
