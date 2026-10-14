const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getStatus } = require('../../util/repoUtils');
const { confirm } = require('../../util/confirm');

async function cleanup() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const status = await getStatus(cwd);
    const candidates = status.filter((line) => line[0] === '?' || /[MD]/.test(line.slice(0, 2)));
    if (candidates.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: Nothing to clean up.');
      return;
    }

    const items = candidates.map((line) => ({
      label: line.slice(3).trim(),
      description: line.slice(0, 2),
      untracked: line.startsWith('??'),
    }));

    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select untracked/modified files to remove or discard',
    });
    if (!picked || picked.length === 0) return;

    const choice = await confirm(
      `Permanently remove/discard ${picked.length} file(s)? This cannot be undone.`
    );
    if (choice !== 'Yes') return;

    const untrackedFiles = picked.filter((p) => p.untracked).map((p) => p.label);
    const trackedFiles = picked.filter((p) => !p.untracked).map((p) => p.label);

    if (untrackedFiles.length > 0) {
      await git(['clean', '-fd', '--', ...untrackedFiles], cwd);
    }
    if (trackedFiles.length > 0) {
      await git(['restore', '--', ...trackedFiles], cwd);
    }

    vscode.window.showInformationMessage(`GitBuddy: Cleaned up ${picked.length} file(s).`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Cleanup failed — ${e.message}`);
  }
}

module.exports = { cleanup };
