const vscode = require('vscode');
const { git } = require('../util/exec');
const { getCurrentBranch } = require('../util/repoUtils');
const githubApi = require('../util/githubApi');
const sharedStyles = require('./sharedStyles');
const svgIcons = require('./svgIcons');

async function detectConflicts(cwd, base, head) {
  try {
    const mergeBase = await git(['merge-base', `origin/${base}`, head], cwd);
    const out = await git(['merge-tree', mergeBase, `origin/${base}`, head], cwd);
    return /^<{7}/m.test(out);
  } catch (e) {
    return false;
  }
}

/** Full PR management panel: list, view, create, merge. Singleton. */
class PrListPanel {
  static show(context, ctx, opts) {
    PrListPanel._ctx = ctx;

    if (PrListPanel._panel) {
      PrListPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        'gitbuddyPrList',
        'GitBuddy: Pull Requests',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.webview.html = PrListPanel._buildHtml();
      panel.onDidDispose(() => {
        PrListPanel._panel = null;
      });
      panel.webview.onDidReceiveMessage((msg) => PrListPanel._handleMessage(context, msg));
      PrListPanel._panel = panel;
    }

    if (opts && opts.openCreateModal) {
      PrListPanel._handleMessage(context, { command: 'createPR' });
    }

    return PrListPanel._panel;
  }

  static post(msg) {
    if (PrListPanel._panel) PrListPanel._panel.webview.postMessage(msg);
  }

  static async _handleMessage(context, msg) {
    const ctx = PrListPanel._ctx;
    if (!ctx) return;
    const { cwd, token, owner, repo, currentUser } = ctx;

    try {
      switch (msg.command) {
        case 'fetchAll': {
          const prs = await githubApi.listPullRequests(owner, repo, token, {
            state: 'open',
            perPage: 50,
          });
          PrListPanel.post({ command: 'allData', prs, currentUser });
          break;
        }

        case 'fetchCommits': {
          const [commits, reviews] = await Promise.all([
            githubApi.getPrCommits(owner, repo, token, msg.prNumber),
            githubApi.getPrReviews(owner, repo, token, msg.prNumber),
          ]);

          const latestByUser = new Map();
          for (const r of reviews) {
            if (!r.user || !r.submitted_at) continue;
            const existing = latestByUser.get(r.user.login);
            if (!existing || new Date(r.submitted_at) > new Date(existing.submitted_at)) {
              latestByUser.set(r.user.login, r);
            }
          }
          let approved = 0;
          let changesRequested = 0;
          for (const r of latestByUser.values()) {
            if (r.state === 'APPROVED') approved += 1;
            else if (r.state === 'CHANGES_REQUESTED') changesRequested += 1;
          }

          PrListPanel.post({ command: 'commitsData', commits, approved, changesRequested });
          break;
        }

        case 'merge': {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `GitBuddy: Merging PR #${msg.prNumber}…` },
            () => githubApi.mergePr(owner, repo, token, msg.prNumber)
          );
          PrListPanel.post({ command: 'merged', prNumber: msg.prNumber });
          break;
        }

        case 'openInBrowser': {
          if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        }

        case 'createPR': {
          const [head, defaultBase, branches] = await Promise.all([
            getCurrentBranch(cwd),
            githubApi.getDefaultBranch(owner, repo, token),
            githubApi.getBranches(owner, repo, token),
          ]);
          PrListPanel._branches = branches;
          PrListPanel.post({ command: 'openCreateModal', head, defaultBase, branches });
          break;
        }

        case 'pickBaseBranch': {
          const branches = PrListPanel._branches || (await githubApi.getBranches(owner, repo, token));
          const items = branches.map((b) => ({ label: b }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: msg.query || 'Select a base branch',
            matchOnDescription: true,
          });
          if (picked) PrListPanel.post({ command: 'baseBranchPicked', branch: picked.label });
          break;
        }

        case 'fetchModalCommits': {
          let commits = [];
          try {
            const out = await git(
              ['log', '--oneline', '--no-merges', `--pretty=format:%h\x01%s`, `origin/${msg.base}..${msg.head}`],
              cwd
            );
            commits = out
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const [hash, subject] = line.split('\x01');
                return { hash, subject };
              });
          } catch (e) {
            commits = [];
          }
          const hasConflicts = await detectConflicts(cwd, msg.base, msg.head);
          PrListPanel.post({ command: 'modalCommits', commits, hasConflicts });
          break;
        }

        case 'copyBranch': {
          await vscode.env.clipboard.writeText(msg.branch || '');
          break;
        }

        case 'confirmMasterPR': {
          const choice = await vscode.window.showWarningMessage(
            `You are about to open a pull request targeting "${msg.base}". Continue?`,
            { modal: true },
            'Continue'
          );
          if (choice === 'Continue') {
            await PrListPanel._handleMessage(context, { ...msg, command: 'submitPR' });
          }
          break;
        }

        case 'submitPR': {
          const pr = await githubApi.createPullRequest(owner, repo, token, {
            title: msg.title,
            body: msg.body,
            head: msg.head,
            base: msg.base,
            draft: msg.draft,
          });
          PrListPanel.post({ command: 'prCreated', pr });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      PrListPanel.post({ command: 'error', message: e.message });
    }
  }

  static _buildHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${sharedStyles}
.pr-card { padding: 10px 12px; border-bottom: 1px solid var(--gb-border); cursor: pointer; }
.pr-card:hover { background: var(--vscode-list-hoverBackground); }
.pr-card.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.pr-card .title-row { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.pr-card .avatar { width: 18px; height: 18px; border-radius: 50%; background: var(--gb-accent); color: #fff; font-size: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pr-card .num { color: var(--gb-dim); font-weight: 400; }
.pr-card .branches { margin-top: 4px; font-size: 11px; color: var(--gb-dim); }
.pr-card .labels { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.pr-label { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: rgba(88,166,255,.15); color: var(--gb-renamed); }

.pr-detail { padding: 16px; }
.pr-detail h1 { font-size: 16px; margin: 0 0 4px; }
.pr-detail .sub { color: var(--gb-dim); font-size: 12px; }
.branch-row { display: flex; align-items: center; gap: 6px; margin: 10px 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
.state-badge { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 600; text-transform: uppercase; background: rgba(63,185,80,.15); color: var(--gb-added); }
.pr-body { margin: 12px 0; font-size: 12.5px; white-space: pre-wrap; border: 1px solid var(--gb-border); border-radius: 4px; padding: 10px; }
.commits-section { margin-top: 16px; }
.commit-row { display: flex; gap: 8px; padding: 4px 0; font-size: 12px; font-family: var(--vscode-editor-font-family, monospace); }
.review-badges { display: flex; gap: 6px; margin: 10px 0; }
.review-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.review-approved { background: rgba(63,185,80,.15); color: var(--gb-added); }
.review-changes { background: rgba(248,81,73,.15); color: var(--gb-deleted); }

#createModal .commits-preview { max-height: 140px; overflow-y: auto; border: 1px solid var(--gb-border); border-radius: 4px; margin-top: 6px; }
#createModal .conflict-banner { background: rgba(248,81,73,.12); color: var(--gb-deleted); border: 1px solid rgba(248,81,73,.35); border-radius: 4px; padding: 8px; margin-top: 8px; font-size: 12px; }
#createModal .char-count { float: right; font-size: 10.5px; color: var(--gb-dim); }
.base-picker-row { display: flex; gap: 6px; }
.base-picker-row input { flex: 1; }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Search pull requests…" style="width:220px" />
    <button class="pill active" id="pillOpen">Open</button>
    <button class="pill" id="pillMine">Mine</button>
    <div class="spacer"></div>
    <button class="icon-btn" id="refreshBtn" title="Refresh">${svgIcons.REFRESH}</button>
    <button class="btn-primary" id="newPrBtn">New Pull Request</button>
  </div>
  <div class="split">
    <div class="pane-left" id="prList"></div>
    <div class="resizer" id="resizer"></div>
    <div class="pane-right" id="prDetail">
      <div class="placeholder">Select a pull request to view details</div>
    </div>
  </div>

  <div class="modal-backdrop hidden" id="createModal">
    <div class="modal">
      <h2>New Pull Request</h2>
      <label>Title <span class="char-count" id="titleCount">0/72</span></label>
      <input type="text" id="prTitle" maxlength="72" />
      <label>From (head)</label>
      <input type="text" id="prHead" disabled />
      <label>Into (base)</label>
      <div class="base-picker-row">
        <input type="text" id="prBase" readonly />
        <button id="pickBaseBtn">${svgIcons.SEARCH} Search</button>
      </div>
      <label>Description</label>
      <textarea id="prBody" rows="5"></textarea>
      <label>Commits</label>
      <div class="commits-preview" id="commitsPreview"></div>
      <div id="conflictBanner" class="conflict-banner" style="display:none;">⚠ This merge has conflicts with the base branch.</div>
      <label style="display:flex; align-items:center; gap:6px; margin-top:10px;">
        <input type="checkbox" id="prDraft" style="width:auto;" /> Create as draft
      </label>
      <div class="modal-actions">
        <button id="cancelPrBtn">Cancel</button>
        <button class="btn-primary" id="submitPrBtn">Create Pull Request</button>
      </div>
    </div>
  </div>

<script>
const vscode = acquireVsCodeApi();
document.addEventListener('contextmenu', e => e.preventDefault());

let allPrs = [];
let activePr = null;
let currentUser = null;
let filterOpen = true;
let filterMine = false;

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initials(login) {
  return (login || '?').slice(0, 2).toUpperCase();
}

function requestAll() { vscode.postMessage({ command: 'fetchAll' }); }
document.getElementById('refreshBtn').addEventListener('click', requestAll);
requestAll();

document.getElementById('pillOpen').addEventListener('click', () => {
  filterOpen = !filterOpen;
  document.getElementById('pillOpen').classList.toggle('active', filterOpen);
  renderList();
});
document.getElementById('pillMine').addEventListener('click', () => {
  filterMine = !filterMine;
  document.getElementById('pillMine').classList.toggle('active', filterMine);
  renderList();
});
document.getElementById('search').addEventListener('input', renderList);

function filteredPrs() {
  const q = document.getElementById('search').value.toLowerCase();
  return allPrs.filter(pr => {
    if (filterMine && pr.user && pr.user.login !== currentUser) return false;
    if (q && !pr.title.toLowerCase().includes(q) && !String(pr.number).includes(q)) return false;
    return true;
  });
}

function renderList() {
  const prs = filteredPrs();
  const list = document.getElementById('prList');
  if (prs.length === 0) {
    list.innerHTML = '<div class="placeholder">No pull requests found</div>';
    return;
  }
  list.innerHTML = prs.map(pr => (
    '<div class="pr-card' + (activePr && activePr.number === pr.number ? ' active' : '') + '" data-num="' + pr.number + '" tabindex="0">' +
      '<div class="title-row"><span class="avatar">' + initials(pr.user && pr.user.login) + '</span>' +
      '<span>' + escapeHtml(pr.title) + '</span></div>' +
      '<div class="branches">#' + pr.number + ' &middot; ' + escapeHtml(pr.head.ref) + ' &rarr; ' + escapeHtml(pr.base.ref) + '</div>' +
      (pr.labels && pr.labels.length ? '<div class="labels">' + pr.labels.map(l => '<span class="pr-label">' + escapeHtml(l.name) + '</span>').join('') + '</div>' : '') +
    '</div>'
  )).join('');

  list.querySelectorAll('.pr-card').forEach(el => {
    el.addEventListener('click', () => selectPr(Number(el.dataset.num)));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') selectPr(Number(el.dataset.num));
      if (e.key === 'ArrowDown' && el.nextElementSibling) el.nextElementSibling.focus();
      if (e.key === 'ArrowUp' && el.previousElementSibling) el.previousElementSibling.focus();
    });
  });
}

function selectPr(number) {
  activePr = allPrs.find(p => p.number === number);
  renderList();
  renderDetail();
  vscode.postMessage({ command: 'fetchCommits', prNumber: number });
}

function renderDetail() {
  if (!activePr) return;
  const pr = activePr;
  const detail = document.getElementById('prDetail');
  detail.innerHTML =
    '<div class="pr-detail">' +
    '<h1>' + escapeHtml(pr.title) + ' <span class="sub">#' + pr.number + '</span></h1>' +
    '<div class="sub">Opened by ' + escapeHtml(pr.user && pr.user.login) + ' &middot; <span class="state-badge">' + pr.state + '</span></div>' +
    '<div class="branch-row">' +
      '<span>' + escapeHtml(pr.head.ref) + '</span>' +
      '<button class="icon-btn copy-head" title="Copy branch">' + '${svgIcons.COPY}' + '</button>' +
      '<span>&rarr;</span><span>' + escapeHtml(pr.base.ref) + '</span>' +
    '</div>' +
    '<div class="pr-body">' + escapeHtml(pr.body || 'No description provided.') + '</div>' +
    '<div class="review-badges" id="reviewBadges"></div>' +
    '<div class="commits-section"><strong>Commits</strong><div id="commitsList">Loading…</div></div>' +
    '<div class="modal-actions">' +
      '<button id="openBrowserBtn">${svgIcons.EXTERNAL_LINK} Open in Browser</button>' +
      '<button class="btn-primary" id="mergeBtn" disabled>Merge Pull Request</button>' +
    '</div>' +
    '</div>';

  detail.querySelector('.copy-head').addEventListener('click', () => vscode.postMessage({ command: 'copyBranch', branch: pr.head.ref }));
  detail.querySelector('#openBrowserBtn').addEventListener('click', () => vscode.postMessage({ command: 'openInBrowser', url: pr.html_url }));
  detail.querySelector('#mergeBtn').addEventListener('click', () => {
    vscode.postMessage({ command: 'merge', prNumber: pr.number });
  });
}

function renderCommits(commits, approved, changesRequested) {
  const list = document.getElementById('commitsList');
  if (!list) return;
  list.innerHTML = commits.map(c =>
    '<div class="commit-row"><span>' + c.sha.slice(0,7) + '</span><span>' + escapeHtml(c.commit.message.split('\\n')[0]) + '</span></div>'
  ).join('') || '<div class="sub">No commits.</div>';

  const badges = document.getElementById('reviewBadges');
  let html = '';
  if (approved > 0) html += '<span class="review-badge review-approved">' + approved + ' Approved</span>';
  if (changesRequested > 0) html += '<span class="review-badge review-changes">' + changesRequested + ' Changes Requested</span>';
  badges.innerHTML = html;

  const mergeBtn = document.getElementById('mergeBtn');
  if (mergeBtn) mergeBtn.disabled = !(approved > 0) || changesRequested > 0;
}

// ---------- Resizer ----------
(function () {
  const resizer = document.getElementById('resizer');
  const left = document.getElementById('prList');
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

// ---------- Create PR modal ----------
const modal = document.getElementById('createModal');
document.getElementById('newPrBtn').addEventListener('click', () => vscode.postMessage({ command: 'createPR' }));

document.getElementById('cancelPrBtn').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('prTitle').addEventListener('input', (e) => {
  document.getElementById('titleCount').textContent = e.target.value.length + '/72';
});

let modalHead = '';
document.getElementById('pickBaseBtn').addEventListener('click', () => {
  vscode.postMessage({ command: 'pickBaseBranch', query: document.getElementById('prBase').value });
});

document.getElementById('submitPrBtn').addEventListener('click', () => {
  const title = document.getElementById('prTitle').value.trim();
  const base = document.getElementById('prBase').value.trim();
  const body = document.getElementById('prBody').value;
  const draft = document.getElementById('prDraft').checked;
  if (!title || !base) return;
  const payload = { title, body, head: modalHead, base, draft };
  if (base === 'master' || base === 'main') {
    vscode.postMessage({ command: 'confirmMasterPR', ...payload });
  } else {
    vscode.postMessage({ command: 'submitPR', ...payload });
  }
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'allData') {
    allPrs = msg.prs;
    currentUser = msg.currentUser;
    renderList();
  } else if (msg.command === 'commitsData') {
    renderCommits(msg.commits, msg.approved, msg.changesRequested);
  } else if (msg.command === 'merged') {
    requestAll();
  } else if (msg.command === 'openCreateModal') {
    modalHead = msg.head;
    document.getElementById('prTitle').value = '';
    document.getElementById('titleCount').textContent = '0/72';
    document.getElementById('prHead').value = msg.head;
    document.getElementById('prBase').value = msg.defaultBase;
    document.getElementById('prBody').value = '';
    document.getElementById('commitsPreview').innerHTML = '';
    document.getElementById('conflictBanner').style.display = 'none';
    modal.classList.remove('hidden');
    vscode.postMessage({ command: 'fetchModalCommits', head: msg.head, base: msg.defaultBase });
  } else if (msg.command === 'baseBranchPicked') {
    document.getElementById('prBase').value = msg.branch;
    vscode.postMessage({ command: 'fetchModalCommits', head: modalHead, base: msg.branch });
  } else if (msg.command === 'modalCommits') {
    document.getElementById('commitsPreview').innerHTML = msg.commits.map(c =>
      '<div class="commit-row" style="padding:4px 8px;">' + c.hash + ' ' + escapeHtml(c.subject) + '</div>'
    ).join('') || '<div class="sub" style="padding:6px 8px;">No commits ahead of base.</div>';
    document.getElementById('conflictBanner').style.display = msg.hasConflicts ? 'block' : 'none';
  } else if (msg.command === 'prCreated') {
    modal.classList.add('hidden');
    requestAll();
  } else if (msg.command === 'error') {
    console.error(msg.message);
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = PrListPanel;
