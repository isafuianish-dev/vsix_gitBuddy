const { requireRepo } = require('../../util/repoUtils');
const ChangedFilesPanel = require('../../webview/changedFilesPanel');

async function showChangedFiles(context) {
  const cwd = await requireRepo();
  if (!cwd) return;

  ChangedFilesPanel.show(context, cwd);
}

module.exports = { showChangedFiles };
