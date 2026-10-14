const vscode = require('vscode');

/**
 * Shows a Yes/No/Cancel warning dialog and returns the chosen label (or undefined if dismissed).
 * @param {string} message
 * @returns {Promise<string|undefined>}
 */
async function confirm(message) {
  const choice = await vscode.window.showWarningMessage(message, 'Yes', 'No', 'Cancel');
  return choice;
}

module.exports = { confirm };
