const vscode = require('vscode');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

/** Shows the full diff + metadata for a single commit. Not a singleton — one panel per hash. */
class CommitDetailPanel {
  static show(context, cwd, hash) {
    const panel = vscode.window.createWebviewPanel(
      'gitbuddyCommitDetail',
      `Commit ${hash.slice(0, 8)}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = CommitDetailPanel._buildHtml(hash);

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'copy') {
        await vscode.env.clipboard.writeText(msg.text || '');
      }
    });

    CommitDetailPanel._load(panel, cwd, hash);

    return panel;
  }

  static async _load(panel, cwd, hash) {
    try {
      const meta = await git(
        ['show', '-s', '--format=%H%x00%an%x00%ae%x00%ad%x00%s%x00%b', '--date=iso', hash],
        cwd
      );
      const [fullHash, author, email, date, subject, body] = meta.split('\x00');

      const diff = await git(['show', '--no-color', hash], cwd);
      // Strip the header lines already conveyed in meta; keep from first "diff --git" onward.
      const idx = diff.indexOf('diff --git');
      const diffBody = idx >= 0 ? diff.slice(idx) : diff;

      panel.webview.postMessage({
        command: 'data',
        hash: fullHash,
        author,
        email,
        date,
        subject,
        body: (body || '').trim(),
        diff: diffBody,
      });
    } catch (e) {
      panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _buildHtml(hash) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.header { padding: 14px 16px; border-bottom: 1px solid var(--gb-border); }
.header h1 { font-size: 14px; margin: 0 0 4px; }
.header .hash { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; color: var(--gb-dim); }
.header .meta-row { font-size: 12px; color: var(--gb-dim); margin-top: 6px; }
.header .body { margin-top: 8px; font-size: 12.5px; white-space: pre-wrap; }
.diff-container { flex: 1; overflow: auto; padding: 8px 0; }
</style>
</head>
<body>
  <div class="header">
    <h1 id="subject">Loading commit ${hash}…</h1>
    <div class="hash" id="hash"></div>
    <div class="meta-row" id="meta"></div>
    <div class="body" id="body"></div>
    <button class="icon-btn" id="copyBtn" title="Copy hash">${svgIcons.COPY}</button>
  </div>
  <div class="diff-container" id="diff"></div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

let currentHash = '';

document.getElementById('copyBtn').addEventListener('click', () => {
  vscode.postMessage({ command: 'copy', text: currentHash });
});

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDiff(diff) {
  const lines = diff.split('\\n');
  const html = lines.map(line => {
    let cls = '';
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) cls = 'diff-meta';
    else if (line.startsWith('@@')) cls = 'diff-hunk';
    else if (line.startsWith('+')) cls = 'diff-add';
    else if (line.startsWith('-')) cls = 'diff-del';
    return '<div class="diff-line ' + cls + '">' + escapeHtml(line) + '</div>';
  }).join('');
  document.getElementById('diff').innerHTML = html;
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'data') {
    currentHash = msg.hash;
    document.getElementById('subject').textContent = msg.subject;
    document.getElementById('hash').textContent = msg.hash;
    document.getElementById('meta').textContent = msg.author + ' <' + msg.email + '> — ' + msg.date;
    document.getElementById('body').textContent = msg.body;
    renderDiff(msg.diff);
  } else if (msg.command === 'error') {
    document.getElementById('subject').textContent = 'Error loading commit';
    document.getElementById('diff').innerHTML = '<div class="error-banner">' + escapeHtml(msg.message) + '</div>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = CommitDetailPanel;
