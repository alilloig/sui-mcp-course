// Unified discriminated-union of all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018, cycle 4 A12 (tighten RegistryWarning).

// Registry warnings — discriminated union of exactly eight kinds (A12)
export interface NoPathsDirWarning {
  kind: 'no-paths-dir';
  message: string;
  path?: string;
  dir?: string;
}

export interface EmptyPathsDirWarning {
  kind: 'empty-paths-dir';
  message: string;
  path?: string;
  dir?: string;
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

export type RegistryWarning =
  | NoPathsDirWarning
  | EmptyPathsDirWarning
  | MissingPathJsonWarning
  | MalformedPathJsonWarning
  | InvalidPathJsonWarning
  | MissingPhasesJsonWarning
  | MalformedPhasesJsonWarning
  | InvalidPhasesJsonWarning;

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

// Phase engine warnings (cycle 4, A12)
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
