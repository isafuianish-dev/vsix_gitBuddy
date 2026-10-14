const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { git } = require('../util/exec');
const { validateFile, getVersionPrefix, VALID_SCHEMAS } = require('../src/validateMigration');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

/**
 * Relative path (within the repo) to the directory containing migration SQL files.
 * Adapt to your own repository layout.
 */
const DB_REL = 'db/migrations';

/**
 * Optional allow-list of remote URLs this panel applies to. Leave empty to allow any repo.
 */
const TARGET_REMOTES = [];

/**
 * Branch name patterns considered "active work" branches for cross-branch conflict detection.
 * Adapt to your own branching conventions.
 */
const ACTIVE_BRANCH_PATTERNS = [/^feature-/i, /^release-/i];

const HELP_CODES = [
  { code: 'E_N01', category: 'Naming', message: 'File must have a .sql extension.' },
  { code: 'E_N02', category: 'Naming', message: 'File name must match V_[1-4]_YYYYMMDD_nnnn__ prefix pattern.' },
  { code: 'E_N03', category: 'Naming', message: 'File name must contain only letters, digits, underscore, hyphen, dot.' },
  { code: 'E_N04', category: 'Naming', message: 'File must be readable.' },
  { code: 'E_C01', category: 'Content', message: 'Line 1 SET SCHEMA uses an unrecognised schema.' },
  { code: 'E_C02', category: 'Content', message: 'Line 1 is missing or not a SET SCHEMA statement.' },
  { code: 'E_C03', category: 'Content', message: 'Line 2 SET CURRENT PATH uses an unrecognised schema.' },
  { code: 'E_C04', category: 'Content', message: 'Line 2 is missing or not a SET CURRENT PATH statement.' },
  { code: 'E_C05', category: 'Content', message: 'Line 3 SET TERMINATOR uses a character other than #.' },
  { code: 'E_C06', category: 'Content', message: 'Line 3 is missing or not a SET TERMINATOR statement.' },
  { code: 'E_C07', category: 'Content', message: 'Schema mismatch between SET SCHEMA and SET CURRENT PATH.' },
  { code: 'E_C08', category: 'Content', message: 'File must end with # as the last non-whitespace character.' },
  { code: 'E_P01', category: 'Prefix Conflict', message: 'Version prefix already used by another file locally or on an active remote branch.' },
];

function isActiveBranch(branch) {
  return ACTIVE_BRANCH_PATTERNS.some((re) => re.test(branch));
}

function listSqlFiles(dbAbsPath) {
  const results = [];
  if (!fs.existsSync(dbAbsPath)) return results;

  function walk(dir, relFolder) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, relFolder ? `${relFolder}/${entry.name}` : entry.name);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) {
        results.push({ folder: relFolder, fileName: entry.name, fullPath: full });
      }
    }
  }
  walk(dbAbsPath, '');
  return results;
}

async function getLastCommitters(cwd) {
  const map = new Map();
  try {
    const out = await git(
      ['log', '--pretty=COMMIT:%an\x01%ci\x01%s', '--name-only', '--', DB_REL],
      cwd
    );
    const blocks = out.split(/^COMMIT:/m).filter(Boolean);
    for (const block of blocks) {
      const lines = block.split('\n');
      const [author, time, message] = lines[0].split('\x01');
      for (let i = 1; i < lines.length; i++) {
        const fileName = path.basename(lines[i].trim());
        if (!fileName) continue;
        if (!map.has(fileName)) map.set(fileName, { author, time, message });
      }
    }
  } catch (e) {
    // repository may have no commits touching DB_REL yet
  }
  return map;
}

async function buildMasterFileList(cwd) {
  const map = new Map();
  try {
    await git(['fetch', '--all'], cwd);
    const refsOut = await git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes'], cwd);
    const branches = refsOut
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean)
      .filter((b) => !b.endsWith('/HEAD'))
      .map((b) => b.replace(/^origin\//, ''))
      .filter(isActiveBranch);

    await Promise.all(
      branches.map(async (branch) => {
        try {
          const out = await git(['ls-tree', '-r', '--name-only', `origin/${branch}`, '--', DB_REL], cwd);
          const files = out.split('\n').filter(Boolean);
          for (const f of files) {
            const fileName = path.basename(f);
            const pfix = getVersionPrefix(fileName);
            if (!pfix) continue;
            if (!map.has(fileName)) map.set(fileName, { pfix, branches: [] });
            if (!map.get(fileName).branches.includes(branch)) map.get(fileName).branches.push(branch);
          }
        } catch (e) {
          // branch may not have the migrations directory
        }
      })
    );
  } catch (e) {
    // fetch failed (offline) — proceed with local-only conflict detection
  }
  return map;
}

/** SQL migration file validator panel. Singleton. */
class ValidateMigrationPanel {
  static async show(context, cwd) {
    if (TARGET_REMOTES.length > 0) {
      try {
        const remoteUrl = await git(['remote', 'get-url', 'origin'], cwd);
        if (!TARGET_REMOTES.some((r) => remoteUrl.includes(r))) {
          vscode.window.showInformationMessage('GitBuddy: Migration validation is not configured for this repository.');
          return;
        }
      } catch (e) {
        vscode.window.showInformationMessage('GitBuddy: No "origin" remote found for this repository.');
        return;
      }
    }

    if (ValidateMigrationPanel._panel) {
      ValidateMigrationPanel._panel.reveal(vscode.ViewColumn.One);
      ValidateMigrationPanel._load(ValidateMigrationPanel._panel, cwd);
      return ValidateMigrationPanel._panel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitbuddyValidateMigration',
      'GitBuddy: Validate Migration',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = ValidateMigrationPanel._buildHtml();
    panel.onDidDispose(() => {
      ValidateMigrationPanel._panel = null;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.command === 'refresh') {
          await ValidateMigrationPanel._load(panel, cwd);
        } else if (msg.command === 'openFile') {
          const filePath = path.join(cwd, DB_REL, msg.folder, msg.fileName);
          await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: true });
        } else if (msg.command === 'showValidationPicker') {
          const items = msg.categories.map((c) => ({ label: c, picked: (msg.selected || []).includes(c) }));
          const picked = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: 'Filter by validation code' });
          if (picked) panel.webview.postMessage({ command: 'validationPickerResult', codes: picked.map((p) => p.label) });
        } else if (msg.command === 'showAuthorPicker') {
          const items = msg.authors.map((a) => ({ label: a, picked: (msg.selected || []).includes(a) }));
          const picked = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: 'Filter by author' });
          if (picked) panel.webview.postMessage({ command: 'authorPickerResult', authors: picked.map((p) => p.label) });
        }
      } catch (e) {
        panel.webview.postMessage({ command: 'error', message: e.message });
      }
    });

    ValidateMigrationPanel._panel = panel;
    ValidateMigrationPanel._load(panel, cwd);
    return panel;
  }

  static async _load(panel, cwd) {
    panel.webview.postMessage({ command: 'loading' });

    try {
      const dbAbsPath = path.join(cwd, DB_REL);

      const [currentUser, committers, statusOut] = await Promise.all([
        git(['config', 'user.name'], cwd).catch(() => ''),
        getLastCommitters(cwd),
        git(['status', '--porcelain', '--', DB_REL], cwd).catch(() => ''),
      ]);

      const localChanges = statusOut
        .split('\n')
        .filter(Boolean)
        .map((l) => l.slice(3).trim());

      const entries = listSqlFiles(dbAbsPath);

      const files = [];
      for (const entry of entries) {
        const errors = await validateFile(entry.fullPath);
        const committer = committers.get(entry.fileName);
        files.push({
          folder: entry.folder,
          fileName: entry.fileName,
          lastCommitter: committer ? committer.author : '',
          lastCommitTime: committer ? committer.time : '',
          errors,
        });
      }

      // Local prefix conflicts: files sharing the same version prefix within the local tree.
      const prefixMap = new Map();
      for (const f of files) {
        const pfix = getVersionPrefix(f.fileName);
        if (!pfix) continue;
        if (!prefixMap.has(pfix)) prefixMap.set(pfix, []);
        prefixMap.get(pfix).push(f.fileName);
      }
      const localConflicts = [];
      for (const [pfix, names] of prefixMap.entries()) {
        if (names.length > 1) {
          localConflicts.push({ prefix: pfix, files: names });
        }
      }

      const masterFileList = await buildMasterFileList(cwd);
      const remoteConflicts = [];
      for (const f of files) {
        const pfix = getVersionPrefix(f.fileName);
        if (!pfix) continue;
        for (const [otherFileName, info] of masterFileList.entries()) {
          if (otherFileName === f.fileName) continue;
          if (info.pfix === pfix) {
            remoteConflicts.push({ prefix: pfix, file: f.fileName, remoteFile: otherFileName, branches: info.branches });
          }
        }
      }

      // Attach E_P01 errors for detected conflicts.
      const conflictedFiles = new Set([
        ...localConflicts.flatMap((c) => c.files),
        ...remoteConflicts.map((c) => c.file),
      ]);

      let maxSeq = 0;
      for (const f of files) {
        const m = f.fileName.match(/^V_[1-4]_\d{8}_(\d{4})__/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      for (const info of masterFileList.values()) {
        const m = info.pfix.match(/_(\d{4})$/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      const nextSeq = String(maxSeq + 1).padStart(4, '0');

      for (const f of files) {
        if (conflictedFiles.has(f.fileName)) {
          f.errors = [
            ...f.errors,
            {
              code: 'E_P01',
              message: `Version prefix is already used by another file. Suggested next sequence: ${nextSeq}.`,
            },
          ];
        }
      }

      panel.webview.postMessage({
        command: 'data',
        files,
        localConflicts,
        remoteConflicts,
        nextSeq,
        currentUser,
        localChanges,
        validSchemas: VALID_SCHEMAS,
      });
    } catch (e) {
      panel.webview.postMessage({ command: 'error', message: e.message });
    }
  }

  static _buildHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.tooltip-wrap { position: relative; display: inline-block; }
.tooltip-content {
  display: none;
  position: absolute;
  z-index: 20;
  top: 100%;
  left: 0;
  background: var(--gb-bg);
  border: 1px solid var(--gb-border);
  border-radius: 4px;
  padding: 8px 10px;
  min-width: 260px;
  font-size: 11.5px;
  box-shadow: 0 4px 12px rgba(0,0,0,.3);
}
.tooltip-wrap:hover .tooltip-content { display: block; }
.tooltip-content .err-line { margin-bottom: 4px; }
.tooltip-content .err-code { font-weight: 700; margin-right: 4px; }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Search files or committers…" style="width:220px" />
    <button id="validationBtn">Validation Filter</button>
    <button id="authorBtn">Author Filter</button>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
    <div class="spacer"></div>
    <button id="helpBtn">${svgIcons.HELP} Help</button>
  </div>
  <div style="flex:1; overflow-y:auto;" id="contentWrap">
    <table class="gb-table">
      <thead><tr><th>Directory</th><th>File Name</th><th>Last Committer</th><th>Last Commit Time</th><th>Validation Result</th></tr></thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>

  <div class="modal-backdrop hidden" id="helpModal">
    <div class="modal">
      <h2>Validation Error Codes</h2>
      <div id="helpContent"></div>
      <div class="modal-actions"><button id="closeHelpBtn">Close</button></div>
    </div>
  </div>
<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

const HELP_CODES = ${JSON.stringify(HELP_CODES)};
let allFiles = [];
let selectedAuthors = [];
let selectedCodes = [];
let currentUser = '';

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
document.getElementById('search').addEventListener('input', render);

document.getElementById('authorBtn').addEventListener('click', () => {
  const authors = Array.from(new Set(allFiles.map(f => f.lastCommitter).filter(Boolean))).sort();
  vscode.postMessage({ command: 'showAuthorPicker', authors, selected: selectedAuthors });
});

document.getElementById('validationBtn').addEventListener('click', () => {
  const categories = Array.from(new Set(allFiles.flatMap(f => f.errors.map(e => e.code)))).sort();
  vscode.postMessage({ command: 'showValidationPicker', categories, selected: selectedCodes });
});

document.getElementById('helpBtn').addEventListener('click', () => {
  document.getElementById('helpContent').innerHTML = HELP_CODES.map(h =>
    '<div class="err-line"><span class="err-code">' + h.code + '</span>' + '<span class="badge">' + h.category + '</span> ' + escapeHtml(h.message) + '</div>'
  ).join('');
  document.getElementById('helpModal').classList.remove('hidden');
});
document.getElementById('closeHelpBtn').addEventListener('click', () => document.getElementById('helpModal').classList.add('hidden'));

function applyFilter() {
  const q = document.getElementById('search').value.toLowerCase();
  return allFiles.filter(f => {
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(f.lastCommitter)) return false;
    if (selectedCodes.length > 0 && !f.errors.some(e => selectedCodes.includes(e.code))) return false;
    if (q && !f.fileName.toLowerCase().includes(q) && !(f.lastCommitter||'').toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const files = applyFilter();
  document.getElementById('tableBody').innerHTML = files.map(f => {
    const pass = f.errors.length === 0;
    const badge = pass
      ? '<span class="badge badge-pass">PASS</span>'
      : '<div class="tooltip-wrap"><span class="badge badge-fail">FAIL (' + f.errors.length + ')</span>' +
        '<div class="tooltip-content">' + f.errors.map(e =>
          '<div class="err-line"><span class="err-code">' + e.code + '</span>' + escapeHtml(e.message) + '</div>'
        ).join('') + '</div></div>';
    return '<tr>' +
      '<td>' + escapeHtml(f.folder || '/') + '</td>' +
      '<td class="open-file" data-folder="' + escapeHtml(f.folder||'') + '" data-file="' + escapeHtml(f.fileName) + '" style="cursor:pointer;">' + escapeHtml(f.fileName) + '</td>' +
      '<td>' + escapeHtml(f.lastCommitter) + '</td>' +
      '<td>' + escapeHtml(f.lastCommitTime) + '</td>' +
      '<td>' + badge + '</td>' +
      '</tr>';
  }).join('');

  document.querySelectorAll('.open-file').forEach(el => {
    el.addEventListener('click', () => vscode.postMessage({ command: 'openFile', folder: el.dataset.folder, fileName: el.dataset.file }));
  });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'loading') {
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
  } else if (msg.command === 'data') {
    allFiles = msg.files;
    currentUser = msg.currentUser;
    if (selectedAuthors.length === 0 && currentUser) selectedAuthors = [currentUser];
    if (selectedCodes.length === 0) {
      selectedCodes = Array.from(new Set(allFiles.flatMap(f => f.errors.map(e => e.code))));
    }
    render();
  } else if (msg.command === 'authorPickerResult') {
    selectedAuthors = msg.authors;
    render();
  } else if (msg.command === 'validationPickerResult') {
    selectedCodes = msg.codes;
    render();
  } else if (msg.command === 'error') {
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="5"><div class="error-banner">' + escapeHtml(msg.message) + '</div></td></tr>';
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = ValidateMigrationPanel;
