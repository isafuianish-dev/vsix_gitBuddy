const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getStatus } = require('../../util/repoUtils');
const { confirm } = require('../../util/confirm');

async function restoreFileVersion() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const status = await getStatus(cwd);
    const candidates = status.filter((line) => /[MD]/.test(line.slice(0, 2)));
    if (candidates.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: No modified or deleted files to restore.');
      return;
    }

    const items = candidates.map((line) => ({
      label: line.slice(3).trim(),
      description: line.slice(0, 2),
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a file to restore to its last committed version',
    });
    if (!picked) return;

    const choice = await confirm(
      `Discard local changes to "${picked.label}"? This cannot be undone.`
    );
    if (choice !== 'Yes') return;

    await git(['restore', picked.label], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Restored "${picked.label}".`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Restore failed — ${e.message}`);
  }
}

module.exports = { restoreFileVersion };
