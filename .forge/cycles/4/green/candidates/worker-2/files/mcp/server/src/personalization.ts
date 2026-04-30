// Personalization validation and prompt substitution.
// AC-6.3: substitutePromptOnly is the ONLY function that performs {{ ... }}
// substitution. It operates on prompt strings only.

export interface PersonalizationOptionInteger {
  type: 'integer';
  min: number;
  max: number;
  default: number;
}

export interface PersonalizationOptionEnum {
  type: 'enum';
  enum: readonly string[];
  default: string;
}

export type PersonalizationOptionDecl = PersonalizationOptionInteger | PersonalizationOptionEnum;

export type DeclaredOptions = Record<string, PersonalizationOptionDecl>;

type ValidateResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validate personalization values against declared options.
 * - Accepts empty object (all-defaults path).
 * - Rejects unknown keys.
 * - Validates integer range and enum membership.
 */
export function validatePersonalizationValues(
  values: Record<string, unknown>,
  declaredOptions: DeclaredOptions,
): ValidateResult {
  const errors: string[] = [];

  for (const [key, val] of Object.entries(values)) {
    const decl = declaredOptions[key];
    if (!decl) {
      errors.push(`Unknown personalization key: '${key}'`);
      continue;
    }

    if (decl.type === 'integer') {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push(`${key} must be an integer, got ${typeof val}`);
        continue;
      }
      if (val < decl.min || val > decl.max) {
        errors.push(`${key} must be between ${decl.min} and ${decl.max} (got ${val})`);
      }
    } else if (decl.type === 'enum') {
      if (!decl.enum.includes(val as string)) {
        errors.push(`${key} must be one of [${decl.enum.join(', ')}] (got '${String(val)}')`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values };
}

/**
 * Substitute {{ key }} and {{key}} placeholders in a prompt string.
 * Only substitutes keys present in values; unknown placeholders are left intact.
 * This function MUST ONLY be called on prompt strings — never on target_file,
 * target_range, verification.command, or verification.endpoint.
 */
export function substitutePromptOnly(
  prompt: string,
  values: Record<string, unknown>,
): string {
  return prompt.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return _match;
  });
}
