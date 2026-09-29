import React from 'react';
import { Box, Text } from 'ink';
import { CommandEntry, SafetyLevel } from '../../types/command.js';

interface DetailViewProps {
  entry: CommandEntry;
  isBookmarked?: boolean;
}

function getRiskDotColor(level: SafetyLevel): string {
  switch (level) {
    case 'informational':
      return '#60a5fa';
    case 'low':
      return '#34d399';
    case 'moderate':
      return '#fbbf24';
    case 'high':
    case 'restricted':
      return '#f87171';
    default:
      return '#94a3b8';
  }
}

function formatRiskLabel(level: SafetyLevel): string {
  switch (level) {
    case 'informational':
      return 'Informational';
    case 'low':
      return 'Low Risk';
    case 'moderate':
      return 'Moderate';
    case 'high':
      return 'High Risk';
    case 'restricted':
      return 'Restricted';
    default:
      return level;
  }
}

export const DetailView: React.FC<DetailViewProps> = ({ entry, isBookmarked }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#2563eb" paddingX={1}>
      {/* Header */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderColor="#334155"
        paddingBottom={1}
      >
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text bold color="#38bdf8">
              Command: {entry.name}
            </Text>
            {isBookmarked && (
              <Text bold color="#fbbf24">
                {' '}[★ Bookmarked]
              </Text>
            )}
          </Box>
          <Text bold color="#f8fafc">
            {entry.title}
          </Text>
          <Text color="#64748b">
            ID: {entry.id}
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Box flexDirection="row">
            <Text color="#94a3b8">Risk: </Text>
            <Text bold color={getRiskDotColor(entry.risk.level)}>
              ● {formatRiskLabel(entry.risk.level)}
            </Text>
          </Box>
          <Box flexDirection="row">
            <Text color="#64748b">Destructive: </Text>
            <Text color={entry.risk.destructive ? '#f87171' : '#94a3b8'} bold={entry.risk.destructive}>
              {entry.risk.destructive ? 'YES' : 'NO'}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Description & Template */}
      <Box flexDirection="column" marginY={1}>
        <Text color="#cbd5e1">
          {entry.description}
        </Text>
        <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="#334155">
          <Text bold color="#60a5fa">
            ${' '}
          </Text>
          <Text bold color="#f8fafc">
            {entry.commandTemplate}
          </Text>
        </Box>
      </Box>

      {/* Compatibility & Metadata */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text color="#64748b">
          Platforms: <Text color="#cbd5e1">{entry.platforms.join(', ')}</Text>
        </Text>
        <Text color="#64748b">
          Shells: <Text color="#cbd5e1">{entry.shells.join(', ')}</Text>
        </Text>
        <Text color="#64748b">
          Category: <Text color="#38bdf8">{entry.category.join(', ')}</Text>
        </Text>
      </Box>

      {/* Flags Section */}
      {entry.flags && entry.flags.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="#cbd5e1">
            Documented Flags:
          </Text>
          {entry.flags.map((flag) => (
            <Box key={flag.name} flexDirection="row" paddingLeft={2}>
              <Box width="14">
                <Text bold color="#38bdf8">
                  {flag.name} {flag.shorthand ? `(${flag.shorthand})` : ''}
                </Text>
              </Box>
              <Text color="#e2e8f0">
                {flag.description}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Examples Section */}
      {entry.examples && entry.examples.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="#cbd5e1">
            Practical Examples:
          </Text>
          {entry.examples.map((ex, i) => (
            <Box key={i} flexDirection="column" paddingLeft={2} marginTop={1}>
              <Text bold color="#60a5fa">
                $ {ex.command}
              </Text>
              <Text color="#94a3b8">
                ↳ {ex.explanation}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Safety & Audit Notes */}
      <Box flexDirection="column" borderStyle="single" borderColor="#334155" paddingX={1}>
        {entry.risk.sideEffects && (
          <Text color="#94a3b8">
            Side Effects: <Text color="#e2e8f0">{entry.risk.sideEffects}</Text>
          </Text>
        )}
        {entry.risk.reversibility && (
          <Text color="#94a3b8">
            Reversibility: <Text color="#e2e8f0">{entry.risk.reversibility}</Text>
          </Text>
        )}
        <Text color="#64748b">
          Audit: {entry.verification.status} on {entry.verification.lastReviewed} ({entry.verification.source})
        </Text>
      </Box>
    </Box>
  );
};
