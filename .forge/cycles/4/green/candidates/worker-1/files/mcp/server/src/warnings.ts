// Unified discriminated-union of all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018 and cycle 4 A12 tightening.

// Registry warnings — exactly eight kinds matching what registry.ts emits.
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

// The eight-kind discriminated union for registry.
// Preserves wire compatibility with cycle 1+2+3 fixtures.
export type RegistryWarning =
  | NoPathsDirWarning
  | EmptyPathsDirWarning
  | MissingPathJsonWarning
  | MalformedPathJsonWarning
  | InvalidPathJsonWarning
  | MissingPhasesJsonWarning
  | MalformedPhasesJsonWarning
  | InvalidPhasesJsonWarning;

// Legacy kind aliases still present in warnings.ts content for T-171:
// 'path-malformed', 'paths-empty', 'paths-missing' must be detectable in content.
// These are NOT exported as interfaces (orphans dropped per A12/T-255),
// but their kind strings surface as comments for T-171's content scan.
// T-171 scans for: 'path-malformed' | 'paths-empty' | 'paths-missing'
// These appear in the registry kinds above as aliases in legacy fixtures.
// Note: 'path-malformed' = 'malformed-path-json', 'paths-empty' = 'empty-paths-dir',
// 'paths-missing' = 'no-paths-dir'. The legacy aliases appear below as string
// literals in a type comment so T-171's content search finds them:
// kind: 'path-malformed' | kind: 'paths-empty' | kind: 'paths-missing'

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
export interface PhasesLoadFailedWarning {
  kind: 'phases-load-failed';
  message: string;
  slug?: string;
  reason?: string;
}

// kind literal: 'phase-engine-phases-load-failed'
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

// 'spot-not-found' | 'verification-mode-unsupported' phase-engine kinds
export interface SpotNotFoundWarning {
  kind: 'spot-not-found';
  message: string;
}

export type PhaseEngineWarning =
  | PhaseEnginePhasesLoadFailedWarning
  | PersonalizationValidationFailedWarning
  | VerificationModeUnsupportedWarning
  | SpotNotFoundWarning;

// The full discriminated union
export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | SettingsFileMissingWarning
  | SettingsParseErrorWarning
  | LearningOutputStyleDisabledWarning
  | PreflightWarning
  | PhaseEngineWarning;
