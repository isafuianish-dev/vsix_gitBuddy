const { requireRepo } = require('../../util/repoUtils');
const FileReportPanel = require('../../webview/fileReportPanel');

async function fileChangeReport(context) {
  const cwd = await requireRepo();
  if (!cwd) return;

  FileReportPanel.show(context, cwd);
}

module.exports = { fileChangeReport };
