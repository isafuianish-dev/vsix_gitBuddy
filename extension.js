const vscode = require('vscode');

const outputLog = require('./util/outputLog');
const spinner = require('./util/spinner');
const { getRepoRoot } = require('./util/repoUtils');

const { GitViewProvider, VIEW_TYPE } = require('./src/gitViewProvider');

const { cloneRepo } = require('./src/commands/clone');
const { createBranch, checkoutRemoteBranch, checkoutLocalBranch, renameBranch } = require('./src/commands/branch');
const { pull, push, fetchAll } = require('./src/commands/pushPull');
const { stageFiles } = require('./src/commands/stage');
const { unstageFiles } = require('./src/commands/unstage');
const { commitWithTemplate, amendCommit } = require('./src/commands/commit');
const { restoreFileVersion } = require('./src/commands/restore');
const { cleanup } = require('./src/commands/cleanup');
const { cleanupBranches } = require('./src/commands/branchCleanup');
const { stashChanges, stashPop } = require('./src/commands/stash');
const { showCommit } = require('./src/commands/log');
const { fileChangeReport } = require('./src/commands/fileReport');
const { createTag } = require('./src/commands/tag');
const { showPullRequests } = require('./src/commands/pullRequest');
const { fileHistory } = require('./src/commands/fileHistory');
const { showStatus } = require('./src/commands/status');
const { showChangedFiles } = require('./src/commands/changedFiles');
const { updateToken } = require('./src/commands/token');

const GitLogPanel = require('./webview/gitLogPanel');
const ValidateMigrationPanel = require('./webview/validateMigrationPanel');

function activate(context) {
  const config = vscode.workspace.getConfiguration('gitbuddy');
  if (config.get('ignoreSslErrors', false)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  context.subscriptions.push(outputLog.init());
  context.subscriptions.push(spinner.init());

  const mainProvider = new GitViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, mainProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => mainProvider.refresh()));

  const commandMap = [
    ['gitbuddy.cloneRepository', () => cloneRepo()],
    ['gitbuddy.checkoutBranch', () => checkoutRemoteBranch()],
    ['gitbuddy.createNew', () => createBranch()],
    ['gitbuddy.checkoutRemote', () => checkoutRemoteBranch()],
    ['gitbuddy.checkoutLocal', () => checkoutLocalBranch()],
    ['gitbuddy.pullChanges', () => pull()],
    ['gitbuddy.pushChanges', () => push()],
    ['gitbuddy.fetchAll', () => fetchAll()],
    ['gitbuddy.stageFiles', () => stageFiles()],
    ['gitbuddy.unstageFiles', () => unstageFiles()],
    ['gitbuddy.commitChanges', () => commitWithTemplate(context, mainProvider)],
    ['gitbuddy.amendCommit', () => amendCommit(context, mainProvider)],
    ['gitbuddy.restoreFile', () => restoreFileVersion()],
    ['gitbuddy.cleanupFiles', () => cleanup()],
    ['gitbuddy.cleanupBranches', () => cleanupBranches()],
    ['gitbuddy.stashChanges', () => stashChanges()],
    ['gitbuddy.stashPop', () => stashPop()],
    ['gitbuddy.commitDetails', () => showCommit(context)],
    ['gitbuddy.commitLogs', () => fileChangeReport(context)],
    ['gitbuddy.createTag', () => createTag()],
    ['gitbuddy.pullRequest', () => showPullRequests(context)],
    [
      'gitbuddy.showGitLog',
      async () => {
        const cwd = await getRepoRoot();
        if (!cwd) {
          vscode.window.showErrorMessage('GitBuddy: No Git repository found in the current workspace.');
          return;
        }
        GitLogPanel.show(context, cwd);
      },
    ],
    ['gitbuddy.fileHistory', () => fileHistory(context)],
    ['gitbuddy.status', () => showStatus(context, mainProvider)],
    ['gitbuddy.changedFiles', () => showChangedFiles(context)],
    ['gitbuddy.updateGitHubApiToken', () => updateToken(context)],
    ['gitbuddy.renameBranch', () => renameBranch()],
    [
      'gitbuddy.validateMigration',
      async () => {
        const cwd = await getRepoRoot();
        if (!cwd) {
          vscode.window.showErrorMessage('GitBuddy: No Git repository found in the current workspace.');
          return;
        }
        ValidateMigrationPanel.show(context, cwd);
      },
    ],
    ['gitbuddy.focusSidebar', () => mainProvider.focus()],
  ];

  for (const [id, handler] of commandMap) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
