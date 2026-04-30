import * as fs from 'node:fs';
import * as path from 'node:path';
import { validatePath } from './schemas/path.js';

export interface PathInfo {
  slug: string;
  title: string;
  summary: string;
  personalization_options: string[];
  build_command: string;
}

export interface RegistryWarning {
  kind: string;
  message: string;
  path?: string;
  dir?: string;
}

export interface RegistryResult {
  paths: PathInfo[];
  warnings: RegistryWarning[];
}

export async function scanRegistry(scanRoot: string): Promise<RegistryResult> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(scanRoot, { withFileTypes: true });
  } catch {
    return {
      paths: [],
      warnings: [
        {
          kind: 'no-paths-dir',
          message: `Paths directory not found: ${scanRoot}`,
        },
      ],
    };
  }

  // Filter out non-directory entries silently
  const dirEntries = entries.filter((e) => e.isDirectory());

  if (dirEntries.length === 0) {
    return {
      paths: [],
      warnings: [
        {
          kind: 'empty-paths-dir',
          message: `Paths directory exists but contains no path subdirectories: ${scanRoot}`,
        },
      ],
    };
  }

  const paths: PathInfo[] = [];
  const warnings: RegistryWarning[] = [];

  for (const entry of dirEntries) {
    const slugDir = path.join(scanRoot, entry.name);
    const pathJsonFile = path.join(slugDir, 'path.json');

    // Check if path.json exists
    if (!fs.existsSync(pathJsonFile)) {
      warnings.push({
        kind: 'missing-path-json',
        message: `No path.json found in ${slugDir}`,
        path: slugDir,
      });
      continue;
    }

    // Try to read and parse path.json
    let raw: string;
    try {
      raw = fs.readFileSync(pathJsonFile, 'utf8');
    } catch (err) {
      warnings.push({
        kind: 'malformed-path-json',
        message: `Failed to read ${pathJsonFile}: ${err instanceof Error ? err.message : String(err)}`,
        path: pathJsonFile,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      warnings.push({
        kind: 'malformed-path-json',
        message: `Failed to parse ${pathJsonFile}: ${err instanceof Error ? err.message : String(err)}`,
        path: pathJsonFile,
      });
      continue;
    }

    // Validate schema
    const validation = validatePath(parsed);
    if (!validation.ok) {
      warnings.push({
        kind: 'invalid-path-json',
        message: `Schema validation failed for ${pathJsonFile}: ${validation.error}`,
        path: pathJsonFile,
      });
      continue;
    }

    paths.push({
      slug: validation.value.slug,
      title: validation.value.title,
      summary: validation.value.summary,
      personalization_options: validation.value.personalization_options,
      build_command: validation.value.build_command,
    });
  }

  return { paths, warnings };
}
