// Unified discriminated-union for all engine warnings.
// Resolves cycle 2 carry-forwards C017+C018.

// ---------------------------------------------------------------------------
// Registry warnings (formerly local to registry.ts)
//
// Documented kind values (wire-stable):
//   'path-malformed', 'paths-empty', 'paths-missing'
//   'no-paths-dir', 'empty-paths-dir', 'malformed-path-json'
//   'missing-path-json', 'invalid-path-json'
//   'missing-phases-json', 'malformed-phases-json', 'invalid-phases-json'
// ---------------------------------------------------------------------------

export interface RegistryWarning {
  kind: string;
  message: string;
  path?: string;
  dir?: string;
}

// ---------------------------------------------------------------------------
// State warnings (formerly local to tools/start.ts)
//
// Wire-stable kind values: 'state-corrupt', 'state-schema-mismatch'
// ---------------------------------------------------------------------------

export interface StateWarning {
  kind: 'state-corrupt' | 'state-schema-mismatch';
  message: string;
  archivedTo?: string;
  foundVersion?: number;
}

// ---------------------------------------------------------------------------
// Output-style / settings warnings
//
// Wire-stable kind values: 'settings-file-missing', 'settings-parse-error',
// 'learning-output-style-disabled'
// ---------------------------------------------------------------------------

export interface OutputStyleWarning {
  kind: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Preflight warnings (new in cycle 3)
//
// Wire-stable kind values: 'preflight-fail',
// 'preflight-deploy-precondition-failed', 'preflight-deploy-timeout'
// ---------------------------------------------------------------------------

export interface PreflightWarning {
  kind:
    | 'preflight-fail'
    | 'preflight-deploy-precondition-failed'
    | 'preflight-deploy-timeout';
  message: string;
  probeId?: string;
  logs?: string[];
}

// ---------------------------------------------------------------------------
// Unified union
// ---------------------------------------------------------------------------

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | OutputStyleWarning
  | PreflightWarning;
