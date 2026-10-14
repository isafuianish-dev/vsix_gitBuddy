const vscode = require('vscode');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');

/**
 * Legacy single-commit detail panel (older style, plain-text diff, no syntax colouring).
 * Superseded by CommitDetailPanel — kept for backwards compatibility.
 */
class CommitPanel {
  static async show(context, cwd, hash) {
    const panel = vscode.window.createWebviewPanel(
      'gitbuddyCommit',
      `Commit ${hash.slice(0, 8)} (legacy view)`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    let content;
    try {
      content = await git(['show', '--no-color', hash], cwd);
    } catch (e) {
      content = `Error loading commit: ${e.message}`;
    }

    panel.webview.html = CommitPanel._buildHtml(content);
    return panel;
  }

  static _buildHtml(content) {
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
pre { padding: 12px 16px; margin: 0; white-space: pre-wrap; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
</style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>`;
  }
}

module.exports = CommitPanel;
