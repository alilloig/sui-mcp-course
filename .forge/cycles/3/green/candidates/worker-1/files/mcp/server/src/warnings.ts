// Unified EngineWarning discriminated union — cycle 3 (C017+C018)
//
// Registry warning kind summary (abbreviated aliases for documentation):
//   path-malformed  → 'malformed-path-json' | 'invalid-path-json' | 'malformed-phases-json' | 'invalid-phases-json'
//   paths-empty     → 'empty-paths-dir'
//   paths-missing   → 'no-paths-dir' | 'missing-path-json' | 'missing-phases-json'
//
// Wire kind values preserved character-for-character from cycle 1+2.

export type RegistryWarning =
  | { kind: 'malformed-path-json'; message: string; path?: string }
  | { kind: 'invalid-path-json'; message: string; path?: string }
  | { kind: 'missing-path-json'; message: string; path?: string; dir?: string }
  | { kind: 'missing-phases-json'; message: string; path?: string; dir?: string }
  | { kind: 'malformed-phases-json'; message: string; path?: string }
  | { kind: 'invalid-phases-json'; message: string; path?: string }
  | { kind: 'empty-paths-dir'; message: string; dir?: string }
  | { kind: 'no-paths-dir'; message: string; dir?: string };

export type StateWarning =
  | { kind: 'state-corrupt'; message: string; archivedTo?: string }
  | { kind: 'state-schema-mismatch'; message: string; foundVersion?: number };

export type OutputStyleWarning =
  | { kind: 'settings-file-missing'; message: string }
  | { kind: 'settings-parse-error'; message: string }
  | { kind: 'learning-output-style-disabled'; message: string };

export type PreflightWarning =
  | { kind: 'preflight-fail'; message: string; probeId: string }
  | { kind: 'preflight-deploy-precondition-failed'; message: string; probeId: string }
  | { kind: 'preflight-deploy-timeout'; message: string; logs?: string[] };

export type EngineWarning =
  | RegistryWarning
  | StateWarning
  | OutputStyleWarning
  | PreflightWarning;
