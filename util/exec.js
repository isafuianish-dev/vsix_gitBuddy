const { execFile } = require('child_process');
const outputLog = require('./outputLog');
const spinner = require('./spinner');

/**
 * Runs a git command and resolves with trimmed stdout.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<string>}
 */
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    spinner.start(args[0] || 'git');
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      spinner.stop();
      const cmdText = `git ${args.join(' ')}`;
      if (err) {
        outputLog.log('ERROR', cmdText, { cwd, stderr: stderr || err.message });
        reject(new Error(stderr || err.message));
        return;
      }
      outputLog.log('EXEC', cmdText, { cwd });
      resolve((stdout || '').trim());
    });
  });
}

module.exports = { git };
