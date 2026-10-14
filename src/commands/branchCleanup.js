const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getCurrentBranch } = require('../../util/repoUtils');
const { confirm } = require('../../util/confirm');

const PROTECTED = new Set(['main', 'master']);

async function cleanupBranches() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const current = await getCurrentBranch(cwd);
    const merged = await git(['branch', '--merged'], cwd);
    const candidates = merged
      .split('\n')
      .map((l) => l.replace(/^\*?\s*/, '').trim())
      .filter(Boolean)
      .filter((b) => b !== current && !PROTECTED.has(b));

    if (candidates.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: No merged branches to clean up.');
      return;
    }

    const picked = await vscode.window.showQuickPick(candidates, {
      canPickMany: true,
      placeHolder: 'Select merged branches to delete',
    });
    if (!picked || picked.length === 0) return;

    const choice = await confirm(`Delete ${picked.length} merged branch(es)?`);
    if (choice !== 'Yes') return;

    for (const branch of picked) {
      await git(['branch', '-d', branch], cwd);
    }
    vscode.window.showInformationMessage(`GitBuddy: Deleted ${picked.length} branch(es).`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Branch cleanup failed — ${e.message}`);
  }
}

module.exports = { cleanupBranches };
