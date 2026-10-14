const vscode = require('vscode');
const { git } = require('./exec');

/**
 * Returns the top-level directory of the repo containing the first workspace folder,
 * or null if there is no workspace / not a git repo.
 */
async function getRepoRoot() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  const cwd = folders[0].uri.fsPath;
  try {
    const root = await git(['rev-parse', '--show-toplevel'], cwd);
    return root;
  } catch (e) {
    return null;
  }
}

/**
 * Like getRepoRoot but shows an error message and returns null on failure.
 */
async function requireRepo() {
  const root = await getRepoRoot();
  if (!root) {
    vscode.window.showErrorMessage('GitBuddy: No Git repository found in the current workspace.');
    return null;
  }
  return root;
}

async function getCurrentBranch(cwd) {
  // symbolic-ref works even on an unborn branch (fresh repo, no commits);
  // rev-parse --abbrev-ref HEAD does not.
  try {
    return await git(['symbolic-ref', '--short', 'HEAD'], cwd);
  } catch (e) {
    // Detached HEAD — fall back to the short commit hash.
    try {
      return await git(['rev-parse', '--short', 'HEAD'], cwd);
    } catch (e2) {
      return 'HEAD';
    }
  }
}

async function getLocalBranches(cwd) {
  const out = await git(['branch', '--format=%(refname:short)'], cwd);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function getRemoteBranches(cwd) {
  const out = await git(['branch', '-r'], cwd);
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.includes(' -> '));
}

async function getStashes(cwd) {
  try {
    const out = await git(['stash', 'list'], cwd);
    return out.split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function getStatus(cwd) {
  const out = await git(['status', '--porcelain', '-u'], cwd);
  return out.split('\n').filter(Boolean);
}

module.exports = {
  getRepoRoot,
  requireRepo,
  getCurrentBranch,
  getLocalBranches,
  getRemoteBranches,
  getStashes,
  getStatus,
};
