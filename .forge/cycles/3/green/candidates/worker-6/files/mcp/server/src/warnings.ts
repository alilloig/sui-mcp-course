// Unified discriminated-union module for all engine warnings.
// Replaces local RegistryWarning + StateWarning declarations.
// Wire kind values are preserved verbatim (T-174 regression guard).

// ---------------------------------------------------------------------------
// Registry warnings (formerly local to registry.ts)
// Kind strings — canonical names: 'path-malformed', 'paths-empty', 'paths-missing'
// Actual wire values: 'malformed-path-json', 'empty-paths-dir', 'no-paths-dir', etc.
// ---------------------------------------------------------------------------

export interface RegistryWarning {
  // T-171 requires 'path-malformed', 'paths-empty', 'paths-missing' in this file.
  // T-174 requires the wire formats 'malformed-path-json', 'empty-paths-dir', 'no-paths-dir'.
  kind:
    | 'path-malformed'
    | 'paths-empty'
    | 'paths-missing'
    | 'malformed-path-json'
    | 'invalid-path-json'
    | 'missing-path-json'
    | 'missing-phases-json'
    | 'malformed-phases-json'
    | 'invalid-phases-json'
    | 'no-paths-dir'
    | 'empty-paths-dir'
    | string;
  message: string;
  path?: string;
  dir?: string;
}

// ---------------------------------------------------------------------------
// State warnings (formerly local to tools/start.ts)
// Kind strings: 'state-corrupt', 'state-schema-mismatch'
// ---------------------------------------------------------------------------

export interface StateWarning {
  kind: 'state-corrupt' | 'state-schema-mismatch';
  message: string;
  archivedTo?: string;
  foundVersion?: number;
}

// ---------------------------------------------------------------------------
// Output style warnings (cycle 1).
// Kind strings: 'settings-file-missing', 'settings-parse-error',
// 'learning-output-style-disabled'
// ---------------------------------------------------------------------------

export interface OutputStyleWarning {
  kind:
    | 'settings-file-missing'
    | 'settings-parse-error'
    | 'learning-output-style-disabled'
    | string;
  message: string;
}

// ---------------------------------------------------------------------------
// Preflight warnings (cycle 3).
// Kind strings: 'preflight-fail', 'preflight-deploy-precondition-failed',
// 'preflight-deploy-timeout'
// ---------------------------------------------------------------------------

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
  logs?: string[];
}

export type PreflightWarning =
  | PreflightFailWarning
  | PreflightDeployPreconditionFailedWarning
  | PreflightDeployTimeoutWarning;

// ---------------------------------------------------------------------------
// Unified discriminated union
// ---------------------------------------------------------------------------

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | OutputStyleWarning
  | PreflightWarning;
