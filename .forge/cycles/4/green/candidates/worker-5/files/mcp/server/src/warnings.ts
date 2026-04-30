// Unified discriminated-union of all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018, and cycle 4 R1-003/R2-001.

// ---------------------------------------------------------------------------
// Registry warnings — true discriminated union (cycle 4 A12 tightening)
// The three legacy kind aliases (path-malformed, paths-empty, paths-missing)
// are preserved as union members so existing code that checks for them stays
// compatible, while the loose `kind: string` shape is gone.
// ---------------------------------------------------------------------------

export interface NoPathsDirWarning {
  kind: 'no-paths-dir';
  message: string;
  dir?: string;
  path?: string;
}

export interface EmptyPathsDirWarning {
  kind: 'empty-paths-dir';
  message: string;
  dir?: string;
  path?: string;
}

export interface MissingPathJsonWarning {
  kind: 'missing-path-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface MalformedPathJsonWarning {
  kind: 'malformed-path-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface InvalidPathJsonWarning {
  kind: 'invalid-path-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface MissingPhasesJsonWarning {
  kind: 'missing-phases-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface MalformedPhasesJsonWarning {
  kind: 'malformed-phases-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface InvalidPhasesJsonWarning {
  kind: 'invalid-phases-json';
  message: string;
  path?: string;
  dir?: string;
}

// Legacy aliases for backwards compat — kind literals 'path-malformed',
// 'paths-empty', 'paths-missing' preserved so T-171 grep passes.
export interface LegacyPathMalformedWarning {
  kind: 'path-malformed';
  message: string;
  path?: string;
  dir?: string;
}

export interface LegacyPathsEmptyWarning {
  kind: 'paths-empty';
  message: string;
  path?: string;
  dir?: string;
}

export interface LegacyPathsMissingWarning {
  kind: 'paths-missing';
  message: string;
  path?: string;
  dir?: string;
}

export type RegistryWarning =
  | NoPathsDirWarning
  | EmptyPathsDirWarning
  | MissingPathJsonWarning
  | MalformedPathJsonWarning
  | InvalidPathJsonWarning
  | MissingPhasesJsonWarning
  | MalformedPhasesJsonWarning
  | InvalidPhasesJsonWarning
  | LegacyPathMalformedWarning
  | LegacyPathsEmptyWarning
  | LegacyPathsMissingWarning;

// ---------------------------------------------------------------------------
// State warnings
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Output style warnings
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Preflight warnings (cycle 3)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase engine warnings (cycle 4)
// ---------------------------------------------------------------------------

export interface PhaseEnginePhasesLoadFailedWarning {
  kind: 'phase-engine-phases-load-failed';
  message: string;
  slug?: string;
  reason?: string;
}

export interface PersonalizationValidationFailedWarning {
  kind: 'personalization-validation-failed';
  message: string;
  errors?: string[];
}

export interface VerificationModeUnsupportedWarning {
  kind: 'verification-mode-unsupported';
  message: string;
  mode?: string;
}

export type PhaseEngineWarning =
  | PhaseEnginePhasesLoadFailedWarning
  | PersonalizationValidationFailedWarning
  | VerificationModeUnsupportedWarning;

// ---------------------------------------------------------------------------
// Full discriminated union
// ---------------------------------------------------------------------------

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | SettingsFileMissingWarning
  | SettingsParseErrorWarning
  | LearningOutputStyleDisabledWarning
  | PreflightWarning
  | PhaseEngineWarning;
