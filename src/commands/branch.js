const vscode = require('vscode');
const { git } = require('../../util/exec');
const {
  requireRepo,
  getCurrentBranch,
  getLocalBranches,
  getRemoteBranches,
} = require('../../util/repoUtils');

async function createBranch() {
  const cwd = await requireRepo();
  if (!cwd) return;

  const name = await vscode.window.showInputBox({
    prompt: 'Enter the new branch name',
    ignoreFocusOut: true,
  });
  if (!name) return;

  try {
    await git(['checkout', '-b', name], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Created and switched to branch "${name}".`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Failed to create branch — ${e.message}`);
  }
}

async function checkoutRemoteBranch() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const remoteBranches = await getRemoteBranches(cwd);
    const localBranches = await getLocalBranches(cwd);

    const picked = await vscode.window.showQuickPick(remoteBranches, {
      placeHolder: 'Select a remote branch to checkout',
      matchOnDescription: true,
    });
    if (!picked) return;

    const shortName = picked.replace(/^[^/]+\//, '');
    if (localBranches.includes(shortName)) {
      await git(['checkout', shortName], cwd);
    } else {
      await git(['checkout', '--track', picked], cwd);
    }
    vscode.window.showInformationMessage(`GitBuddy: Checked out "${shortName}".`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Checkout failed — ${e.message}`);
  }
}

async function checkoutLocalBranch() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const branches = await getLocalBranches(cwd);
    const picked = await vscode.window.showQuickPick(branches, {
      placeHolder: 'Select a local branch to checkout',
    });
    if (!picked) return;

    await git(['checkout', picked], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Checked out "${picked}".`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Checkout failed — ${e.message}`);
  }
}

async function renameBranch() {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const current = await getCurrentBranch(cwd);
    const newName = await vscode.window.showInputBox({
      prompt: `Rename branch "${current}" to:`,
      value: current,
      ignoreFocusOut: true,
    });
    if (!newName || newName === current) return;

    await git(['branch', '-m', newName], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Renamed branch to "${newName}".`);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Rename failed — ${e.message}`);
  }
}

module.exports = {
  createBranch,
  checkoutRemoteBranch,
  checkoutLocalBranch,
  renameBranch,
};
