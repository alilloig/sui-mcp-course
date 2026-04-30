// Unified discriminated-union of all engine warnings.
// Cycle-4: tightened RegistryWarning to exact 8-kind literal union (A12),
// added 3 phase-engine kinds, dropped orphan interfaces.

// --- Registry warnings (8 literal kinds matching what registry.ts emits) ---

export interface NoPathsDirWarning {
  kind: 'no-paths-dir';
  message: string;
  dir?: string;
}

export interface EmptyPathsDirWarning {
  kind: 'empty-paths-dir';
  message: string;
  dir?: string;
}

export interface MissingPathJsonWarning {
  kind: 'missing-path-json';
  message: string;
  path?: string;
}

export interface MalformedPathJsonWarning {
  kind: 'malformed-path-json';
  message: string;
  path?: string;
}

export interface InvalidPathJsonWarning {
  kind: 'invalid-path-json';
  message: string;
  path?: string;
}

export interface MissingPhasesJsonWarning {
  kind: 'missing-phases-json';
  message: string;
  path?: string;
}

export interface MalformedPhasesJsonWarning {
  kind: 'malformed-phases-json';
  message: string;
  path?: string;
}

export interface InvalidPhasesJsonWarning {
  kind: 'invalid-phases-json';
  message: string;
  path?: string;
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

// --- State warnings ---

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

// --- Output style warnings ---

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

// --- Preflight warnings (3 kinds) ---

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

// --- Phase-engine warnings (3 new kinds for cycle 4) ---

export interface PhaseEnginePhasesLoadFailedWarning {
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
  | PhaseEnginePhasesLoadFailedWarning
  | PersonalizationValidationFailedWarning
  | VerificationModeUnsupportedWarning;

// --- Full discriminated union ---

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | SettingsFileMissingWarning
  | SettingsParseErrorWarning
  | LearningOutputStyleDisabledWarning
  | PreflightWarning
  | PhaseEngineWarning;
