const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { git } = require('../../util/exec');
const { requireRepo } = require('../../util/repoUtils');

async function editAndAwaitSave(tempFileName, initialContent) {
  const tempPath = path.join(os.tmpdir(), tempFileName);
  fs.writeFileSync(tempPath, initialContent, 'utf8');

  const uri = vscode.Uri.file(tempPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });

  return new Promise((resolve) => {
    let settled = false;
    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.fsPath !== uri.fsPath || settled) return;
      settled = true;
      const message = fs.readFileSync(tempPath, 'utf8');
      cleanup();
      resolve(message);
    });

    const closeSub = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed.uri.fsPath !== uri.fsPath || settled) return;
      settled = true;
      cleanup();
      resolve(null);
    });

    function cleanup() {
      saveSub.dispose();
      closeSub.dispose();
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        // ignore
      }
    }
  });
}

async function commitWithTemplate(context, mainProvider) {
  const cwd = await requireRepo();
  if (!cwd) return;

  const template =
    '\n# Enter your commit message above.\n# Save this file to commit, or close it to cancel.\n';

  const raw = await editAndAwaitSave('gitbuddy-COMMIT_EDITMSG.txt', template);
  if (raw === null) return;

  const message = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
    .trim();

  if (!message) {
    vscode.window.showWarningMessage('GitBuddy: Commit aborted — empty commit message.');
    return;
  }

  try {
    await git(['commit', '-m', message], cwd);
    vscode.window.showInformationMessage('GitBuddy: Commit created.');
    if (mainProvider) mainProvider.refresh();
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Commit failed — ${e.message}`);
  }
}

async function amendCommit(context, mainProvider) {
  const cwd = await requireRepo();
  if (!cwd) return;

  try {
    const lastMessage = await git(['log', '-1', '--format=%B'], cwd);
    const raw = await editAndAwaitSave('gitbuddy-AMEND_EDITMSG.txt', lastMessage);
    if (raw === null) return;

    const message = raw
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n')
      .trim();

    if (!message) {
      vscode.window.showWarningMessage('GitBuddy: Amend aborted — empty commit message.');
      return;
    }

    await git(['commit', '--amend', '-m', message], cwd);
    vscode.window.showInformationMessage('GitBuddy: Commit amended.');
    if (mainProvider) mainProvider.refresh();
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Amend failed — ${e.message}`);
  }
}

module.exports = { commitWithTemplate, amendCommit };
