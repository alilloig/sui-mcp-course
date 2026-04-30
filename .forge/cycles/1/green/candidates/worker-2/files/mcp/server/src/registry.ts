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

  // Filter to only subdirectories, skipping files silently
  const dirEntries = entries.filter((e) => e.isDirectory());

  if (dirEntries.length === 0) {
    return {
      paths: [],
      warnings: [
        {
          kind: 'empty-paths-dir',
          message: `No path directories found under: ${scanRoot}`,
        },
      ],
    };
  }

  const paths: PathInfo[] = [];
  const warnings: RegistryWarning[] = [];

  for (const entry of dirEntries) {
    const dirPath = path.join(scanRoot, entry.name);
    const pathJsonFile = path.join(dirPath, 'path.json');

    // Check path.json exists
    if (!fs.existsSync(pathJsonFile)) {
      warnings.push({
        kind: 'missing-path-json',
        message: `Missing path.json in directory: ${dirPath}`,
        path: dirPath,
      });
      continue;
    }

    // Read and parse path.json
    let raw: string;
    try {
      raw = fs.readFileSync(pathJsonFile, 'utf8');
    } catch (err) {
      warnings.push({
        kind: 'malformed-path-json',
        message: `Failed to read path.json: ${String(err)}`,
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
        message: `Failed to parse path.json: ${String(err)}`,
        path: pathJsonFile,
      });
      continue;
    }

    // Validate schema
    const validation = validatePath(parsed);
    if (!validation.ok) {
      warnings.push({
        kind: 'schema-invalid-path-json',
        message: `path.json failed schema validation: ${validation.error}`,
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
