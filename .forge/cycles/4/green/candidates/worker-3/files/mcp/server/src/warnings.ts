// Unified discriminated-union of all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018, cycle-3 carry-forwards R1-003/R2-001/M002.

// Legacy kind aliases — kept for backward compatibility with cycle-1/2 fixtures and T-171.
// These were the kind strings used by the old PathMalformedWarning / PathsEmptyWarning /
// PathsMissingWarning interfaces before cycle 4's discriminated-union tightening.
// They map to: 'path-malformed' -> 'malformed-path-json', 'paths-empty' -> 'empty-paths-dir',
// 'paths-missing' -> 'no-paths-dir'. New code must use the eight canonical registry kinds.
/** @deprecated Use 'malformed-path-json' instead */
export type LegacyPathMalformedKind = 'path-malformed';
/** @deprecated Use 'empty-paths-dir' instead */
export type LegacyPathsEmptyKind = 'paths-empty';
/** @deprecated Use 'no-paths-dir' instead */
export type LegacyPathsMissingKind = 'paths-missing';

// Registry warnings — true discriminated union of eight literal kinds.
export type RegistryWarning =
  | { kind: 'no-paths-dir'; message: string; path?: string; dir?: string }
  | { kind: 'empty-paths-dir'; message: string; path?: string; dir?: string }
  | { kind: 'missing-path-json'; message: string; path?: string; dir?: string }
  | { kind: 'malformed-path-json'; message: string; path?: string; dir?: string }
  | { kind: 'invalid-path-json'; message: string; path?: string; dir?: string }
  | { kind: 'missing-phases-json'; message: string; path?: string; dir?: string }
  | { kind: 'malformed-phases-json'; message: string; path?: string; dir?: string }
  | { kind: 'invalid-phases-json'; message: string; path?: string; dir?: string };

// State warnings (formerly local to tools/start.ts)
export interface StateCorruptWarning {
  kind: 'state-corrupt';
  message: string;
  archivedTo?: string;
}

export interface StateSchemaMismatchWarning {
  kind: 'state-schema-mismatch';
  message: string;
  foundVersion?: number;
}

export type StateWarning = StateCorruptWarning | StateSchemaMismatchWarning;

// Output style warnings (from outputStyle.ts)
export interface SettingsFileMissingWarning {
  kind: 'settings-file-missing';
  message: string;
}

export interface SettingsParseErrorWarning {
  kind: 'settings-parse-error';
  message: string;
}

export interface LearningOutputStyleDisabledWarning {
  kind: 'learning-output-style-disabled';
  message: string;
}

// Preflight warnings (new in cycle 3)
export interface PreflightFailWarning {
  kind: 'preflight-fail';
  message: string;
  probeId?: string;
}

export interface PreflightDeployPreconditionFailedWarning {
  kind: 'preflight-deploy-precondition-failed';
  message: string;
  probeId: string;
}

export interface PreflightDeployTimeoutWarning {
  kind: 'preflight-deploy-timeout';
  message: string;
  logs?: string[];
}

export type PreflightWarning =
  | PreflightFailWarning
  | PreflightDeployPreconditionFailedWarning
  | PreflightDeployTimeoutWarning;

// Phase-engine warnings (new in cycle 4)
export interface PhaseEngineLoadFailedWarning {
  kind: 'phase-engine-phases-load-failed';
  message: string;
  slug: string;
  reason: string;
}

export interface PersonalizationValidationFailedWarning {
  kind: 'personalization-validation-failed';
  message: string;
  errors: string[];
}

export interface VerificationModeUnsupportedWarning {
  kind: 'verification-mode-unsupported';
  message: string;
  mode: string;
}

export type PhaseEngineWarning =
  | PhaseEngineLoadFailedWarning
  | PersonalizationValidationFailedWarning
  | VerificationModeUnsupportedWarning;

// The full discriminated union
export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | SettingsFileMissingWarning
  | SettingsParseErrorWarning
  | LearningOutputStyleDisabledWarning
  | PreflightWarning
  | PhaseEngineWarning;
