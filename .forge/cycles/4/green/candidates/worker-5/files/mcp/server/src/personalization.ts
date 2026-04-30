// Personalization module — the ONLY place in the engine that performs
// {{ key }} substitution. See AC-6.3.

export interface IntegerOptionDecl {
  type: 'integer';
  min: number;
  max: number;
  default: number;
}

export interface EnumOptionDecl {
  type: 'enum';
  enum: readonly string[];
  default: string;
}

export type OptionDecl = IntegerOptionDecl | EnumOptionDecl;

export type DeclaredOptions = Record<string, OptionDecl>;

type ValidationSuccess = { ok: true; values: Record<string, unknown> };
type ValidationFailure = { ok: false; errors: string[] };
type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate that the provided values conform to the declared personalization
 * options for the selected path.
 *
 * Returns ok:true with the validated values (same shape as input, no defaults
 * added — the caller merges defaults separately), or ok:false with a list of
 * per-key error messages.
 */
export function validatePersonalizationValues(
  values: Record<string, unknown>,
  declaredOptions: DeclaredOptions,
): ValidationResult {
  const errors: string[] = [];
  const declaredKeys = Object.keys(declaredOptions);

  // Check for unknown keys.
  for (const key of Object.keys(values)) {
    if (!declaredKeys.includes(key)) {
      errors.push(`Unknown personalization key '${key}'. Declared options: ${declaredKeys.join(', ')}`);
    }
  }

  // Check each provided key against its declaration.
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (!(key in values)) {
      // Key not provided — absence is valid (Use defaults path).
      continue;
    }
    const val = values[key];
    if (decl.type === 'integer') {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push(`${key} must be an integer, got ${typeof val}`);
      } else if (val < decl.min || val > decl.max) {
        errors.push(`${key} must be between ${decl.min} and ${decl.max}, got ${val}`);
      }
    } else if (decl.type === 'enum') {
      if (typeof val !== 'string') {
        errors.push(`${key} must be a string enum value, got ${typeof val}`);
      } else if (!(decl.enum as readonly string[]).includes(val)) {
        errors.push(`${key} must be one of [${(decl.enum as readonly string[]).join(', ')}], got '${val}'`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}

/**
 * Resolve {{ key }} and {{key}} placeholders in a prompt string using the
 * provided personalization values.
 *
 * IMPORTANT: This function MUST ONLY be called with a prompt string.
 * It MUST NOT be called with target_file, target_range, verification.command,
 * or verification.endpoint values. See AC-6.3.
 */
export function substitutePromptOnly(
  prompt: string,
  values: Record<string, unknown>,
): string {
  return prompt.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key: string) => {
    if (key in values) {
      return String(values[key]);
    }
    // Unknown placeholder — leave intact.
    return match;
  });
}
