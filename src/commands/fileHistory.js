const vscode = require('vscode');
const path = require('path');
const { git } = require('../../util/exec');
const { requireRepo } = require('../../util/repoUtils');
const FileHistoryPanel = require('../../webview/fileHistoryPanel');

async function fileHistory(context) {
  const repoRoot = await requireRepo();
  if (!repoRoot) return;

  let files = [];
  try {
    const out = await git(['ls-files'], repoRoot);
    files = out.split('\n').filter(Boolean);
  } catch (e) {
    vscode.window.showErrorMessage(`GitBuddy: Failed to list tracked files — ${e.message}`);
    return;
  }

  let initialFile;
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const absPath = activeEditor.document.uri.fsPath;
    if (absPath.startsWith(repoRoot)) {
      const rel = path.relative(repoRoot, absPath).replace(/\\/g, '/');
      if (files.includes(rel)) initialFile = rel;
    }
  }

  FileHistoryPanel.show(context, repoRoot, initialFile, files);
}

module.exports = { fileHistory };
