# action-generate-tarball

Generate a `.tar.gz` archive in GitHub Actions.

```yaml
- uses: skaji/action-generate-tarball@v1
```

This archives the contents of the action working directory, creates a `.tar.gz`
file named after that directory, and stores files under the same top-level
directory name in the archive.

The gzip compression level is fixed at `9`. TAR archives are generated with
`node-tar` using USTAR-compatible headers and `noPax: true`. Paths, symlink
targets, or file sizes that would require pax extended headers fail before the
tarball is written.

## Inputs

### `top-directory`

Optional. Top-level directory name inside the archive. Defaults to the basename
of `source-directory`. If `output` is omitted, the generated file is
`<top-directory>.tar.gz`.

### `output`

Optional. Path to the tarball to create. Relative paths are resolved from the
action working directory, not from `source-directory`.

### `source-directory`

Optional. Directory whose contents are archived. Defaults to the current working
directory.

### `exclude`

Optional. Newline-separated JavaScript regular expressions. Each expression is
tested against Linux-style relative paths from `source-directory`.

```yaml
- uses: skaji/action-generate-tarball@v1
  with:
    source-directory: foo
    exclude: |
      ^\.git/
      ^node_modules/
      \.log$
```

## Outputs

### `tarball`

Absolute path to the generated `.tar.gz` file.
