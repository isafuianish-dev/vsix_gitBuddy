# Git Buddy

A complete Git & GitHub workflow companion in the sidebar: a live status dashboard, one-click
actions for the everyday Git commands, and full webview panels for pull requests, commit history,
file history, changed-file reports, and a SQL migration validator. Uses only the built-in `vscode`
API and Node's `child_process` / `fetch` — no npm dependencies, no bundler.

## Install

### macOS

```bash
curl -L -o git-buddy.vsix https://raw.githubusercontent.com/isafuianish-dev/vsix_gitBuddy/master/build/git-buddy.vsix
code --install-extension git-buddy.vsix
```

Using [VSCodium](https://vscodium.com) instead of VS Code, swap `code` for `codium`:

```bash
codium --install-extension git-buddy.vsix
```

### Windows

```powershell
curl.exe -L -o git-buddy.vsix https://raw.githubusercontent.com/isafuianish-dev/vsix_gitBuddy/master/build/git-buddy.vsix
code --install-extension git-buddy.vsix
```

Using VSCodium instead of VS Code, swap `code` for `codium`:

```powershell
codium --install-extension git-buddy.vsix
```

## Setup

Open a folder that is a Git repository. Press F5 (or use the "Run Git Buddy Extension" launch
config) to try it in an Extension Development Host. The Git Buddy icon appears in the Activity Bar
of every workspace.

Pull request features talk to the GitHub REST API and need a Personal Access Token — run
`Git Buddy: Update GitHub API Token` (Command Palette) once to store it in VS Code's SecretStorage.

## What it does

- **Sidebar dashboard**: current branch, working-tree status tiles (modified / added / deleted /
  renamed / untracked), an ahead/behind sync count, and a keyboard-navigable action menu grouped
  by Repository, Branches, Change & Commit, Log & Search, and Utilities. Title-bar-style buttons
  for Settings, Copy branch name, Refresh, and Git Log sit in the dashboard header.
- **Branches**: clone, checkout (local / remote), create, rename, cleanup merged branches.
- **Staging & commits**: stage / unstage files, commit with a template, amend, restore, stash /
  pop, tag.
- **Pull requests**: list, filter, search, view commits & review status, create, and merge PRs
  from inside a webview panel.
- **History & reports**: a full git log explorer with file-tree diffs, per-file history with a
  diff viewer, and a cross-branch "changed files" report.
- **SQL migration validator**: checks migration file naming / content conventions and detects
  sequence conflicts across local and remote branches.
- **Focus shortcut**: `Ctrl+Alt+G` focuses the sidebar and enables the single-letter action
  hotkeys shown on each menu item.

## Settings

| Setting | Default | Description |
|---|---|---|
| `gitbuddy.defaultRemote` | `origin` | Default remote used for push / pull / fetch. |
| `gitbuddy.ignoreSslErrors` | `false` | Disable SSL certificate verification for GitHub API calls (useful behind corporate proxies). |

## GitHub token

PR features need a GitHub token with `repo` scope. It's kept in VS Code's SecretStorage, not on
disk — set or replace it with `Git Buddy: Update GitHub API Token`, or from the Settings button in
the dashboard header.

## Layout

- `extension.js` — activation entry point, registers the sidebar view and every command.
- `src/gitViewProvider.js` — the sidebar webview view: HTML shell, live status polling, and the
  action menu.
- `src/commands/` — one module per command group (branch, commit, stash, pull request, …), all
  plain functions with no shared state.
- `util/` — plain Node helpers with no `vscode` UI dependency: `exec.js` (git runner),
  `repoUtils.js`, `githubApi.js`, `outputLog.js`, `spinner.js`, `confirm.js`.
- `webview/` — the sidebar's `main.css` / `main.js` front end, plus the editor-tab panels
  (PR list, git log, file history, changed files, migration validator) and their shared
  `sharedStyles.js` / `svgIcons.js`.
- `media/` — Activity Bar icon.
