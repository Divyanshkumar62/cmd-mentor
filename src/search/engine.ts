import Fuse from 'fuse.js';
import { CommandEntry } from '../types/command.js';
import { FilterOptions, calculateCompatibilityBoost, filterEntries } from './filters.js';
import { scoreDeterministicMatch } from './matcher.js';
import { normalizeQuery } from './tokenizer.js';

export interface SearchResult {
  entry: CommandEntry;
  score: number;
  matchReasons: string[];
}

export class SearchEngine {
  private entries: CommandEntry[];
  private fuse: Fuse<CommandEntry>;

  constructor(entries: CommandEntry[]) {
    this.entries = entries;
    this.fuse = new Fuse(entries, {
      keys: [
        { name: 'name', weight: 2.5 },
        { name: 'aliases', weight: 2.0 },
        { name: 'title', weight: 1.5 },
        { name: 'tags', weight: 1.2 },
        { name: 'description', weight: 0.8 },
      ],
      threshold: 0.45,
      minMatchCharLength: 2,
      ignoreLocation: true,
      includeScore: true,
    });
  }

  public updateEntries(entries: CommandEntry[]): void {
    this.entries = entries;
    this.fuse.setCollection(entries);
  }

  public search(rawQuery: string, options: FilterOptions = {}): SearchResult[] {
    const normalized = normalizeQuery(rawQuery);
    if (!normalized) {
      const filtered = filterEntries(this.entries, options);
      return filtered.slice(0, 25).map((entry) => ({
        entry,
        score: 1,
        matchReasons: ['Default listing'],
      }));
    }

    const candidateMap = new Map<string, { entry: CommandEntry; score: number; matchReasons: string[] }>();

    // 1. Run deterministic match on all entries
    for (const entry of this.entries) {
      const match = scoreDeterministicMatch(entry, normalized);
      if (match.score > 0) {
        candidateMap.set(entry.id, {
          entry,
          score: match.score,
          matchReasons: match.matchReasons,
        });
      }
    }

    // 2. Run fuzzy search via Fuse.js for typo tolerance
    const fuzzyResults = this.fuse.search(normalized);
    for (const result of fuzzyResults) {
      const entry = result.item;
      // Convert Fuse score (0 = perfect, 1 = mismatch) to 0-60 scale
      const fuseScore = Math.max(0, Math.round((1 - (result.score || 0)) * 60));

      const existing = candidateMap.get(entry.id);
      if (existing) {
        existing.score += Math.round(fuseScore * 0.5);
        if (!existing.matchReasons.some((r) => r.includes('Fuzzy'))) {
          existing.matchReasons.push('Fuzzy match reinforcement');
        }
      } else if (fuseScore >= 20) {
        candidateMap.set(entry.id, {
          entry,
          score: fuseScore,
          matchReasons: ['Fuzzy approximate match'],
        });
      }
    }

    // 3. Apply filters and compatibility boost
    const results: SearchResult[] = [];

    for (const item of candidateMap.values()) {
      if (options.platform && !item.entry.platforms.includes(options.platform)) {
        continue;
      }
      if (options.shell && !item.entry.shells.includes(options.shell)) {
        continue;
      }
      if (options.category && !item.entry.category.includes(options.category)) {
        continue;
      }
      if (options.riskLevel && item.entry.risk.level !== options.riskLevel) {
        continue;
      }

      const boost = calculateCompatibilityBoost(item.entry, options.preferredPlatform, options.preferredShell);
      const totalScore = item.score + boost;

      results.push({
        entry: item.entry,
        score: totalScore,
        matchReasons: item.matchReasons,
      });
    }

    // 4. Sort by score descending, then alphabetically by name
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.entry.name.localeCompare(b.entry.name);
    });

    return results;
  }
}
