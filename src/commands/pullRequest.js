const vscode = require('vscode');
const { git } = require('../../util/exec');
const { requireRepo } = require('../../util/repoUtils');
const { parseOwnerRepo, getCurrentUser } = require('../../util/githubApi');
const PrListPanel = require('../../webview/prListPanel');

const TOKEN_KEY = 'gitbuddy.githubToken';

async function setupPrContext(context) {
  const cwd = await requireRepo();
  if (!cwd) return null;

  const token = await context.secrets.get(TOKEN_KEY);
  if (!token) {
    const choice = await vscode.window.showErrorMessage(
      'GitBuddy: No GitHub token configured. Run "GitBuddy: Update GitHub API Token" first.',
      'Set Token'
    );
    if (choice === 'Set Token') {
      await vscode.commands.executeCommand('gitbuddy.updateGitHubApiToken');
    }
    return null;
  }

  let remoteUrl;
  try {
    remoteUrl = await git(['remote', 'get-url', 'origin'], cwd);
  } catch (e) {
    vscode.window.showErrorMessage('GitBuddy: No "origin" remote configured for this repository.');
    return null;
  }

  const parsed = parseOwnerRepo(remoteUrl);
  if (!parsed) {
    vscode.window.showErrorMessage('GitBuddy: Could not determine GitHub owner/repo from the origin remote.');
    return null;
  }

  let currentUser = null;
  try {
    currentUser = await getCurrentUser(token);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: GitHub authentication failed — ${e.message}`);
    return null;
  }

  return { cwd, token, owner: parsed.owner, repo: parsed.repo, currentUser };
}

async function showPullRequests(context) {
  const ctx = await setupPrContext(context);
  if (!ctx) return;
  PrListPanel.show(context, ctx);
}

async function createPullRequest(context) {
  const ctx = await setupPrContext(context);
  if (!ctx) return;
  PrListPanel.show(context, ctx, { openCreateModal: true });
}

module.exports = { showPullRequests, createPullRequest };
