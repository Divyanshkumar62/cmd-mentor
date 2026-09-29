import React from 'react';
import { Box, Text } from 'ink';
import { SearchResult } from '../../search/engine.js';
import { SafetyLevel } from '../../types/command.js';
import { describeSource } from '../../output/plain.js';

interface ResultListProps {
  results: SearchResult[];
  selectedIndex: number;
  bookmarkedIds?: Set<string>;
  maxVisibleRows?: number;
  terminalCols?: number;
}

function renderRiskIndicator(level: SafetyLevel) {
  switch (level) {
    case 'informational':
      return (
        <Text color="#60a5fa">
          ● <Text color="#cbd5e1">Info</Text>
        </Text>
      );
    case 'low':
      return (
        <Text color="#34d399">
          ● <Text color="#cbd5e1">Low</Text>
        </Text>
      );
    case 'moderate':
      return (
        <Text color="#fbbf24">
          ● <Text color="#cbd5e1">Mod</Text>
        </Text>
      );
    case 'high':
    case 'restricted':
      return (
        <Text color="#f87171" bold>
          ● High
        </Text>
      );
    default:
      return <Text color="#94a3b8">● {level}</Text>;
  }
}

export const ResultList: React.FC<ResultListProps> = ({
  results,
  selectedIndex,
  bookmarkedIds = new Set(),
  maxVisibleRows = 7,
  terminalCols = 80,
}) => {
  if (results.length === 0) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        paddingY={2}
        borderStyle="single"
        borderColor="#2563eb"
      >
        <Text color="#fbbf24" bold>
          No matching commands found.
        </Text>
        <Text color="#94a3b8">
          Try searching by category (filesystem, git, docker) or simpler keywords.
        </Text>
      </Box>
    );
  }

  const effectiveCols = Math.max(76, terminalCols);
  const indWidth = 4;
  const cmdWidth = 22;
  const shellsWidth = 14;
  const riskWidth = 10;
  // Dynamic description width based on available terminal width
  const descWidth = Math.max(20, effectiveCols - indWidth - cmdWidth - shellsWidth - riskWidth - 14);

  const halfWindow = Math.floor(maxVisibleRows / 2);
  let startIndex = Math.max(0, selectedIndex - halfWindow);
  let endIndex = Math.min(results.length, startIndex + maxVisibleRows);

  if (endIndex - startIndex < maxVisibleRows) {
    startIndex = Math.max(0, endIndex - maxVisibleRows);
  }

  const visibleResults = results.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="#2563eb">
      {/* Table Header */}
      <Box flexDirection="row" paddingX={1}>
        <Box width={indWidth}>
          <Text color="#64748b" bold> </Text>
        </Box>
        <Box width={cmdWidth}>
          <Text color="#cbd5e1" bold>
            COMMAND
          </Text>
        </Box>
        <Box width={descWidth}>
          <Text color="#cbd5e1" bold>
            TITLE / DESCRIPTION
          </Text>
        </Box>
        <Box width={shellsWidth}>
          <Text color="#94a3b8" bold>
            SHELLS
          </Text>
        </Box>
        <Box width={riskWidth}>
          <Text color="#60a5fa" bold>
            RISK
          </Text>
        </Box>
        <Box width={6}>
          <Text color="#94a3b8" bold>
            SRC
          </Text>
        </Box>
      </Box>

      {/* Header divider */}
      <Box paddingX={1}>
        <Text color="#334155">
          {'─'.repeat(Math.min(effectiveCols - 4, 140))}
        </Text>
      </Box>

      {/* Rows */}
      {visibleResults.map((result, idx) => {
        const actualIndex = startIndex + idx;
        const isSelected = actualIndex === selectedIndex;
        const entry = result.entry;
        const isBookmarked = bookmarkedIds.has(entry.id);

        const maxCmdLen = cmdWidth - 3;
        const maxTitleLen = descWidth - 3;
        const commandName =
          entry.name.length > maxCmdLen ? entry.name.slice(0, maxCmdLen - 3) + '...' : entry.name;
        const titleText =
          entry.title.length > maxTitleLen ? entry.title.slice(0, maxTitleLen - 3) + '...' : entry.title;
        const shellsText =
          entry.shells.slice(0, 2).join(',') + (entry.shells.length > 2 ? '...' : '');

        return (
          <Box
            key={entry.id}
            flexDirection="row"
            paddingX={1}
          >
            <Box width={indWidth}>
              <Text bold color={isSelected ? '#38bdf8' : isBookmarked ? '#fbbf24' : '#64748b'}>
                {isSelected ? ' ❯ ' : isBookmarked ? ' ★ ' : '   '}
              </Text>
            </Box>
            <Box width={cmdWidth}>
              <Text bold color={isSelected ? '#f8fafc' : '#38bdf8'}>
                {commandName}
              </Text>
            </Box>
            <Box width={descWidth}>
              <Text color={isSelected ? '#f8fafc' : '#cbd5e1'}>
                {titleText}
              </Text>
            </Box>
            <Box width={shellsWidth}>
              <Text color={isSelected ? '#cbd5e1' : '#64748b'}>
                {shellsText}
              </Text>
            </Box>
            <Box width={riskWidth}>
              {renderRiskIndicator(entry.risk.level)}
            </Box>
            <Box width={6}>
              {describeSource(entry) !== 'bundled' && (
                <Text color="#fbbf24">
                  {describeSource(entry) === 'project' ? 'proj' : 'cust'}
                </Text>
              )}
            </Box>
          </Box>
        );
      })}

      {/* Scroll indicator */}
      {results.length > maxVisibleRows && (
        <Box paddingX={1} justifyContent="center">
          <Text color="#64748b">
            (Showing {startIndex + 1}-{endIndex} of {results.length} commands)
          </Text>
        </Box>
      )}
    </Box>
  );
};
