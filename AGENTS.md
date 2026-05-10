# Codex Instructions

## Git and GitHub

- Write all git commit messages in English.
- Always add this trailer to every git commit message:

  Co-authored-by: Codex <267193182+codex@users.noreply.github.com>

- Create regular pull requests, not draft pull requests.
- Write pull request titles and descriptions in English.
- Keep pull request descriptions concise. Focus on why the change is being made
  and what outcome is expected, rather than listing everything that changed.
- Do not add section headings such as "Summary" by default.
- Do not include test results in pull request descriptions.

## Release Workflow

When asked to release a version such as `vX.Y.Z`, do the following:

- Update `package.json` and `package-lock.json` to version `X.Y.Z` with
  `npm version X.Y.Z --no-git-tag-version`.
- Add a `CHANGELOG.md` entry for `vX.Y.Z` with the release date and a concise
  bullet list of user-visible changes.
- Run `npm run pre-checkin`.
- Commit the release changes with an English commit message and the required
  `Co-authored-by` trailer.
- Create tag `vX.Y.Z`.
- Move the major tag, such as `v1`, to the same commit with `git tag -f v1`.
- Push `main`, the new `vX.Y.Z` tag, and the updated major tag. Updating the
  major tag requires a force push for that tag only.
- Verify that the remote tags point to the expected commit.
