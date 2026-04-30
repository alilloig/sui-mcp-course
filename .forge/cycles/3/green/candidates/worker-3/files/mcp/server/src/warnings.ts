// Unified EngineWarning discriminated union.
// Consolidates RegistryWarning, StateWarning, and PreflightWarning into one type.
// Wire kind values preserved verbatim from cycle 1 + cycle 2.

// Registry warning kinds — includes both the spec-level conceptual names and
// the concrete wire values used by scanRegistry.
// Spec-level aliases: 'path-malformed', 'paths-empty', 'paths-missing'
// Concrete wire values: 'malformed-path-json', 'empty-paths-dir', 'no-paths-dir', etc.
export interface RegistryWarning {
  kind:
    // Spec-level conceptual aliases (required by T-171)
    | 'path-malformed'
    | 'paths-empty'
    | 'paths-missing'
    // Concrete wire values used by scanRegistry (required by T-174)
    | 'no-paths-dir'
    | 'empty-paths-dir'
    | 'malformed-path-json'
    | 'missing-path-json'
    | 'invalid-path-json'
    | 'missing-phases-json'
    | 'malformed-phases-json'
    | 'invalid-phases-json';
  message: string;
  path?: string;
  dir?: string;
}

export interface StateWarning {
  kind: 'state-corrupt' | 'state-schema-mismatch';
  message: string;
  archivedTo?: string;
  foundVersion?: number;
}

// Output style warning kinds — required by T-171.
// 'settings-file-missing', 'settings-parse-error', 'learning-output-style-disabled'
export interface OutputStyleWarning {
  kind:
    | 'settings-file-missing'
    | 'settings-parse-error'
    | 'learning-output-style-disabled';
  message: string;
}

// Preflight warning kinds — new in cycle 3.
export interface PreflightFailWarning {
  kind: 'preflight-fail';
  probeId: string;
  message: string;
}

export interface PreflightDeployPreconditionFailedWarning {
  kind: 'preflight-deploy-precondition-failed';
  probeId: string;
  message: string;
}

export interface PreflightDeployTimeoutWarning {
  kind: 'preflight-deploy-timeout';
  message: string;
  logs: string[];
}

export type PreflightWarning =
  | PreflightFailWarning
  | PreflightDeployPreconditionFailedWarning
  | PreflightDeployTimeoutWarning;

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | OutputStyleWarning
  | PreflightWarning;
