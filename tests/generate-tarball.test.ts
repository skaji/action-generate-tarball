import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createTarball,
  fitsUstarPath,
  GZIP_LEVEL,
  normalizeTopDirectory,
  parseExcludeInput,
} from "../src/action-generate-tarball";

const execFileAsync = promisify(execFile);
const gunzipAsync = promisify(gunzip);

describe("generate tarball", () => {
  it("creates a gzipped tarball with entries under the top directory", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "generate-tarball-"));
    await fsp.mkdir(path.join(dir, "lib"), { recursive: true });
    await fsp.writeFile(path.join(dir, "README.md"), "readme");
    await fsp.writeFile(path.join(dir, "lib", "index.js"), "console.log(1)\n");

    const output = path.join(dir, "foo.tar.gz");
    const result = await createTarball({
      cwd: dir,
      topDirectory: "foo",
      output,
    });

    expect(result.output).toBe(output);
    expect(result.entries).toBe(2);

    const { stdout } = await execFileAsync("tar", ["-tzf", output]);
    expect(stdout.trim().split("\n").sort()).toEqual([
      "foo/README.md",
      "foo/lib/index.js",
    ]);
  });

  it("uses the maximum gzip compression level and ustar headers", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "generate-tarball-"));
    await fsp.writeFile(path.join(dir, "README.md"), "readme");

    const output = path.join(dir, "foo.tar.gz");
    await createTarball({
      cwd: dir,
      topDirectory: "foo",
      output,
    });

    const tar = await gunzipAsync(await fsp.readFile(output));

    expect(GZIP_LEVEL).toBe(9);
    expect(tar.subarray(257, 263).toString()).toBe("ustar\0");
  });

  it("rejects paths that would require pax extended headers", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "generate-tarball-"));
    const longName = `${"a".repeat(101)}.txt`;
    await fsp.writeFile(path.join(dir, longName), "content");

    await expect(
      createTarball({
        cwd: dir,
        topDirectory: "foo",
        output: path.join(dir, "foo.tar.gz"),
      }),
    ).rejects.toThrow("Path requires pax extended header");
  });

  it("checks ustar path limits", () => {
    expect(fitsUstarPath("foo/README.md")).toBe(true);
    expect(fitsUstarPath(`${"a".repeat(155)}/${"b".repeat(100)}`)).toBe(true);
    expect(fitsUstarPath(`${"a".repeat(156)}/${"b".repeat(100)}`)).toBe(false);
    expect(fitsUstarPath(`foo/${"b".repeat(101)}`)).toBe(false);
  });

  it("excludes files matching regular expressions", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "generate-tarball-"));
    await fsp.mkdir(path.join(dir, "dist"), { recursive: true });
    await fsp.writeFile(path.join(dir, "keep.txt"), "keep");
    await fsp.writeFile(path.join(dir, "debug.log"), "log");
    await fsp.writeFile(path.join(dir, "dist", "asset.txt"), "asset");

    const output = path.join(dir, "foo.tar.gz");
    const result = await createTarball({
      cwd: dir,
      topDirectory: "foo",
      output,
      exclude: ["\\.log$", "^dist/"],
    });

    expect(result.entries).toBe(1);

    const { stdout } = await execFileAsync("tar", ["-tzf", output]);
    expect(stdout.trim()).toBe("foo/keep.txt");
  });

  it("resolves relative output paths from the process working directory", async () => {
    const cwd = await fsp.mkdtemp(
      path.join(os.tmpdir(), "generate-tarball-cwd-"),
    );
    const outputDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), "generate-tarball-output-"),
    );
    const oldCwd = process.cwd();

    await fsp.writeFile(path.join(cwd, "README.md"), "readme");

    try {
      process.chdir(outputDir);
      const result = await createTarball({
        cwd,
        topDirectory: "foo",
        output: "foo.tar.gz",
      });

      await expect(fsp.realpath(result.output)).resolves.toBe(
        await fsp.realpath(path.join(outputDir, "foo.tar.gz")),
      );
      await expect(fsp.stat(path.join(cwd, "foo.tar.gz"))).rejects.toThrow();
      await expect(
        fsp.stat(path.join(outputDir, "foo.tar.gz")),
      ).resolves.toBeDefined();
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("parses newline-separated exclude patterns", () => {
    expect(parseExcludeInput("\n\\.log$\r\n^dist/\n")).toEqual([
      "\\.log$",
      "^dist/",
    ]);
  });

  it("requires a single top directory name", () => {
    expect(normalizeTopDirectory(" foo ")).toBe("foo");
    expect(() => normalizeTopDirectory("foo/bar")).toThrow(
      "top-directory must be a single relative directory name",
    );
    expect(() => normalizeTopDirectory("foo\\bar")).toThrow(
      "top-directory must be a single relative directory name",
    );
    expect(() => normalizeTopDirectory("../foo")).toThrow(
      "top-directory must be a single relative directory name",
    );
  });
});
