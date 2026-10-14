const vscode = require('vscode');
const path = require('path');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

const REC_SEP = '\x00';

function toGithubBaseUrl(remoteUrl) {
  if (!remoteUrl) return null;
  const m = remoteUrl.match(/(?:https?:\/\/|git@)([^/:]+)[/:]([^/]+)\/(.+?)(\.git)?$/);
  if (!m) return null;
  const host = m[1];
  const owner = m[2];
  const repo = m[3];
  return `https://${host}/${owner}/${repo}`;
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Commit log explorer: browse commits in a date range and see which files changed. Not a singleton. */
class FileReportPanel {
  static show(context, cwd) {
    const panel = vscode.window.createWebviewPanel(
      'gitbuddyFileReport',
      'GitBuddy: Commit Log Explorer',
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))] }
    );

    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const after = formatDate(sevenDaysAgo);
    const before = formatDate(new Date(today.getTime() + 24 * 60 * 60 * 1000));

    let githubBaseUrl = null;

    FileReportPanel._resolveGithubBaseUrl(cwd).then((url) => {
      githubBaseUrl = url;
    });

    panel.webview.html = FileReportPanel._buildHtml(context, panel, after, before);

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.command === 'refresh') {
          await FileReportPanel._fetchAndSend(panel, msg.after, msg.before, cwd, githubBaseUrl);
        } else if (msg.command === 'openGitHub') {
          if (githubBaseUrl) vscode.env.openExternal(vscode.Uri.parse(`${githubBaseUrl}/commit/${msg.hash}`));
        } else if (msg.command === 'showCommit') {
          const CommitDetailPanel = require('./commitDetailPanel');
          CommitDetailPanel.show(context, cwd, msg.hash);
        } else if (msg.command === 'openFile') {
          const uri = vscode.Uri.file(path.join(cwd, msg.file));
          await vscode.window.showTextDocument(uri, { preview: true });
        } else if (msg.command === 'showAuthorPicker') {
          const items = msg.authors.map((a) => ({ label: a, picked: (msg.selected || []).includes(a) }));
          const picked = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Filter by author',
          });
          if (picked) {
            panel.webview.postMessage({ command: 'authorPickerResult', authors: picked.map((p) => p.label) });
          }
        }
      } catch (e) {
        panel.webview.postMessage({ command: 'error', message: e.message });
      }
    });

    (async () => {
      githubBaseUrl = await FileReportPanel._resolveGithubBaseUrl(cwd);
      await FileReportPanel._fetchAndSend(panel, after, before, cwd, githubBaseUrl);
    })();

    return panel;
  }

  static async _resolveGithubBaseUrl(cwd) {
    try {
      const remoteUrl = await git(['remote', 'get-url', 'origin'], cwd);
      return toGithubBaseUrl(remoteUrl);
    } catch (e) {
      return null;
    }
  }

  static async _fetchAndSend(panel, after, before, cwd, githubBaseUrl) {
    try {
      const format = `%H${REC_SEP}%an${REC_SEP}%s${REC_SEP}%ad${REC_SEP}%P`;
      const out = await git(
        [
          'log',
          '--all',
          `--pretty=format:${format}`,
          '--date=format:%Y-%m-%dT%H:%M:%S',
          '-m',
          '--name-status',
          `--after=${after}`,
          `--before=${before}`,
        ],
        cwd
      );
      const commits = FileReportPanel._parseCommits(out);
      panel.webview.postMessage({ command: 'data', commits, githubBaseUrl });
    } catch (e) {
      panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _parseCommits(raw) {
    const lines = raw.split('\n');
    const commits = [];
    const seen = new Set();
    let current = null;
    let skipping = false;

    for (const line of lines) {
      if (line.includes(REC_SEP)) {
        const [hash, author, subject, date, parents] = line.split(REC_SEP);
        if (seen.has(hash)) {
          skipping = true;
          current = null;
          continue;
        }
        seen.add(hash);
        skipping = false;
        const parentList = (parents || '').trim().split(/\s+/).filter(Boolean);
        current = {
          hash,
          shortHash: hash.slice(0, 7),
          author,
          subject,
          date,
          isMerge: parentList.length > 1,
          files: [],
        };
        commits.push(current);
        continue;
      }

      if (skipping || !current) continue;
      if (!line.trim()) continue;

      const parts = line.split('\t');
      const status = parts[0];
      const file = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
      if (file) current.files.push({ status: status[0], file });
    }

    return commits;
  }

  static _buildHtml(context, panel, after, before) {
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'webview', 'fileReportScript.js'))
    );

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.toolbar input[type="date"] { width: 130px; }
.commit-row { padding: 8px 12px; border-bottom: 1px solid var(--gb-border); cursor: pointer; }
.commit-row:hover { background: var(--vscode-list-hoverBackground); }
.commit-row.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.commit-row .hash { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; color: var(--gb-dim); }
.commit-row .subject { font-size: 12.5px; font-weight: 600; margin: 2px 0; }
.commit-row .meta { font-size: 11px; color: var(--gb-dim); }
.detail-header { padding: 10px 12px; border-bottom: 1px solid var(--gb-border); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.detail-header .grow { flex: 1; }
.file-tree { padding: 8px 4px; overflow-x: auto; }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="date" id="dateFrom" value="${after}" />
    <span>to</span>
    <input type="date" id="dateTo" value="${before}" />
    <button id="authorBtn">Author Filter</button>
    <button class="pill active" id="mergeToggle">Hide Merges</button>
    <div class="spacer"></div>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
  </div>
  <div class="split">
    <div class="pane-left" id="commitList"></div>
    <div class="resizer" id="resizer"></div>
    <div class="pane-right" id="commitDetail">
      <div class="placeholder">Select a commit to view changed files</div>
    </div>
  </div>
<script>
window.SVG_COPY = ${JSON.stringify(svgIcons.COPY)};
window.SVG_CHECK = ${JSON.stringify(svgIcons.CHECK)};
window.SVG_EXTERNAL_LINK = ${JSON.stringify(svgIcons.EXTERNAL_LINK)};
window.SVG_CHEVRON_RIGHT = ${JSON.stringify(svgIcons.CHEVRON_RIGHT)};
window.SVG_CHEVRON_DOWN = ${JSON.stringify(svgIcons.CHEVRON_DOWN)};
window.SVG_GIT_LOG = ${JSON.stringify(svgIcons.GIT_LOG)};
</script>
<script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

module.exports = FileReportPanel;
