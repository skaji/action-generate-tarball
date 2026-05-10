import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tar from "tar";

export const GZIP_LEVEL = 9;
export const USTAR_MAX_PATH_BYTES = 256;
export const USTAR_MAX_PATH_PART_BYTES = 100;
export const USTAR_MAX_PREFIX_BYTES = 155;
export const USTAR_MAX_LINKPATH_BYTES = 100;
export const USTAR_MAX_FILE_SIZE = 0o77777777777;

export interface TarballOptions {
  sourceDirectory: string;
  topDirectory?: string;
  output?: string;
  exclude?: string[];
}

export interface TarballResult {
  output: string;
  entries: number;
  bytes: number;
}

export async function createTarball(
  options: TarballOptions,
): Promise<TarballResult> {
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const topDirectory = normalizeTopDirectory(
    options.topDirectory || path.basename(sourceDirectory),
  );
  const output = path.resolve(options.output || `${topDirectory}.tar.gz`);
  const exclude = compileExcludePatterns(options.exclude || []);
  const outputRelative = relativeArchivePath(sourceDirectory, output);

  await fsp.mkdir(path.dirname(output), { recursive: true });

  const entries = await collectEntries({
    root: sourceDirectory,
    dir: sourceDirectory,
    topDirectory,
    exclude,
    outputRelative,
  });

  await tar.create(
    {
      cwd: sourceDirectory,
      file: output,
      gzip: { level: GZIP_LEVEL },
      noMtime: true,
      noPax: true,
      portable: true,
      prefix: topDirectory,
      strict: true,
    },
    entries,
  );

  const stats = await fsp.stat(output);

  return {
    output,
    entries: entries.length,
    bytes: stats.size,
  };
}

export async function run(): Promise<void> {
  try {
    const sourceDirectory = core.getInput("source-directory") || process.cwd();
    const topDirectory = core.getInput("top-directory");
    const output = core.getInput("output");
    const exclude = parseExcludeInput(core.getInput("exclude"));

    const result = await createTarball({
      sourceDirectory,
      topDirectory,
      output,
      exclude,
    });

    core.info(
      `Generated ${result.output} with ${result.entries} entries (${result.bytes} bytes)`,
    );
    core.setOutput("tarball", result.output);
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

export function parseExcludeInput(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function normalizeTopDirectory(input: string): string {
  const normalized = input.trim().replace(/^\/+|\/+$/g, "");

  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("top-directory must be a single relative directory name");
  }

  return normalized;
}

function compileExcludePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error: any) {
      throw new Error(
        `Invalid exclude regular expression ${pattern}: ${error.message}`,
      );
    }
  });
}

interface CollectEntriesOptions {
  root: string;
  dir: string;
  topDirectory: string;
  exclude: RegExp[];
  outputRelative?: string;
}

async function collectEntries(
  options: CollectEntriesOptions,
): Promise<string[]> {
  const entries: string[] = [];
  const dirents = await fsp.readdir(options.dir, { withFileTypes: true });

  for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(options.dir, dirent.name);
    const relativePath = path.relative(options.root, fullPath);

    if (shouldExclude(relativePath, options.exclude, options.outputRelative)) {
      continue;
    }

    const archivePath = `${options.topDirectory}/${relativePath}`;

    if (dirent.isDirectory()) {
      entries.push(
        ...(await collectEntries({
          ...options,
          dir: fullPath,
        })),
      );
    } else if (dirent.isSymbolicLink()) {
      const linkpath = await fsp.readlink(fullPath);
      validateUstarEntry(archivePath, { linkpath });
      entries.push(relativePath);
    } else if (dirent.isFile()) {
      const stats = await fsp.stat(fullPath);
      validateUstarEntry(archivePath, { size: stats.size });
      entries.push(relativePath);
    }
  }

  return entries;
}

interface UstarEntryOptions {
  linkpath?: string;
  size?: number;
}

function validateUstarEntry(
  archivePath: string,
  options: UstarEntryOptions = {},
): void {
  if (!fitsUstarPath(archivePath)) {
    throw new Error(`Path requires pax extended header: ${archivePath}`);
  }

  if (
    options.linkpath !== undefined &&
    Buffer.byteLength(options.linkpath) > USTAR_MAX_LINKPATH_BYTES
  ) {
    throw new Error(`Link path requires pax extended header: ${archivePath}`);
  }

  if (
    options.size !== undefined &&
    (options.size < 0 || options.size > USTAR_MAX_FILE_SIZE)
  ) {
    throw new Error(`File size requires pax extended header: ${archivePath}`);
  }
}

export function fitsUstarPath(archivePath: string): boolean {
  if (Buffer.byteLength(archivePath) <= USTAR_MAX_PATH_PART_BYTES) {
    return true;
  }

  if (Buffer.byteLength(archivePath) > USTAR_MAX_PATH_BYTES) {
    return false;
  }

  const parts = archivePath.split("/");
  for (let index = 1; index < parts.length; index++) {
    const prefix = parts.slice(0, index).join("/");
    const name = parts.slice(index).join("/");

    if (
      Buffer.byteLength(prefix) <= USTAR_MAX_PREFIX_BYTES &&
      Buffer.byteLength(name) <= USTAR_MAX_PATH_PART_BYTES
    ) {
      return true;
    }
  }

  return false;
}

function shouldExclude(
  relativePath: string,
  exclude: RegExp[],
  outputRelative?: string,
): boolean {
  return (
    relativePath === outputRelative ||
    exclude.some((pattern) => pattern.test(relativePath))
  );
}

function relativeArchivePath(root: string, file: string): string | undefined {
  const relative = path.relative(root, file);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative;
}
