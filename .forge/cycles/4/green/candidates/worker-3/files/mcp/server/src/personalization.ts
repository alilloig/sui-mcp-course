// Default values for the orderbook-viewer path parameters.
// These mirror spec.md § Personalization Options.
export const DEFAULT_POLL_INTERVAL_MS = 3000;
export const DEFAULT_POOL_SUBSET = 'both';
export const VALID_POOL_SUBSETS = ['both', 'DEEP_SUI', 'SUI_USDC'] as const;

// DeclaredOptions shape — mirrors what selectPath surfaces to the skill.
// Each entry describes the type and constraints of a personalization option.
export type DeclaredOptionInteger = {
  type: 'integer';
  min: number;
  max: number;
  default: number;
};

export type DeclaredOptionEnum = {
  type: 'enum';
  enum: readonly string[];
  default: string;
};

export type DeclaredOption = DeclaredOptionInteger | DeclaredOptionEnum;

export type DeclaredOptions = Record<string, DeclaredOption>;

export type ValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validate personalization values against declared options.
 * An empty object is valid (the caller applies defaults for absent keys).
 * Unknown keys are rejected. Type and range checks run for provided keys.
 *
 * `declaredOptions` is the object returned by selectPath's personalizationPrompts
 * (keyed by option name, with type/range/enum metadata).
 */
export function validatePersonalizationValues(
  values: Record<string, unknown>,
  declaredOptions: DeclaredOptions,
): ValidationResult {
  const errors: string[] = [];
  const knownKeys = Object.keys(declaredOptions);

  // Reject unknown keys
  for (const key of Object.keys(values)) {
    if (!knownKeys.includes(key)) {
      errors.push(`Unknown personalization key: '${key}'`);
    }
  }

  // Validate each provided key against its declaration
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (!(key in values)) continue;
    const v = values[key];

    if (decl.type === 'integer') {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        errors.push(`${key} must be an integer, got ${typeof v}`);
      } else {
        const min = decl.min;
        const max = decl.max;
        if (v < min || v > max) {
          errors.push(`${key} must be between ${min} and ${max}, got ${v}`);
        }
      }
    } else if (decl.type === 'enum') {
      if (typeof v !== 'string') {
        errors.push(`${key} must be a string, got ${typeof v}`);
      } else {
        const allowed = [...decl.enum];
        if (!allowed.includes(v)) {
          errors.push(`${key} must be one of [${allowed.join(', ')}], got '${v}'`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values };
}

/**
 * Apply default values for any declared options not present in the provided values.
 * Returns a new object with defaults merged in.
 */
export function applyDefaults(
  values: Record<string, unknown>,
  declaredOptions: DeclaredOptions,
): Record<string, unknown> {
  const result = { ...values };
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (!(key in result)) {
      result[key] = decl.default;
    }
  }
  return result;
}

/**
 * Substitute {{ key }} and {{key}} placeholders in a prompt string.
 * This function MUST ONLY be called with prompt text.
 * NEVER pass target_file, target_range, verification.command, or verification.endpoint.
 * Unknown placeholders are left intact.
 */
export function substitutePromptOnly(
  prompt: string,
  values: Record<string, unknown>,
): string {
  return prompt.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (key in values) {
      return String(values[key]);
    }
    return _match;
  });
}
