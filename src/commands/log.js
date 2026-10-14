const vscode = require('vscode');
const { requireRepo } = require('../../util/repoUtils');
const CommitDetailPanel = require('../../webview/commitDetailPanel');

async function showCommit(context) {
  const cwd = await requireRepo();
  if (!cwd) return;

  const hash = await vscode.window.showInputBox({
    prompt: 'Enter a commit hash or ref to inspect',
    placeHolder: 'HEAD, a1b2c3d, ...',
    ignoreFocusOut: true,
  });
  if (!hash) return;

  CommitDetailPanel.show(context, cwd, hash);
}

module.exports = { showCommit };
