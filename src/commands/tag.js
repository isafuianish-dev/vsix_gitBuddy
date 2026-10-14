const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo } = require('../../util/repoUtils');
const vscodeConfig = () => vscode.workspace.getConfiguration('gitbuddy');

async function createTag() {
  const cwd = await requireRepo();
  if (!cwd) return;

  const name = await vscode.window.showInputBox({
    prompt: 'Tag name',
    placeHolder: 'v1.0.0',
    ignoreFocusOut: true,
  });
  if (!name) return;

  const message = await vscode.window.showInputBox({
    prompt: 'Optional tag message (leave blank for a lightweight tag)',
    ignoreFocusOut: true,
  });

  try {
    if (message) {
      await git(['tag', '-a', name, '-m', message], cwd);
    } else {
      await git(['tag', name], cwd);
    }

    const choice = await vscode.window.showInformationMessage(
      `GitBuddy: Created tag "${name}".`,
      'Push Tag'
    );
    if (choice === 'Push Tag') {
      const remote = vscodeConfig().get('defaultRemote', 'origin');
      await git(['push', remote, name], cwd);
      vscode.window.showInformationMessage(`GitBuddy: Pushed tag "${name}".`);
    }
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Tag creation failed — ${e.message}`);
  }
}

module.exports = { createTag };
