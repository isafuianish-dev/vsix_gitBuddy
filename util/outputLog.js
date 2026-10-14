const vscode = require('vscode');

let channel = null;

function init() {
  channel = vscode.window.createOutputChannel('GitBuddy');
  return channel;
}

function log(header, message, meta) {
  if (!channel) return;
  const time = new Date().toLocaleTimeString();
  channel.appendLine(`[${time}] ${header}${message ? ' — ' + message : ''}`);
  if (meta !== undefined) {
    try {
      channel.appendLine(JSON.stringify(meta, null, 2));
    } catch (e) {
      channel.appendLine(String(meta));
    }
  }
}

function show() {
  if (channel) channel.show(true);
}

module.exports = { init, log, show };
