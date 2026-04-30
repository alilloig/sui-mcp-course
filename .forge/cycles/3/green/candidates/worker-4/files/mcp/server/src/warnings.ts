// Unified discriminated-union of all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018.

// Registry warnings (formerly local to registry.ts)
export interface PathMalformedWarning {
  kind: 'path-malformed' | 'malformed-path-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface PathsEmptyWarning {
  kind: 'paths-empty' | 'empty-paths-dir';
  message: string;
  path?: string;
  dir?: string;
}

export interface PathsMissingWarning {
  kind: 'paths-missing' | 'no-paths-dir';
  message: string;
  path?: string;
  dir?: string;
}

export interface RegistryWarning {
  kind: string;
  message: string;
  path?: string;
  dir?: string;
}

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

// The full discriminated union
export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | SettingsFileMissingWarning
  | SettingsParseErrorWarning
  | LearningOutputStyleDisabledWarning
  | PreflightWarning;
