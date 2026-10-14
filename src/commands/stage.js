const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getStatus } = require('../../util/repoUtils');

async function stageFiles() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const status = await getStatus(cwd);
    if (status.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: No changes to stage.');
      return;
    }

    const items = status.map((line) => {
      const xy = line.slice(0, 2);
      const file = line.slice(3).trim();
      return { label: file, description: xy, picked: false };
    });

    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select files to stage',
    });
    if (!picked || picked.length === 0) return;

    await git(['add', ...picked.map((p) => p.label)], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Staged ${picked.length} file(s).`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Stage failed — ${e.message}`);
  }
}

module.exports = { stageFiles };
