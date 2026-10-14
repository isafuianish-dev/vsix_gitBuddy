const vscode = require('vscode');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

const LOG_FORMAT = '%x01%H%x02%h%x02%an%x02%ad%x02%s%x03';
const LOG_ARGS = ['log', `--pretty=format:${LOG_FORMAT}`, '--date=short', '-n', '300'];

/** Renders raw `git log` output as a styled, coloured panel. Singleton. */
class GitLogPanel {
  static show(context, cwd) {
    if (GitLogPanel._panel) {
      GitLogPanel._panel.reveal(vscode.ViewColumn.One);
      GitLogPanel._load(cwd);
      return GitLogPanel._panel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitbuddyGitLog',
      'GitBuddy: Git Log',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = GitLogPanel._buildHtml();

    panel.onDidDispose(() => {
      GitLogPanel._panel = null;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'refresh') {
        await GitLogPanel._load(cwd);
      } else if (msg.command === 'showCommit') {
        const CommitDetailPanel = require('./commitDetailPanel');
        CommitDetailPanel.show(context, cwd, msg.hash);
      }
    });

    GitLogPanel._panel = panel;
    GitLogPanel._load(cwd);
    return panel;
  }

  static async _load(cwd) {
    if (!GitLogPanel._panel) return;
    try {
      const out = await git(LOG_ARGS, cwd);
      const commits = out
        .split('\x01')
        .filter(Boolean)
        .map((entry) => {
          const [hash, short, author, date, subject] = entry.replace(/\x03$/, '').split('\x02');
          return { hash, short, author, date, subject };
        });
      GitLogPanel._panel.webview.postMessage({ command: 'data', commits });
    } catch (e) {
      GitLogPanel._panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _buildHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.log-line { display: flex; gap: 10px; padding: 3px 12px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; cursor: pointer; }
.log-line:hover { background: var(--vscode-list-hoverBackground); }
.log-line .hash { color: var(--gb-copied); flex-shrink: 0; width: 72px; }
.log-line .date { color: var(--gb-renamed); flex-shrink: 0; width: 90px; }
.log-line .author { color: var(--gb-modified); flex-shrink: 0; width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-line .subject { flex: 1; color: var(--gb-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>Git Log</strong>
    <div class="spacer"></div>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
  </div>
  <div id="content" style="flex:1; overflow-y:auto;"></div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(commits) {
  document.getElementById('content').innerHTML = commits.map(c =>
    '<div class="log-line" data-hash="' + c.hash + '">' +
    '<span class="hash">' + c.short + '</span>' +
    '<span class="date">' + c.date + '</span>' +
    '<span class="author">' + escapeHtml(c.author) + '</span>' +
    '<span class="subject">' + escapeHtml(c.subject) + '</span>' +
    '</div>'
  ).join('');

  document.querySelectorAll('.log-line').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'showCommit', hash: el.dataset.hash }));
  });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'data') render(msg.commits);
  else if (msg.command === 'error') {
    document.getElementById('content').innerHTML = '<div class="error-banner">' + escapeHtml(msg.message) + '</div>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = GitLogPanel;
