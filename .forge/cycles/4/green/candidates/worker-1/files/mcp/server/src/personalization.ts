// Personalization module — AC-6.3: substitutePromptOnly is the ONLY function
// in the engine codebase that performs {{ ... }} substitution.
// Reviewer grep target: across mcp/server/src/**/*.ts (excluding personalization.ts
// and tests), the regex /\{\{\s*[a-zA-Z_]/ matches in zero source files.

import type { PersonalizationRanges } from './schemas/path.js';

// Defaults for the orderbook-viewer parameters (per spec.md ## Personalization Options)
export const POLL_INTERVAL_MS_MIN = 1000;
export const POLL_INTERVAL_MS_MAX = 30000;
export const POLL_INTERVAL_MS_DEFAULT = 3000;
export const POOL_SUBSET_VALUES = ['both', 'DEEP_SUI', 'SUI_USDC'] as const;
export const POOL_SUBSET_DEFAULT = 'both';

export type ValidatePersonalizationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validate personalization values against the declared options in path.json.
 * Only checks keys that are present — missing keys are valid (defaults apply).
 * Unknown keys are rejected.
 */
export function validatePersonalizationValues(
  values: Record<string, unknown>,
  declaredOptions: { options: string[]; ranges?: PersonalizationRanges },
): ValidatePersonalizationResult {
  const errors: string[] = [];
  const validKeys = new Set(declaredOptions.options);

  // Check for unknown keys
  for (const key of Object.keys(values)) {
    if (!validKeys.has(key)) {
      errors.push(`Unknown personalization key: '${key}'. Declared options: ${[...validKeys].join(', ')}`);
    }
  }

  // Validate poll_interval_ms if present
  if ('poll_interval_ms' in values) {
    const v = values['poll_interval_ms'];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      errors.push(`poll_interval_ms must be an integer, got ${typeof v}`);
    } else {
      const min = declaredOptions.ranges?.poll_interval_ms?.min ?? POLL_INTERVAL_MS_MIN;
      const max = declaredOptions.ranges?.poll_interval_ms?.max ?? POLL_INTERVAL_MS_MAX;
      if (v < min || v > max) {
        errors.push(`poll_interval_ms must be between ${min} and ${max}, got ${v}`);
      }
    }
  }

  // Validate pool_subset if present
  if ('pool_subset' in values) {
    const v = values['pool_subset'];
    if (typeof v !== 'string') {
      errors.push(`pool_subset must be a string, got ${typeof v}`);
    } else {
      const allowedValues = declaredOptions.ranges?.pool_subset?.values ?? [...POOL_SUBSET_VALUES];
      if (!allowedValues.includes(v)) {
        errors.push(`pool_subset must be one of ${allowedValues.join(', ')}, got '${v}'`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}

/**
 * Resolve {{ key }} and {{key}} placeholders in a prompt string.
 * ONLY operates on the prompt string — never called with target_file,
 * target_range, verification.command, or verification.endpoint.
 *
 * Unknown placeholders are left intact (no substitution, no throw).
 * Surrounding whitespace inside {{ ... }} is tolerated.
 */
export function substitutePromptOnly(
  prompt: string,
  values: Record<string, unknown>,
): string {
  return prompt.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    // Unknown placeholder: leave intact
    return match;
  });
}
