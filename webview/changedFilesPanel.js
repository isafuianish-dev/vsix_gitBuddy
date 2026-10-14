const vscode = require('vscode');
const path = require('path');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

const REC_SEP = '\x00';

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Cross-branch activity report: which files changed recently, by whom, on which branches. Not a singleton. */
class ChangedFilesPanel {
  static show(context, cwd) {
    const panel = vscode.window.createWebviewPanel(
      'gitbuddyChangedFiles',
      'GitBuddy: Changed Files',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const after = formatDate(sevenDaysAgo);
    const before = formatDate(new Date(today.getTime() + 24 * 60 * 60 * 1000));

    panel.webview.html = ChangedFilesPanel._buildHtml(after, before);

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.command === 'refresh') {
          await ChangedFilesPanel._fetchAndSend(panel, msg.after, msg.before, cwd);
        } else if (msg.command === 'openFile') {
          const uri = vscode.Uri.file(path.join(cwd, msg.file));
          await vscode.window.showTextDocument(uri, { preview: true });
        } else if (msg.command === 'copyHash') {
          await vscode.env.clipboard.writeText(msg.hash || '');
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

    ChangedFilesPanel._fetchAndSend(panel, after, before, cwd);
    return panel;
  }

  static async _fetchAndSend(panel, after, before, cwd) {
    try {
      const format = `%H${REC_SEP}%an${REC_SEP}%ad`;
      const out = await git(
        [
          'log',
          '--all',
          `--pretty=${format}`,
          '-m',
          '--name-status',
          '--date=format:%Y-%m-%dT%H:%M:%S',
          `--after=${after}`,
          `--before=${before}`,
        ],
        cwd
      );

      const fileMap = new Map();
      let currentMeta = null;
      for (const line of out.split('\n')) {
        if (line.includes(REC_SEP)) {
          const [hash, author, date] = line.split(REC_SEP);
          currentMeta = { hash, author, date };
          continue;
        }
        if (!currentMeta || !line.trim()) continue;
        const parts = line.split('\t');
        const status = parts[0];
        const file = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
        if (!file) continue;
        if (!fileMap.has(file)) {
          fileMap.set(file, { file, status: status[0], hash: currentMeta.hash, author: currentMeta.author, date: currentMeta.date });
        }
      }

      const uniqueHashes = Array.from(new Set(Array.from(fileMap.values()).map((f) => f.hash)));
      const branchesByHash = new Map();
      await Promise.all(
        uniqueHashes.map(async (hash) => {
          try {
            const out2 = await git(['branch', '--all', '--contains', hash], cwd);
            const branches = out2
              .split('\n')
              .map((l) => l.replace(/^\*?\s*/, '').trim())
              .filter(Boolean)
              .map((b) => b.replace(/^remotes\/origin\//, ''));
            branchesByHash.set(hash, Array.from(new Set(branches)));
          } catch (e) {
            branchesByHash.set(hash, []);
          }
        })
      );

      const commitSubjects = new Map();
      await Promise.all(
        uniqueHashes.map(async (hash) => {
          try {
            const subject = await git(['log', '-1', '--format=%s', hash], cwd);
            commitSubjects.set(hash, subject);
          } catch (e) {
            commitSubjects.set(hash, '');
          }
        })
      );

      let userName = '';
      try {
        userName = await git(['config', 'user.name'], cwd);
      } catch (e) {
        userName = '';
      }

      const files = Array.from(fileMap.values())
        .map((f) => ({
          ...f,
          subject: commitSubjects.get(f.hash) || '',
          branches: branchesByHash.get(f.hash) || [],
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      panel.webview.postMessage({ command: 'data', files, userName });
    } catch (e) {
      panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _buildHtml(after, before) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.toolbar input[type="date"] { width: 130px; }
.pill-branch { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: rgba(88,166,255,.15); color: var(--gb-renamed); margin-right: 4px; display: inline-block; margin-bottom: 2px; }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="date" id="dateFrom" value="${after}" />
    <span>to</span>
    <input type="date" id="dateTo" value="${before}" />
    <input type="text" id="search" placeholder="Search files or authors…" style="width:200px" />
    <button id="authorBtn">Author Filter</button>
    <button class="pill" id="excludeMasterToggle">Exclude master</button>
    <div class="spacer"></div>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
  </div>
  <div style="flex:1; overflow-y:auto;">
    <table class="gb-table">
      <thead><tr><th>File Name</th><th>Last Commit</th><th>Author</th><th>Branches</th><th>Last Changed</th><th></th></tr></thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

let allFiles = [];
let currentUser = '';
let selectedAuthors = [];
let excludeMaster = false;

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function relativeDate(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return diffDays + ' days ago';
  return d.toLocaleDateString();
}

function doRefresh() {
  vscode.postMessage({ command: 'refresh', after: document.getElementById('dateFrom').value, before: document.getElementById('dateTo').value });
}
document.getElementById('refreshBtn').addEventListener('click', doRefresh);
document.getElementById('dateFrom').addEventListener('change', doRefresh);
document.getElementById('dateTo').addEventListener('change', doRefresh);
document.getElementById('search').addEventListener('input', render);

document.getElementById('authorBtn').addEventListener('click', () => {
  const authors = Array.from(new Set(allFiles.map(f => f.author))).sort();
  vscode.postMessage({ command: 'showAuthorPicker', authors, selected: selectedAuthors });
});

document.getElementById('excludeMasterToggle').addEventListener('click', () => {
  excludeMaster = !excludeMaster;
  document.getElementById('excludeMasterToggle').classList.toggle('active', excludeMaster);
  render();
});

function applyFilter() {
  const q = document.getElementById('search').value.toLowerCase();
  return allFiles.filter(f => {
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(f.author)) return false;
    if (excludeMaster && f.branches.every(b => b === 'master' || b === 'main')) return false;
    if (q && !f.file.toLowerCase().includes(q) && !f.author.toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const files = applyFilter();
  document.getElementById('tableBody').innerHTML = files.map(f =>
    '<tr>' +
    '<td><span class="status-dot ' + f.status + '"></span>' + escapeHtml(f.file) + '</td>' +
    '<td>' + f.hash.slice(0,7) + ' ' + escapeHtml(f.subject) + '</td>' +
    '<td>' + escapeHtml(f.author) + '</td>' +
    '<td>' + f.branches.map(b => '<span class="pill-branch">' + escapeHtml(b) + '</span>').join('') + '</td>' +
    '<td>' + relativeDate(f.date) + '</td>' +
    '<td>' +
      '<button class="icon-btn open-btn" data-file="' + f.file + '" title="Open file">' + '${svgIcons.FILE}' + '</button>' +
      '<button class="icon-btn copy-btn copy-hash-btn" data-hash="' + f.hash + '" title="Copy hash">' + '${svgIcons.COPY}' + '</button>' +
    '</td>' +
    '</tr>'
  ).join('');

  document.querySelectorAll('.open-btn').forEach(el => el.addEventListener('click', () => vscode.postMessage({ command: 'openFile', file: el.dataset.file })));
  document.querySelectorAll('.copy-hash-btn').forEach(el => el.addEventListener('click', (e) => {
    vscode.postMessage({ command: 'copyHash', hash: el.dataset.hash });
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  }));
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'data') {
    allFiles = msg.files;
    currentUser = msg.userName;
    if (selectedAuthors.length === 0 && currentUser) selectedAuthors = [currentUser];
    if (!excludeMaster) { excludeMaster = true; document.getElementById('excludeMasterToggle').classList.add('active'); }
    render();
  } else if (msg.command === 'authorPickerResult') {
    selectedAuthors = msg.authors;
    render();
  } else if (msg.command === 'error') {
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="6"><div class="error-banner">' + escapeHtml(msg.message) + '</div></td></tr>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = ChangedFilesPanel;
