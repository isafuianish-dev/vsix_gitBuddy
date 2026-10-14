const { requireRepo } = require('../../util/repoUtils');
const StatusPanel = require('../../webview/statusPanel');

async function showStatus(context, mainProvider) {
  const cwd = await requireRepo();
  if (!cwd) return;

  StatusPanel.show(context, cwd, mainProvider);
}

module.exports = { showStatus };
