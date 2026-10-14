(function () {
  const vscode = acquireVsCodeApi();
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const STATUS_LABELS = {
    A: 'Added',
    M: 'Modified',
    D: 'Deleted',
    R: 'Renamed',
    C: 'Copied',
    T: 'Type Changed',
  };

  let allCommits = [];
  let visibleCommits = [];
  let activeIdx = -1;
  let selectedAuthors = [];
  let hideMergeCommits = true;
  let githubBaseUrl = null;
  let treeMode = 0; // 0 = directory tree, 1 = change-type -> directory tree
  let collapsedGroups = {};

  const commitListEl = document.getElementById('commitList');
  const commitDetailEl = document.getElementById('commitDetail');

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDisplayDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }

  // ---------- Resizer ----------
  (function () {
    const resizer = document.getElementById('resizer');
    let dragging = false;
    resizer.addEventListener('pointerdown', (e) => {
      dragging = true;
      resizer.classList.add('active');
      resizer.setPointerCapture(e.pointerId);
    });
    resizer.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = commitListEl.parentElement.getBoundingClientRect();
      const w = Math.max(180, Math.min(600, e.clientX - rect.left));
      commitListEl.style.width = w + 'px';
    });
    resizer.addEventListener('pointerup', (e) => {
      dragging = false;
      resizer.classList.remove('active');
      resizer.releasePointerCapture(e.pointerId);
    });
  })();

  // ---------- Keyboard navigation ----------
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeIdx < visibleCommits.length - 1) selectCommit(activeIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIdx > 0) selectCommit(activeIdx - 1);
    }
  });

  // ---------- Toolbar wiring ----------
  document.getElementById('refreshBtn').addEventListener('click', doRefresh);
  document.getElementById('dateFrom').addEventListener('change', doRefresh);
  document.getElementById('dateTo').addEventListener('change', doRefresh);

  document.getElementById('mergeToggle').addEventListener('click', () => {
    hideMergeCommits = !hideMergeCommits;
    document.getElementById('mergeToggle').classList.toggle('active', hideMergeCommits);
    filterCommits();
  });

  document.getElementById('authorBtn').addEventListener('click', () => {
    const authors = Array.from(new Set(allCommits.map((c) => c.author))).sort();
    vscode.postMessage({ command: 'showAuthorPicker', authors, selected: selectedAuthors });
  });

  function doRefresh() {
    const after = document.getElementById('dateFrom').value;
    const before = document.getElementById('dateTo').value;
    vscode.postMessage({ command: 'refresh', after, before });
  }

  // ---------- Commit list ----------
  function filterCommits() {
    visibleCommits = allCommits.filter((c) => {
      if (hideMergeCommits && c.isMerge) return false;
      if (selectedAuthors.length > 0 && !selectedAuthors.includes(c.author)) return false;
      return true;
    });
    renderList();
    if (visibleCommits.length > 0) {
      selectCommit(0);
    } else {
      activeIdx = -1;
      commitDetailEl.innerHTML = '<div class="placeholder">No commits match the current filters</div>';
    }
  }

  function renderList() {
    if (visibleCommits.length === 0) {
      commitListEl.innerHTML = '<div class="placeholder">No commits found</div>';
      return;
    }
    commitListEl.innerHTML = visibleCommits
      .map(
        (c, i) =>
          '<div class="commit-row' + (i === activeIdx ? ' active' : '') + '" data-idx="' + i + '">' +
          '<div class="hash">' + c.shortHash + '</div>' +
          '<div class="subject">' + escapeHtml(c.subject) + '</div>' +
          '<div class="meta">' + escapeHtml(c.author) + ' &middot; ' + formatDisplayDate(c.date) + '</div>' +
          '</div>'
      )
      .join('');

    commitListEl.querySelectorAll('.commit-row').forEach((el) => {
      el.addEventListener('click', () => selectCommit(Number(el.dataset.idx)));
    });
  }

  function selectCommit(idx) {
    activeIdx = idx;
    renderList();
    const el = commitListEl.querySelector('.commit-row[data-idx="' + idx + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
    collapsedGroups = {};
    showCommitFiles(visibleCommits[idx]);
  }

  // ---------- Commit detail / file tree ----------
  function showCommitFiles(c) {
    if (!c) return;
    const githubBtn = githubBaseUrl
      ? '<button class="icon-btn" id="githubBtn" title="Open on GitHub">' + window.SVG_EXTERNAL_LINK + '</button>'
      : '';

    commitDetailEl.innerHTML =
      '<div class="detail-header">' +
      '<strong>' + escapeHtml(c.subject) + '</strong>' +
      '<span class="grow"></span>' +
      '<button id="swapViewBtn">Swap View</button>' +
      '<button id="toggleTreeBtn">Expand/Collapse All</button>' +
      '<button id="openDetailBtn">Open Detail</button>' +
      '<button id="copyFilesBtn" class="copy-btn">' + window.SVG_COPY + ' Copy Files</button>' +
      '<button id="copyHashBtn" class="copy-btn">' + window.SVG_COPY + ' Copy Hash</button>' +
      githubBtn +
      '</div>' +
      '<div class="file-tree" id="fileTree"></div>';

    renderTree(c);

    document.getElementById('swapViewBtn').addEventListener('click', () => {
      treeMode = treeMode === 0 ? 1 : 0;
      collapsedGroups = {};
      renderTree(c);
    });

    document.getElementById('toggleTreeBtn').addEventListener('click', () => {
      const anyOpen = Object.values(collapsedGroups).some((v) => v === false);
      const keys = Object.keys(collapsedGroups);
      const collapseAll = keys.length === 0 || anyOpen;
      // Re-render fully collapsed or expanded by forcing all known keys
      forceCollapseState(c, collapseAll);
      renderTree(c);
    });

    document.getElementById('openDetailBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'showCommit', hash: c.hash });
    });

    document.getElementById('copyFilesBtn').addEventListener('click', (e) => {
      const files = c.files.map((f) => f.file).join('\n');
      navigator.clipboard.writeText(files);
      flashCopied(e.currentTarget);
    });

    document.getElementById('copyHashBtn').addEventListener('click', (e) => {
      navigator.clipboard.writeText(c.hash);
      flashCopied(e.currentTarget);
    });

    const githubBtnEl = document.getElementById('githubBtn');
    if (githubBtnEl) {
      githubBtnEl.addEventListener('click', () => vscode.postMessage({ command: 'openGitHub', hash: c.hash }));
    }
  }

  function flashCopied(btn) {
    btn.classList.add('copied');
    const original = btn.innerHTML;
    btn.innerHTML = window.SVG_CHECK + ' Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1500);
  }

  function forceCollapseState(c, collapse) {
    const keys = collectNodeKeys(c);
    keys.forEach((k) => (collapsedGroups[k] = collapse));
  }

  function collectNodeKeys(c) {
    const keys = [];
    if (treeMode === 0) {
      const dirs = new Set();
      c.files.forEach((f) => {
        const parts = f.file.split('/');
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? acc + '/' + parts[i] : parts[i];
          dirs.add(acc);
        }
      });
      dirs.forEach((d) => keys.push(d));
    } else {
      const groups = new Set();
      c.files.forEach((f) => {
        const label = STATUS_LABELS[f.status] || f.status;
        groups.add(label);
        const parts = f.file.split('/');
        let acc = label;
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc + '/' + parts[i];
          groups.add(acc);
        }
      });
      groups.forEach((g) => keys.push(g));
    }
    return keys;
  }

  function renderTree(c) {
    const container = document.getElementById('fileTree');
    if (!container) return;
    if (c.files.length === 0) {
      container.innerHTML = '<div class="placeholder" style="height:auto;padding:12px;">No file changes recorded for this commit.</div>';
      return;
    }
    const html = treeMode === 0 ? renderTreeByDir(c.files) : renderTreeByChangeType(c.files);
    container.innerHTML = html;

    container.querySelectorAll('[data-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.toggle;
        collapsedGroups[key] = !collapsedGroups[key];
        renderTree(c);
      });
    });
    container.querySelectorAll('[data-file]').forEach((el) => {
      el.addEventListener('click', () => vscode.postMessage({ command: 'openFile', file: el.dataset.file }));
      el.addEventListener('dblclick', () => vscode.postMessage({ command: 'openFile', file: el.dataset.file }));
    });
  }

  function buildDirTree(files) {
    const root = { name: '', dirs: new Map(), files: [] };
    files.forEach((f) => {
      const parts = f.file.split('/');
      let node = root;
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? acc + '/' + parts[i] : parts[i];
        if (!node.dirs.has(parts[i])) {
          node.dirs.set(parts[i], { name: parts[i], path: acc, dirs: new Map(), files: [] });
        }
        node = node.dirs.get(parts[i]);
      }
      node.files.push({ name: parts[parts.length - 1], status: f.status, file: f.file });
    });
    return root;
  }

  function renderNode(node, prefix, isLast, keyPrefix, lines) {
    const dirEntries = Array.from(node.dirs.values());
    const totalEntries = dirEntries.length + node.files.length;
    let idx = 0;

    dirEntries.forEach((dir) => {
      idx += 1;
      const last = idx === totalEntries;
      const connector = prefix === null ? '' : prefix + (last ? '└── ' : '├── ');
      const key = dir.path;
      const collapsed = !!collapsedGroups[key];
      const chevron = collapsed ? window.SVG_CHEVRON_RIGHT : window.SVG_CHEVRON_DOWN;
      lines.push(
        '<div class="tree-line" data-toggle="' + key + '">' + connector + chevron + ' ' + escapeHtml(dir.name) + '/</div>'
      );
      if (!collapsed) {
        const childPrefix = prefix === null ? '' : prefix + (last ? '    ' : '│   ');
        renderNode(dir, childPrefix, last, key, lines);
      }
    });

    node.files.forEach((f) => {
      idx += 1;
      const last = idx === totalEntries;
      const connector = prefix === null ? '' : prefix + (last ? '└── ' : '├── ');
      lines.push(
        '<div class="tree-line" data-file="' + f.file + '">' + connector +
        '<span class="status-dot ' + f.status + '"></span>' + escapeHtml(f.name) + '</div>'
      );
    });
  }

  function renderTreeByDir(files) {
    const root = buildDirTree(files);
    const lines = [];
    renderNode(root, null, true, '', lines);
    return lines.join('');
  }

  function renderTreeByChangeType(files) {
    const groups = new Map();
    files.forEach((f) => {
      const label = STATUS_LABELS[f.status] || f.status;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(f);
    });

    const lines = [];
    Array.from(groups.keys())
      .sort()
      .forEach((label) => {
        const collapsed = !!collapsedGroups[label];
        const chevron = collapsed ? window.SVG_CHEVRON_RIGHT : window.SVG_CHEVRON_DOWN;
        lines.push('<div class="tree-line" data-toggle="' + label + '">' + chevron + ' <strong>' + label + '</strong></div>');
        if (!collapsed) {
          const root = buildDirTree(groups.get(label));
          renderNode(root, '  ', true, label, lines);
        }
      });

    return lines.join('');
  }

  // ---------- Messages from extension ----------
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'data') {
      allCommits = msg.commits;
      githubBaseUrl = msg.githubBaseUrl;

      if (selectedAuthors.length === 0) {
        const botLike = Array.from(new Set(allCommits.map((c) => c.author))).filter((a) => /\[bot\]/i.test(a));
        // Auto-exclude bot authors from the initial view by pre-selecting all non-bot authors.
        const nonBots = Array.from(new Set(allCommits.map((c) => c.author))).filter((a) => !botLike.includes(a));
        if (botLike.length > 0) selectedAuthors = nonBots;
      }

      filterCommits();
    } else if (msg.command === 'authorPickerResult') {
      selectedAuthors = msg.authors;
      filterCommits();
    } else if (msg.command === 'error') {
      commitListEl.innerHTML = '<div class="error-banner">' + escapeHtml(msg.message) + '</div>';
    }
  });
})();
