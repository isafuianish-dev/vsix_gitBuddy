const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getStashes } = require('../../util/repoUtils');

async function stashChanges() {
  const cwd = await requireRepo();
  if (!cwd) return;

  const message = await vscode.window.showInputBox({
    prompt: 'Optional stash message',
    ignoreFocusOut: true,
  });

  try {
    const args = message ? ['stash', 'push', '-m', message] : ['stash', 'push'];
    await git(args, cwd);
    vscode.window.showInformationMessage('GitBuddy: Changes stashed.');
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Stash failed — ${e.message}`);
  }
}

async function stashPop() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const stashes = await getStashes(cwd);
    if (stashes.length === 0) {
      vscode.window.showInformationMessage('GitBuddy: No stashes found.');
      return;
    }

    const picked = await vscode.window.showQuickPick(stashes, {
      placeHolder: 'Select a stash to pop',
    });
    if (!picked) return;

    const refMatch = picked.match(/^(stash@\{\d+\})/);
    const ref = refMatch ? refMatch[1] : picked;

    await git(['stash', 'pop', ref], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Popped ${ref}.`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Stash pop failed — ${e.message}`);
  }
}

module.exports = { stashChanges, stashPop };
