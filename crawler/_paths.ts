import path from 'path';

/**
 * Project root: directory containing package.json, two levels up from this file
 * (crawler/_paths.ts -> crawler/ -> project root).
 */
export const projectRoot = path.resolve(__dirname, '..');

/**
 * Resolve a crawler-specific data directory relative to the project root.
 * All crawlers write their JSONL snapshots, seen-id caches, and any other
 * data files under `<projectRoot>/data/<crawler-name>/`.
 *
 * Usage:
 *   import { dataDir } from './_paths';
 *   const dir = dataDir('runsignup');  // -> /abs/path/to/project/data/runsignup
 */
export const dataDir = (sub: string): string => path.join(projectRoot, 'data', sub);
