const vscode = require('vscode');
const path = require('path');
const { git } = require('../../util/exec');

async function cloneRepo() {
  const url = await vscode.window.showInputBox({
    prompt: 'Enter the repository URL to clone',
    placeHolder: 'https://github.com/owner/repo.git',
    ignoreFocusOut: true,
  });
  if (!url) return;

  const dir = await vscode.window.showInputBox({
    prompt: 'Target directory name (optional — leave blank to use the repository name)',
    ignoreFocusOut: true,
  });

  const folders = vscode.workspace.workspaceFolders;
  const cwd = folders && folders.length > 0 ? folders[0].uri.fsPath : require('os').homedir();

  try {
    const args = dir ? ['clone', url, dir] : ['clone', url];
    await git(args, cwd);

    let targetDir = dir;
    if (!targetDir) {
      const base = path.basename(url, '.git');
      targetDir = base;
    }
    const fullPath = path.join(cwd, targetDir);

    const choice = await vscode.window.showInformationMessage(
      `GitBuddy: Cloned repository into "${targetDir}".`,
      'Open Folder'
    );
    if (choice === 'Open Folder') {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(fullPath), true);
    }
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Clone failed — ${e.message}`);
  }
}

module.exports = { cloneRepo };
