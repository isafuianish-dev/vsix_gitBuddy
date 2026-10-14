const vscode = require('vscode');

let item = null;

function init() {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  return item;
}

function start(label) {
  if (!item) return;
  item.text = `$(loading~spin) GitBuddy: ${label}`;
  item.show();
}

function stop() {
  if (!item) return;
  item.hide();
}

module.exports = { init, start, stop };
