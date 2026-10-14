const vscode = require('vscode');
const { getCurrentBranch } = require('../util/repoUtils');
const githubApi = require('../util/githubApi');
const sharedStyles = require('./sharedStyles');

/**
 * Legacy standalone create-PR form. Superseded by the modal inside PrListPanel,
 * kept for backwards compatibility.
 */
class PrPanel {
  static async show(context, ctx) {
    const { cwd, token, owner, repo } = ctx;

    const panel = vscode.window.createWebviewPanel(
      'gitbuddyPr',
      'GitBuddy: New Pull Request (legacy)',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const [head, branches] = await Promise.all([
      getCurrentBranch(cwd),
      githubApi.getBranches(owner, repo, token),
    ]);

    panel.webview.html = PrPanel._buildHtml(head, branches);

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'submit') {
        try {
          const pr = await githubApi.createPullRequest(owner, repo, token, {
            title: msg.title,
            body: msg.body,
            head,
            base: msg.base,
            draft: msg.draft,
          });
          const choice = await vscode.window.showInformationMessage(
            `GitBuddy: Created pull request #${pr.number}.`,
            'Open in Browser'
          );
          if (choice === 'Open in Browser') {
            vscode.env.openExternal(vscode.Uri.parse(pr.html_url));
          }
          panel.dispose();
        } catch (e) {
          panel.webview.postMessage({ command: 'error', message: e.message });
        }
      }
    });

    return panel;
  }

  static _buildHtml(head, branches) {
    const options = branches.map((b) => `<option value="${b}">${b}</option>`).join('');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.form { padding: 16px; max-width: 520px; }
.form label { display: block; font-size: 11px; color: var(--gb-dim); margin: 10px 0 4px; }
.form input[type="text"], .form select, .form textarea {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 3px;
  padding: 6px 8px;
  font-size: 12.5px;
  font-family: inherit;
}
.form textarea { min-height: 100px; resize: vertical; }
.char-count { float: right; font-size: 10.5px; color: var(--gb-dim); }
</style>
</head>
<body>
<div class="form">
  <h2>New Pull Request</h2>
  <label>Title <span class="char-count" id="titleCount">0/72</span></label>
  <input type="text" id="title" maxlength="72" />
  <label>From</label>
  <input type="text" value="${head}" disabled />
  <label>Into</label>
  <select id="base">${options}</select>
  <label>Description</label>
  <textarea id="body"></textarea>
  <label style="display:flex; align-items:center; gap:6px;">
    <input type="checkbox" id="draft" style="width:auto;" /> Create as draft
  </label>
  <div class="modal-actions">
    <button class="btn-primary" id="submitBtn">Create Pull Request</button>
  </div>
  <div id="errorBox"></div>
</div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

document.getElementById('title').addEventListener('input', (e) => {
  document.getElementById('titleCount').textContent = e.target.value.length + '/72';
});

document.getElementById('submitBtn').addEventListener('click', () => {
  const title = document.getElementById('title').value.trim();
  const base = document.getElementById('base').value;
  const body = document.getElementById('body').value;
  const draft = document.getElementById('draft').checked;
  if (!title) return;
  if ((base === 'master' || base === 'main') && !window.confirm('Target branch is "' + base + '". Continue?')) return;
  vscode.postMessage({ command: 'submit', title, body, base, draft });
});

window.addEventListener('message', (event) => {
  if (event.data.command === 'error') {
    document.getElementById('errorBox').innerHTML = '<div class="error-banner">' + event.data.message + '</div>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = PrPanel;
