/**
 * In-process stub registry for harness/test scenarios.
 * Allows harness fixtures (withDockerStub, withSuiCliStub) to override
 * probe behavior without spawning real subprocesses or modifying env vars.
 *
 * These stubs are ONLY active during test runs using the in-process harness.
 * They have no effect in production (no stubs are registered).
 */

export interface DockerStub {
  exitCode: number;
}

export interface SuiCliStub {
  version: string;
}

let dockerStub: DockerStub | null = null;
let suiCliStub: SuiCliStub | null = null;

export function setDockerStub(stub: DockerStub | null): void {
  dockerStub = stub;
}

export function getDockerStub(): DockerStub | null {
  return dockerStub;
}

export function setSuiCliStub(stub: SuiCliStub | null): void {
  suiCliStub = stub;
}

export function getSuiCliStub(): SuiCliStub | null {
  return suiCliStub;
}

export function clearAllStubs(): void {
  dockerStub = null;
  suiCliStub = null;
}
