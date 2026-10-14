const vscode = require('vscode');
const path = require('path');
const { git } = require('../util/exec');
const { getStatus } = require('../util/repoUtils');
const { confirm } = require('../util/confirm');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

const STATUS_LABELS = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type Changed',
  U: 'Unmerged',
  '?': 'Untracked',
};

function parseStatus(lines) {
  return lines.map((line) => {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3).trim();
    const staged = x !== ' ' && x !== '?';
    const code = x !== ' ' && x !== '?' ? x : y;
    return { file, staged, code, label: STATUS_LABELS[code] || code };
  });
}

class StatusPanel {
  static show(context, cwd, mainProvider) {
    if (StatusPanel._panel) {
      StatusPanel._panel.reveal(vscode.ViewColumn.One);
      StatusPanel._refresh(cwd, mainProvider);
      return StatusPanel._panel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitbuddyStatus',
      'GitBuddy: Status',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = StatusPanel._buildHtml();

    panel.onDidDispose(() => {
      StatusPanel._panel = null;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.command === 'refresh') {
          await StatusPanel._refresh(cwd, mainProvider);
        } else if (msg.command === 'open') {
          const uri = vscode.Uri.file(path.join(cwd, msg.file));
          await vscode.window.showTextDocument(uri, { preview: true });
        } else if (msg.command === 'stage') {
          await git(['add', '--', msg.file], cwd);
          await StatusPanel._refresh(cwd, mainProvider);
        } else if (msg.command === 'unstage') {
          await git(['restore', '--staged', '--', msg.file], cwd);
          await StatusPanel._refresh(cwd, mainProvider);
        } else if (msg.command === 'restore') {
          const choice = await confirm(`Discard local changes to "${msg.file}"?`);
          if (choice === 'Yes') {
            await git(['restore', '--', msg.file], cwd);
            await StatusPanel._refresh(cwd, mainProvider);
          }
        }
      } catch (e) {
        panel.webview.postMessage({ command: 'error', message: e.message });
      }
    });

    StatusPanel._panel = panel;
    StatusPanel._refresh(cwd, mainProvider);
    return panel;
  }

  static async _refresh(cwd, mainProvider) {
    if (!StatusPanel._panel) return;
    try {
      const lines = await getStatus(cwd);
      const files = parseStatus(lines);
      StatusPanel._panel.webview.postMessage({ command: 'data', files });
      if (mainProvider) mainProvider.refresh();
    } catch (e) {
      StatusPanel._panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _buildHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.section-title { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; color: var(--gb-dim); font-weight: 600; }
.file-row { display: flex; align-items: center; padding: 4px 12px; gap: 8px; }
.file-row:hover { background: var(--vscode-list-hoverBackground); }
.file-row .name { flex: 1; font-size: 12.5px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-row .actions { display: flex; gap: 4px; }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>Git Status</strong>
    <div class="spacer"></div>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
  </div>
  <div id="content" style="flex:1; overflow-y:auto;"></div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

document.getElementById('refreshBtn').addEventListener('click', () => {
  vscode.postMessage({ command: 'refresh' });
});

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function row(f) {
  const actions = f.staged
    ? '<button class="unstage-btn" data-file="' + f.file + '">Unstage</button>'
    : '<button class="stage-btn" data-file="' + f.file + '">Stage</button>' +
      (f.code !== '?' ? '<button class="restore-btn" data-file="' + f.file + '">Restore</button>' : '');
  return '<div class="file-row">' +
    '<span class="status-dot ' + f.code + '"></span>' +
    '<span class="name" data-file="' + f.file + '">' + escapeHtml(f.file) + '</span>' +
    '<span class="actions">' + actions + '</span>' +
    '</div>';
}

function render(files) {
  const staged = files.filter(f => f.staged);
  const unstaged = files.filter(f => !f.staged);
  let html = '';
  html += '<div class="section-title">Staged Changes (' + staged.length + ')</div>';
  html += staged.length ? staged.map(row).join('') : '<div class="placeholder" style="height:auto;padding:8px 12px;">No staged changes</div>';
  html += '<div class="section-title">Changes (' + unstaged.length + ')</div>';
  html += unstaged.length ? unstaged.map(row).join('') : '<div class="placeholder" style="height:auto;padding:8px 12px;">No unstaged changes</div>';
  document.getElementById('content').innerHTML = html;

  document.querySelectorAll('.name').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'open', file: el.dataset.file }));
  });
  document.querySelectorAll('.stage-btn').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'stage', file: el.dataset.file }));
  });
  document.querySelectorAll('.unstage-btn').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'unstage', file: el.dataset.file }));
  });
  document.querySelectorAll('.restore-btn').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'restore', file: el.dataset.file }));
  });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'data') render(msg.files);
  else if (msg.command === 'error') {
    document.getElementById('content').innerHTML = '<div class="error-banner">' + escapeHtml(msg.message) + '</div>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = StatusPanel;
