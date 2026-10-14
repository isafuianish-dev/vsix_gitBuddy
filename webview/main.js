(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName !== 'INPUT') e.preventDefault();
  });

  document.querySelectorAll('.group-header').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = el.dataset.group;
      el.classList.toggle('open');
      document.querySelector('[data-group-items="' + idx + '"]').classList.toggle('open');
    });
  });

  // Open the first group by default.
  const firstHeader = document.querySelector('.group-header');
  if (firstHeader) {
    firstHeader.classList.add('open');
    document.querySelector('[data-group-items="0"]').classList.add('open');
  }

  document.querySelectorAll('.action-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      let command = el.dataset.command;
      if (e.ctrlKey && command === 'gitbuddy.checkoutRemote') {
        command = 'gitbuddy.checkoutLocal';
      }
      vscode.postMessage({ command });
    });
  });

  document.getElementById('settingsBtn').addEventListener('click', () => vscode.postMessage({ command: '__settings__' }));
  document.getElementById('logBtn').addEventListener('click', () => vscode.postMessage({ command: '__showLog__' }));

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spin');
    vscode.postMessage({ command: '__refresh__' });
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    const branch = document.getElementById('branchName').textContent;
    navigator.clipboard.writeText(branch);
    const btn = document.getElementById('copyBtn');
    btn.classList.add('copied');
    const copyIcon = btn.querySelector('.copy-icon');
    const copiedIcon = btn.querySelector('.copied-icon');
    copyIcon.style.display = 'none';
    copiedIcon.style.display = 'inline-flex';
    setTimeout(() => {
      copyIcon.style.display = '';
      copiedIcon.style.display = 'none';
      btn.classList.remove('copied');
    }, 1500);
  });

  window.addEventListener('focus', () => document.body.classList.add('sidebar-focused'));
  window.addEventListener('blur', () => document.body.classList.remove('sidebar-focused'));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    const el = document.querySelector('.action-item[data-key="' + e.key.toLowerCase() + '"]');
    if (el) el.click();
  });

  function update(data) {
    refreshBtn.classList.remove('spin');

    if (!data.branch) {
      document.getElementById('branchName').textContent = 'No repository';
      document.getElementById('statusText').textContent = 'Open a Git repository to get started.';
      return;
    }

    document.getElementById('branchName').textContent = data.branch;
    const branchRow = document.getElementById('branchRow');
    const isFeature = data.branch.startsWith('feature');
    branchRow.classList.toggle('warn', !isFeature);

    const statusText = document.getElementById('statusText');
    if (data.total === 0) {
      statusText.textContent = 'Working tree clean';
      statusText.className = 'clean';
    } else {
      statusText.textContent = data.total + ' changed file' + (data.total === 1 ? '' : 's');
      statusText.className = 'dirty';
    }

    document.getElementById('tileModified').textContent = data.counts.modified;
    document.getElementById('tileAdded').textContent = data.counts.added;
    document.getElementById('tileDeleted').textContent = data.counts.deleted;
    document.getElementById('tileRenamed').textContent = data.counts.renamed;
    document.getElementById('tileUntracked').textContent = data.counts.untracked;
    document.getElementById('tileSync').textContent = data.syncCount;
    document.getElementById('tileSyncLabel').textContent = data.syncLabel;
    const syncWrap = document.getElementById('tileSyncWrap');
    syncWrap.classList.toggle('ahead', data.syncLabel === 'Ahead');
    syncWrap.classList.toggle('behind', data.syncLabel === 'Behind');
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'update') update(msg);
    else if (msg.command === 'setFocus') {
      document.body.classList.add('sidebar-focused');
      window.focus();
    }
  });

  vscode.postMessage({ command: '__ready__' });
})();
