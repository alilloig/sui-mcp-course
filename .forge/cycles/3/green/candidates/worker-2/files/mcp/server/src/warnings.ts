// Unified discriminated-union warning types for the engine.
// Resolves cycle-2 carry-forwards C017+C018 by folding RegistryWarning,
// StateWarning, and new PreflightWarning into a single exported type.
//
// Registry wire kinds (character-for-character preserved):
//   path-malformed, paths-empty, paths-missing
//   no-paths-dir, empty-paths-dir, malformed-path-json, invalid-path-json
//   missing-path-json, missing-phases-json, malformed-phases-json, invalid-phases-json
//
// State wire kinds (character-for-character preserved):
//   state-corrupt, state-schema-mismatch
//
// Output style wire kinds (character-for-character preserved):
//   settings-file-missing, settings-parse-error, learning-output-style-disabled
//
// Preflight wire kinds:
//   preflight-fail, preflight-deploy-precondition-failed, preflight-deploy-timeout

export interface RegistryWarning {
  kind: string;
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

export interface OutputStyleWarning {
  kind:
    | 'settings-file-missing'
    | 'settings-parse-error'
    | 'settings-file-malformed'
    | 'learning-output-style-disabled';
  message: string;
}

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

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | OutputStyleWarning
  | PreflightWarning;
