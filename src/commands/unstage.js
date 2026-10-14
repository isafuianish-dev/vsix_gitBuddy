const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getStatus } = require('../../util/repoUtils');

async function unstageFiles() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const status = await getStatus(cwd);
    const staged = status.filter((line) => line[0] !== ' ' && line[0] !== '?');
    if (staged.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: No staged files to unstage.');
      return;
    }

    const items = staged.map((line) => {
      const xy = line.slice(0, 2);
      const file = line.slice(3).trim();
      return { label: file, description: xy, picked: false };
    });

    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select files to unstage',
    });
    if (!picked || picked.length === 0) return;

    await git(['restore', '--staged', ...picked.map((p) => p.label)], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Unstaged ${picked.length} file(s).`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Unstage failed — ${e.message}`);
  }
}

module.exports = { unstageFiles };
