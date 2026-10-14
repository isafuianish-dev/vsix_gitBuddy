const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo, getCurrentBranch } = require('../../util/repoUtils');
const vscodeConfig = () => vscode.workspace.getConfiguration('gitbuddy');

async function pull() {
  const cwd = await requireRepo();
  if (!cwd) return;
  try {
    const out = await git(['pull'], cwd);
    vscode.window.showInformationMessage(`GitBuddy: Pull complete. ${out || ''}`.trim());
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Pull failed — ${e.message}`);
  }
}

async function push() {
  const cwd = await requireRepo();
  if (!cwd) return;
  const remote = vscodeConfig().get('defaultRemote', 'origin');
  try {
    try {
      await git(['push'], cwd);
    } catch (e) {
      if (/no upstream branch|set-upstream/i.test(e.message)) {
        const branch = await getCurrentBranch(cwd);
        await git(['push', '--set-upstream', remote, branch], cwd);
      } else {
        throw e;
      }
    }
    vscode.window.showInformationMessage('GitBuddy: Push complete.');
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Push failed — ${e.message}`);
  }
}

async function fetchAll() {
  const cwd = await requireRepo();
  if (!cwd) return;
  try {
    await git(['fetch', '--all', '--prune'], cwd);
    vscode.window.showInformationMessage('GitBuddy: Fetched all remotes.');
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Fetch failed — ${e.message}`);
  }
}

module.exports = { pull, push, fetchAll };
