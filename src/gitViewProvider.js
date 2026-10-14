const vscode = require('vscode');
const { git } = require('../util/exec');
const { getRepoRoot, getCurrentBranch, getStatus } = require('../util/repoUtils');
const outputLog = require('../util/outputLog');
const svgIcons = require('../webview/svgIcons');

const VIEW_TYPE = 'gitbuddy.dashboard';

const DANGER_COMMANDS = new Set([
  'gitbuddy.pushChanges',
  'gitbuddy.stageFiles',
  'gitbuddy.unstageFiles',
  'gitbuddy.commitChanges',
  'gitbuddy.amendCommit',
  'gitbuddy.restoreFile',
]);

const ACTIONS = [
  {
    group: 'Repository',
    items: [
      { label: 'Clone Repository', command: 'gitbuddy.cloneRepository', key: 'c' },
      { label: 'Fetch All', command: 'gitbuddy.fetchAll', key: 't' },
      { label: 'Pull Changes', command: 'gitbuddy.pullChanges', key: 'l' },
      { label: 'Push Changes', command: 'gitbuddy.pushChanges', key: 'u' },
      { label: 'Pull Request', command: 'gitbuddy.pullRequest', key: 'p' },
    ],
  },
  {
    group: 'Branches',
    items: [
      { label: 'Checkout Branch', command: 'gitbuddy.checkoutRemote', key: 'o' },
      { label: 'Create New', command: 'gitbuddy.createNew', key: 'n' },
      { label: 'Rename Branch', command: 'gitbuddy.renameBranch', key: 'r' },
    ],
  },
  {
    group: 'Change & Commit',
    items: [
      { label: 'Status', command: 'gitbuddy.status', key: 'q' },
      { label: 'Stage Files', command: 'gitbuddy.stageFiles', key: 's' },
      { label: 'Unstage Files', command: 'gitbuddy.unstageFiles', key: 'x' },
      { label: 'Commit Changes', command: 'gitbuddy.commitChanges', key: 'm' },
      { label: 'Amend Commit', command: 'gitbuddy.amendCommit', key: 'a' },
    ],
  },
  {
    group: 'Log & Search',
    items: [
      { label: 'Commit Logs', command: 'gitbuddy.commitLogs', key: 'f' },
      { label: 'Changed Files', command: 'gitbuddy.changedFiles', key: 'd' },
      { label: 'Commit Details', command: 'gitbuddy.commitDetails', key: 'e' },
      { label: 'File History', command: 'gitbuddy.fileHistory', key: 'i' },
    ],
  },
  {
    group: 'Utilities',
    items: [
      { label: 'Restore File', command: 'gitbuddy.restoreFile', key: 'z' },
      { label: 'Stash Changes', command: 'gitbuddy.stashChanges', key: 'h' },
      { label: 'Stash Pop', command: 'gitbuddy.stashPop', key: 'j' },
      { label: 'Cleanup Files', command: 'gitbuddy.cleanupFiles', key: 'k' },
      { label: 'Cleanup Branches', command: 'gitbuddy.cleanupBranches', key: 'b' },
      { label: 'Create Tag', command: 'gitbuddy.createTag', key: 'g' },
    ],
  },
  {
    group: 'Custom Validation',
    items: [{ label: 'DB Migration', command: 'gitbuddy.validateMigration', key: 'v' }],
  },
];

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

class GitViewProvider {
  constructor(context) {
    this._context = context;
    this._extensionUri = context.extensionUri;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')],
    };
    webviewView.webview.html = this._buildShell(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._pushData();
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === '__ready__') {
        this._pushData();
      } else if (msg.command === '__showLog__') {
        outputLog.show();
      } else if (msg.command === '__refresh__') {
        this._pushData();
      } else if (msg.command === '__settings__') {
        await this._showSettings();
      } else {
        vscode.commands.executeCommand(msg.command);
      }
    });

    vscode.workspace.onDidSaveTextDocument(() => this._pushData());
  }

  async _showSettings() {
    const config = vscode.workspace.getConfiguration('gitbuddy');
    const ignoreSsl = config.get('ignoreSslErrors', false);

    const items = [
      { label: 'Update GitHub API Token', action: 'token' },
      { label: `Ignore SSL Errors: ${ignoreSsl ? 'ON' : 'OFF'}`, action: 'ssl' },
    ];

    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Git Buddy Settings' });
    if (!picked) return;

    if (picked.action === 'token') {
      vscode.commands.executeCommand('gitbuddy.updateGitHubApiToken');
    } else if (picked.action === 'ssl') {
      const newValue = !ignoreSsl;
      await config.update('ignoreSslErrors', newValue, vscode.ConfigurationTarget.Global);
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = newValue ? '0' : '1';
    }
  }

  refresh() {
    this._pushData();
  }

  focus() {
    if (!this._view) return;
    this._view.show(false);
    this._view.webview.postMessage({ command: 'setFocus' });
  }

  async _pushData() {
    if (!this._view) return;

    const cwd = await getRepoRoot();
    if (!cwd) {
      this._view.webview.postMessage({ command: 'update', branch: null });
      return;
    }

    try {
      const [branch, statusLines] = await Promise.all([getCurrentBranch(cwd), getStatus(cwd)]);

      const counts = { modified: 0, added: 0, deleted: 0, renamed: 0, untracked: 0 };
      for (const line of statusLines) {
        const xy = line.slice(0, 2);
        if (xy === '??') {
          counts.untracked += 1;
        } else if (xy.includes('R')) {
          counts.renamed += 1;
        } else if (xy.includes('A')) {
          counts.added += 1;
        } else if (xy.includes('D')) {
          counts.deleted += 1;
        } else if (xy.includes('M')) {
          counts.modified += 1;
        }
      }
      const total = statusLines.length;

      let syncCount = 0;
      let syncLabel = 'Ahead';
      try {
        const ahead = await git(['rev-list', '--count', `origin/${branch}..HEAD`], cwd);
        const behind = await git(['rev-list', '--count', `HEAD..origin/${branch}`], cwd);
        const aheadN = parseInt(ahead, 10) || 0;
        const behindN = parseInt(behind, 10) || 0;
        if (behindN > 0) {
          syncCount = behindN;
          syncLabel = 'Behind';
        } else {
          syncCount = aheadN;
          syncLabel = 'Ahead';
        }
      } catch (e) {
        syncCount = 0;
        syncLabel = 'Ahead';
      }

      this._view.webview.postMessage({
        command: 'update',
        branch,
        counts,
        total,
        syncCount,
        syncLabel,
      });
    } catch (e) {
      outputLog.log('SIDEBAR ERROR', e.message);
      // Don't leave the webview stuck on its "Loading…" placeholder.
      this._view.webview.postMessage({ command: 'update', branch: null });
    }
  }

  _buildShell(webview) {
    const actionsHtml = ACTIONS.map(
      (group, gi) => `
      <div class="action-group">
        <div class="group-header" data-group="${gi}">
          <span class="chevron">${svgIcons.GROUP_CHEVRON}</span>
          <span>${group.group}</span>
        </div>
        <div class="group-items" data-group-items="${gi}">
          ${group.items
            .map(
              (item) => `
            <div class="action-item${DANGER_COMMANDS.has(item.command) ? ' danger' : ''}" data-command="${item.command}" data-key="${item.key}">
              <span class="key-badge">${item.key.toUpperCase()}</span>
              <span class="action-label">${item.label}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>`
    ).join('');

    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Git Buddy</title>
</head>
<body>
  <div class="dashboard" id="dashboard">
    <div class="branch-row" id="branchRow">
      <span class="branch-icon">${svgIcons.BRANCH}</span>
      <span class="branch-name" id="branchName">Loading…</span>
    </div>
    <div class="status-line">
      <span id="statusText" class="dirty">Checking status…</span>
      <span class="spacer"></span>
      <button class="icon-btn" id="settingsBtn" title="Settings">${svgIcons.SETTINGS}</button>
      <button class="icon-btn" id="copyBtn" title="Copy branch name">
        <span class="copy-icon">${svgIcons.COPY}</span>
        <span class="copied-icon">${svgIcons.CHECK}</span>
      </button>
      <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
      <button class="icon-btn" id="logBtn" title="Git Log">${svgIcons.GIT_LOG}</button>
    </div>
    <div class="tiles" id="tiles">
      <div class="tile modified"><div class="n" id="tileModified">0</div><div class="l">Modified</div></div>
      <div class="tile added"><div class="n" id="tileAdded">0</div><div class="l">Added</div></div>
      <div class="tile deleted"><div class="n" id="tileDeleted">0</div><div class="l">Deleted</div></div>
      <div class="tile renamed"><div class="n" id="tileRenamed">0</div><div class="l">Renamed</div></div>
      <div class="tile untracked"><div class="n" id="tileUntracked">0</div><div class="l">Untracked</div></div>
      <div class="tile sync ahead" id="tileSyncWrap"><div class="n" id="tileSync">0</div><div class="l" id="tileSyncLabel">Ahead</div></div>
    </div>
  </div>
  <div class="action-menu" id="actionMenu">${actionsHtml}</div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

module.exports = { GitViewProvider, VIEW_TYPE };
