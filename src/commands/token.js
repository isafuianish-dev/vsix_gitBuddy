const vscode = require('vscode');

const TOKEN_KEY = 'gitbuddy.githubToken';

async function updateToken(context) {
  const value = await vscode.window.showInputBox({
    prompt: 'Enter GitHub Personal Access Token',
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) return;

  if (value === '') {
    await context.secrets.delete(TOKEN_KEY);
    vscode.window.showInformationMessage('GitBuddy: GitHub token cleared.');
    return;
  }

  await context.secrets.store(TOKEN_KEY, value);
  vscode.window.showInformationMessage('GitBuddy: GitHub token saved.');
}

module.exports = { updateToken, TOKEN_KEY };
