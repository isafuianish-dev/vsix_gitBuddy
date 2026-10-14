/* Shared CSS used across GitBuddy webview panels. Keeps every panel visually consistent
   and theme-aware (uses VS Code CSS variables so light/dark/high-contrast all work). */

const sharedStyles = `
:root {
  --gb-border: var(--vscode-panel-border, #454545);
  --gb-bg: var(--vscode-editor-background);
  --gb-fg: var(--vscode-foreground);
  --gb-dim: var(--vscode-descriptionForeground);
  --gb-accent: var(--vscode-focusBorder, #007fd4);
  --gb-added: #3fb950;
  --gb-modified: #d29922;
  --gb-deleted: #f85149;
  --gb-renamed: #58a6ff;
  --gb-copied: #a371f7;
  --gb-typechanged: #8b949e;
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
  padding: 0;
  color: var(--gb-fg);
  background: var(--gb-bg);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
}

body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background-color: var(--vscode-scrollbarSlider-background); border-radius: 0; }
::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground); }
::-webkit-scrollbar-thumb:active { background-color: var(--vscode-scrollbarSlider-activeBackground); }

a { color: var(--vscode-textLink-foreground); }

/* ---------- Toolbar ---------- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--gb-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar input[type="text"],
.toolbar input[type="date"],
.toolbar input[type="search"] {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 3px;
  padding: 4px 8px;
  font-size: 12px;
  outline: none;
}

.toolbar input:focus {
  border-color: var(--gb-accent);
}

.spacer { flex: 1; }

/* ---------- Buttons ---------- */
button, .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, var(--gb-fg));
  border: none;
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
button:hover, .btn:hover { filter: brightness(1.15); }
button:active, .btn:active { filter: brightness(0.95); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.icon-btn {
  background: transparent;
  padding: 4px;
  border-radius: 3px;
}
.icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); }

.pill {
  border: 1px solid var(--gb-border);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  background: transparent;
  color: var(--gb-fg);
}
.pill.active {
  background: var(--gb-accent);
  border-color: var(--gb-accent);
  color: #fff;
}

/* ---------- Split pane ---------- */
.split {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.pane-left {
  width: 290px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--gb-border);
}

.pane-right {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.resizer {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
}
.resizer:hover, .resizer.active {
  background: var(--gb-accent);
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--gb-dim);
  font-size: 13px;
  flex-direction: column;
  gap: 8px;
}

/* ---------- Lists / cards ---------- */
.list-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--gb-border);
  cursor: pointer;
}
.list-item:hover { background: var(--vscode-list-hoverBackground); }
.list-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.list-item .title { font-weight: 600; font-size: 12.5px; }
.list-item .meta { font-size: 11px; color: var(--gb-dim); margin-top: 2px; }

/* ---------- Table ---------- */
table.gb-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12.5px;
}
table.gb-table th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--gb-border);
  color: var(--gb-dim);
  font-weight: 600;
  position: sticky;
  top: 0;
  background: var(--gb-bg);
  z-index: 1;
}
table.gb-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--gb-border);
  vertical-align: middle;
}
table.gb-table tr:hover td { background: var(--vscode-list-hoverBackground); }

/* ---------- Badges ---------- */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
}
.badge-added { background: rgba(63,185,80,.15); color: var(--gb-added); }
.badge-modified { background: rgba(210,153,34,.15); color: var(--gb-modified); }
.badge-deleted { background: rgba(248,81,73,.15); color: var(--gb-deleted); }
.badge-renamed { background: rgba(88,166,255,.15); color: var(--gb-renamed); }
.badge-copied { background: rgba(163,113,247,.15); color: var(--gb-copied); }
.badge-typechanged { background: rgba(139,148,158,.15); color: var(--gb-typechanged); }
.badge-pass { background: rgba(63,185,80,.15); color: var(--gb-added); }
.badge-fail { background: rgba(248,81,73,.15); color: var(--gb-deleted); }

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.status-dot.A { background: var(--gb-added); }
.status-dot.M { background: var(--gb-modified); }
.status-dot.D { background: var(--gb-deleted); }
.status-dot.R { background: var(--gb-renamed); }
.status-dot.C { background: var(--gb-copied); }
.status-dot.T { background: var(--gb-typechanged); }

/* ---------- Diff view ---------- */
.diff-line { white-space: pre; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.5; padding: 0 8px; }
.diff-add { background: rgba(63,185,80,.12); color: var(--gb-added); }
.diff-del { background: rgba(248,81,73,.12); color: var(--gb-deleted); }
.diff-hunk { color: var(--gb-copied); }
.diff-meta { color: var(--gb-dim); }

.code-view { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
.code-line { display: flex; }
.code-line .ln { width: 44px; flex-shrink: 0; text-align: right; padding-right: 10px; color: var(--gb-dim); user-select: none; }
.code-line .content { white-space: pre; }

/* ---------- Modal ---------- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-backdrop.hidden { display: none; }
.modal {
  background: var(--gb-bg);
  border: 1px solid var(--gb-border);
  border-radius: 6px;
  width: 520px;
  max-width: 92vw;
  max-height: 86vh;
  overflow-y: auto;
  padding: 16px;
}
.modal h2 { margin: 0 0 12px; font-size: 15px; }
.modal label { display: block; font-size: 11px; color: var(--gb-dim); margin: 10px 0 4px; }
.modal input[type="text"], .modal textarea {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 3px;
  padding: 6px 8px;
  font-size: 12.5px;
  font-family: inherit;
}
.modal textarea { resize: vertical; min-height: 90px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

/* ---------- Misc ---------- */
.spin { animation: gb-spin 1s linear infinite; }
@keyframes gb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.copy-btn { display: inline-flex; align-items: center; }
.copy-btn .icon-copy, .copy-btn .icon-check { display: none; }
.copy-btn.copied .icon-copy { display: none; }
.copy-btn:not(.copied) .icon-copy { display: inline-flex; }
.copy-btn.copied .icon-check { display: inline-flex; }
.copy-btn:not(.copied) .icon-check { display: none; }

.error-banner {
  background: rgba(248,81,73,.12);
  color: var(--gb-deleted);
  border: 1px solid rgba(248,81,73,.35);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 8px 10px;
  font-size: 12.5px;
}

.tree-line { white-space: pre; font-family: var(--vscode-editor-font-family, monospace); font-size: 12.5px; padding: 1px 4px; cursor: pointer; border-radius: 3px; }
.tree-line:hover { background: var(--vscode-list-hoverBackground); }
`;

module.exports = sharedStyles;
