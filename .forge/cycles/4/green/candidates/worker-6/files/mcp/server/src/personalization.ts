// Personalization — substitution and validation for phase-engine prompts.
// AC-6.3: substitutePromptOnly is the ONLY substitution surface in the engine.
// It operates on prompt strings only; callers MUST NOT pass target_file,
// target_range, verification.command, or verification.endpoint through it.

export interface IntegerOptionDecl {
  type: 'integer';
  name: string;
  range: { min: number; max: number; default: number };
}

export interface EnumOptionDecl {
  type: 'enum';
  name: string;
  enum: string[];
  default: string;
}

export type OptionDecl = IntegerOptionDecl | EnumOptionDecl;

// The shape expected by tests: a Record keyed by option name.
// selectPath returns the OptionDecl[] array shape; but validatePersonalizationValues
// accepts the Record shape (matching the test's declaredOptions format).
export interface IntegerDeclEntry {
  type: 'integer';
  min: number;
  max: number;
  default: number;
}

export interface EnumDeclEntry {
  type: 'enum';
  enum: string[];
  default: string;
}

export type DeclEntry = IntegerDeclEntry | EnumDeclEntry;
export type DeclaredOptions = Record<string, DeclEntry>;

export type ValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validate that `values` contains only keys from `declaredOptions`, and that
 * each provided value is within the declared range/enum. Unknown keys fail.
 * An empty `values` object is valid (Use defaults path).
 *
 * `declaredOptions` is a Record keyed by option name, with each entry
 * describing the type/range/enum constraints.
 */
export function validatePersonalizationValues(
  values: Record<string, unknown>,
  declaredOptions: DeclaredOptions,
): ValidationResult {
  const errors: string[] = [];

  // Reject unknown keys
  for (const key of Object.keys(values)) {
    if (!Object.prototype.hasOwnProperty.call(declaredOptions, key)) {
      errors.push(`Unknown personalization key: '${key}'`);
    }
  }

  // Validate provided keys
  for (const [key, val] of Object.entries(values)) {
    const decl = declaredOptions[key];
    if (!decl) continue; // already flagged as unknown above

    if (decl.type === 'integer') {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push(`${key}: must be an integer, got ${typeof val}`);
      } else if (val < decl.min || val > decl.max) {
        errors.push(`${key}: value ${val} is out of range [${decl.min}, ${decl.max}]`);
      }
    } else if (decl.type === 'enum') {
      if (typeof val !== 'string') {
        errors.push(`${key}: must be a string enum value, got ${typeof val}`);
      } else if (!decl.enum.includes(val)) {
        errors.push(`${key}: '${val}' is not one of [${decl.enum.join(', ')}]`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}

/**
 * Substitute {{ key }} (with optional surrounding whitespace) placeholders in
 * a prompt string using the provided values. Unknown placeholders are left
 * intact. This function MUST only be called with prompt strings — never with
 * target_file, target_range, verification.command, or verification.endpoint.
 */
export function substitutePromptOnly(
  prompt: string,
  values: Record<string, unknown>,
): string {
  return prompt.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}
