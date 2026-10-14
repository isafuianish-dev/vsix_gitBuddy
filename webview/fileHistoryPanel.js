const vscode = require('vscode');
const { git } = require('../util/exec');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

const REC_SEP = '\x00';
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Full commit history + diff/content viewer for a single file. Singleton. */
class FileHistoryPanel {
  static show(context, repoRoot, initialFile, files) {
    FileHistoryPanel._repoRoot = repoRoot;
    FileHistoryPanel._files = files || FileHistoryPanel._files || [];

    if (FileHistoryPanel._panel) {
      FileHistoryPanel._panel.reveal(vscode.ViewColumn.One);
      if (initialFile) {
        FileHistoryPanel._panel.webview.postMessage({ command: 'setFile', file: initialFile });
      }
      return FileHistoryPanel._panel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitbuddyFileHistory',
      'GitBuddy: File History',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = FileHistoryPanel._buildHtml(initialFile);
    panel.onDidDispose(() => {
      FileHistoryPanel._panel = null;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      const cwd = FileHistoryPanel._repoRoot;
      try {
        if (msg.command === 'pickFile') {
          const picked = await vscode.window.showQuickPick(FileHistoryPanel._files, {
            placeHolder: 'Select a tracked file',
          });
          if (picked) panel.webview.postMessage({ command: 'filePicked', file: picked });
        } else if (msg.command === 'showInfo') {
          vscode.window.showInformationMessage(msg.message);
        } else if (msg.command === 'loadHistory') {
          const format = `%H${REC_SEP}%h${REC_SEP}%an${REC_SEP}%ad${REC_SEP}%s`;
          const out = await git(
            ['log', '--follow', `--format=${format}`, '--date=unix', '--', msg.file],
            cwd
          );
          const commits = out
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [hash, shortHash, author, date, subject] = line.split(REC_SEP);
              return { hash, shortHash, author, date, subject };
            });
          panel.webview.postMessage({ command: 'historyData', commits, file: msg.file });
        } else if (msg.command === 'loadDiff') {
          let diff;
          try {
            diff = await git(['diff', `${msg.hash}~1`, msg.hash, '--', msg.file], cwd);
          } catch (e) {
            diff = await git(['diff', EMPTY_TREE_HASH, msg.hash, '--', msg.file], cwd);
          }
          panel.webview.postMessage({ command: 'diffData', diff });
        } else if (msg.command === 'showFileAt') {
          let content = '';
          let status = 'M';
          try {
            content = await git(['show', `${msg.hash}:${msg.file}`], cwd);
          } catch (e) {
            content = '';
          }
          try {
            const nameStatus = await git(['diff-tree', '--no-commit-id', '--name-status', '-r', msg.hash], cwd);
            const line = nameStatus.split('\n').find((l) => l.endsWith('\t' + msg.file) || l.includes(msg.file));
            if (line) status = line[0];
          } catch (e) {
            // ignore
          }
          panel.webview.postMessage({ command: 'fileContent', content, status, hash: msg.hash });
        }
      } catch (e) {
        panel.webview.postMessage({ command: 'error', message: e.message });
      }
    });

    FileHistoryPanel._panel = panel;
    return panel;
  }

  static _buildHtml(initialFile) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.filebar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--gb-border); }
.filebar .filepath { flex: 1; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; padding: 4px 8px; border: 1px solid var(--gb-border); border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-row { padding: 8px 12px; border-bottom: 1px solid var(--gb-border); cursor: pointer; }
.commit-row:hover { background: var(--vscode-list-hoverBackground); }
.commit-row.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.commit-row .hash { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; color: var(--gb-dim); }
.commit-row .subject { font-size: 12.5px; font-weight: 600; margin: 2px 0; }
.commit-row .meta { font-size: 11px; color: var(--gb-dim); }
.content-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--gb-border); }
.content-header .grow { flex: 1; }
.content-body { overflow: auto; padding: 8px 0; }
</style>
</head>
<body>
  <div class="filebar">
    <div class="filepath" id="filePath">${initialFile ? initialFile : 'No file selected'}</div>
    <button id="browseBtn">Browse…</button>
    <button id="loadBtn">Load History</button>
  </div>
  <div class="split">
    <div class="pane-left" id="historyList"><div class="placeholder">No history loaded</div></div>
    <div class="resizer" id="resizer"></div>
    <div class="pane-right" id="fileDetail"><div class="placeholder">Select a commit to view file content</div></div>
  </div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

let currentFile = ${JSON.stringify(initialFile || '')};
let commits = [];
let activeIdx = -1;
let viewMode = 'file'; // 'file' | 'diff'
let currentContent = '';
let currentHash = '';

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(unixTimestamp) {
  const d = new Date(Number(unixTimestamp) * 1000);
  return d.toLocaleString();
}

document.getElementById('browseBtn').addEventListener('click', () => vscode.postMessage({ command: 'pickFile' }));
document.getElementById('loadBtn').addEventListener('click', () => {
  if (!currentFile) { vscode.postMessage({ command: 'showInfo', message: 'Select a file first.' }); return; }
  vscode.postMessage({ command: 'loadHistory', file: currentFile });
});

if (currentFile) {
  vscode.postMessage({ command: 'loadHistory', file: currentFile });
} else {
  setTimeout(() => vscode.postMessage({ command: 'pickFile' }), 350);
}

// ---------- Resizer ----------
(function () {
  const resizer = document.getElementById('resizer');
  const left = document.getElementById('historyList');
  let dragging = false;
  resizer.addEventListener('pointerdown', (e) => { dragging = true; resizer.classList.add('active'); resizer.setPointerCapture(e.pointerId); });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = left.parentElement.getBoundingClientRect();
    const w = Math.max(180, Math.min(600, e.clientX - rect.left));
    left.style.width = w + 'px';
  });
  resizer.addEventListener('pointerup', (e) => { dragging = false; resizer.classList.remove('active'); resizer.releasePointerCapture(e.pointerId); });
})();

function renderList() {
  const list = document.getElementById('historyList');
  if (commits.length === 0) {
    list.innerHTML = '<div class="placeholder">No history found</div>';
    return;
  }
  list.innerHTML = commits.map((c, i) =>
    '<div class="commit-row' + (i === activeIdx ? ' active' : '') + '" data-idx="' + i + '">' +
    '<div class="hash">' + c.shortHash + '</div>' +
    '<div class="subject">' + escapeHtml(c.subject) + '</div>' +
    '<div class="meta">' + escapeHtml(c.author) + ' &middot; ' + formatDate(c.date) + '</div>' +
    '</div>'
  ).join('');
  list.querySelectorAll('.commit-row').forEach(el => {
    el.addEventListener('click', () => selectCommit(Number(el.dataset.idx)));
  });
}

function selectCommit(idx) {
  activeIdx = idx;
  renderList();
  const c = commits[idx];
  currentHash = c.hash;
  vscode.postMessage({ command: 'showFileAt', hash: c.hash, file: currentFile });
}

function renderFileView() {
  const detail = document.getElementById('fileDetail');
  if (currentStatus === 'D') {
    detail.querySelector('.content-body').innerHTML = '<div class="placeholder">[FILE DELETED IN THIS COMMIT]</div>';
    return;
  }
  const lines = currentContent.split('\\n');
  detail.querySelector('.content-body').innerHTML =
    '<div class="code-view">' + lines.map((l, i) =>
      '<div class="code-line"><span class="ln">' + (i + 1) + '</span><span class="content">' + escapeHtml(l) + '</span></div>'
    ).join('') + '</div>';
}

function renderDiffView(diff) {
  const detail = document.getElementById('fileDetail');
  const lines = (diff || '').split('\\n');
  detail.querySelector('.content-body').innerHTML = lines.map(line => {
    let cls = '';
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) cls = 'diff-meta';
    else if (line.startsWith('@@')) cls = 'diff-hunk';
    else if (line.startsWith('+')) cls = 'diff-add';
    else if (line.startsWith('-')) cls = 'diff-del';
    return '<div class="diff-line ' + cls + '">' + escapeHtml(line) + '</div>';
  }).join('');
}

let currentStatus = 'M';

function renderContent() {
  const detail = document.getElementById('fileDetail');
  detail.innerHTML =
    '<div class="content-header">' +
    '<span>' + currentHash.slice(0,7) + '</span>' +
    '<button id="toggleViewBtn">' + (viewMode === 'file' ? 'Show Diff' : 'Show File') + '</button>' +
    '<span class="grow"></span>' +
    '<button id="copyHashBtn2" class="copy-btn">' + window.SVG_COPY + ' Copy Hash</button>' +
    '<button id="copyContentBtn" class="copy-btn">' + window.SVG_COPY + ' Copy Content</button>' +
    '</div>' +
    '<div class="content-body"></div>';

  document.getElementById('toggleViewBtn').addEventListener('click', () => {
    viewMode = viewMode === 'file' ? 'diff' : 'file';
    if (viewMode === 'diff') {
      vscode.postMessage({ command: 'loadDiff', hash: currentHash, file: currentFile });
    } else {
      renderContent();
    }
  });
  document.getElementById('copyHashBtn2').addEventListener('click', (e) => { navigator.clipboard.writeText(currentHash); flashCopied(e.currentTarget); });
  document.getElementById('copyContentBtn').addEventListener('click', (e) => { navigator.clipboard.writeText(currentContent); flashCopied(e.currentTarget); });

  if (viewMode === 'file') renderFileView();
}

function flashCopied(btn) {
  btn.classList.add('copied');
  const original = btn.innerHTML;
  btn.innerHTML = window.SVG_CHECK ? (window.SVG_CHECK + ' Copied') : 'Copied';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1500);
}
window.SVG_COPY = ${JSON.stringify(svgIcons.COPY)};
window.SVG_CHECK = ${JSON.stringify(svgIcons.CHECK)};

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'filePicked') {
    currentFile = msg.file;
    document.getElementById('filePath').textContent = currentFile;
    vscode.postMessage({ command: 'loadHistory', file: currentFile });
  } else if (msg.command === 'setFile') {
    currentFile = msg.file;
    document.getElementById('filePath').textContent = currentFile;
    vscode.postMessage({ command: 'loadHistory', file: currentFile });
  } else if (msg.command === 'historyData') {
    commits = msg.commits;
    activeIdx = -1;
    renderList();
    if (commits.length > 0) selectCommit(0);
  } else if (msg.command === 'fileContent') {
    currentContent = msg.content;
    currentStatus = msg.status;
    currentHash = msg.hash;
    viewMode = 'file';
    renderContent();
  } else if (msg.command === 'diffData') {
    renderContent();
    renderDiffView(msg.diff);
  } else if (msg.command === 'error') {
    document.getElementById('fileDetail').innerHTML = '<div class="error-banner">' + escapeHtml(msg.message) + '</div>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = FileHistoryPanel;
