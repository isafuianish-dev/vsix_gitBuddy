const https = require('https');
const outputLog = require('./outputLog');

const API_HOST = 'api.github.com';
const API_VERSION = '2022-11-28';

/**
 * Low-level request helper against api.github.com.
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {object|null} body
 * @returns {Promise<{status: number, headers: object, json: any}>}
 */
function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: API_HOST,
      path,
      method,
      headers: {
        'User-Agent': 'GitBuddy-VSCode-Extension',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        Authorization: `Bearer ${token}`,
      },
    };
    if (payload) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    outputLog.log('GITHUB API', `${method} ${path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          json = data;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, headers: res.headers, json });
        } else {
          const message =
            (json && json.message) || `GitHub API error (${res.statusCode})`;
          outputLog.log('GITHUB API ERROR', `${method} ${path}`, { status: res.statusCode, message });
          reject(new Error(message));
        }
      });
    });

    req.on('error', (err) => {
      outputLog.log('GITHUB API ERROR', `${method} ${path}`, { message: err.message });
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Parses a GitHub remote URL (HTTPS or SSH) into { owner, repo }, or null.
 * @param {string} remoteUrl
 */
function parseOwnerRepo(remoteUrl) {
  if (!remoteUrl) return null;
  const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

async function getDefaultBranch(owner, repo, token) {
  try {
    const { json } = await request('GET', `/repos/${owner}/${repo}`, token);
    return (json && json.default_branch) || 'main';
  } catch (e) {
    return 'main';
  }
}

async function getBranches(owner, repo, token) {
  const branches = [];
  let page = 1;
  for (;;) {
    const { json } = await request(
      'GET',
      `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      token
    );
    if (!Array.isArray(json) || json.length === 0) break;
    branches.push(...json.map((b) => b.name));
    if (json.length < 100) break;
    page += 1;
  }
  return branches;
}

async function createPullRequest(owner, repo, token, opts) {
  const { title, body, head, base, draft } = opts;
  const { json } = await request('POST', `/repos/${owner}/${repo}/pulls`, token, {
    title,
    body,
    head,
    base,
    draft: !!draft,
  });
  return json;
}

async function getCurrentUser(token) {
  const { json } = await request('GET', '/user', token);
  return json && json.login;
}

async function listPullRequests(owner, repo, token, opts) {
  const { state = 'open', page = 1, perPage = 10 } = opts || {};
  const { json } = await request(
    'GET',
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}&page=${page}`,
    token
  );
  return Array.isArray(json) ? json : [];
}

async function getPrCommits(owner, repo, token, prNumber) {
  const { json } = await request(
    'GET',
    `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`,
    token
  );
  return Array.isArray(json) ? json : [];
}

async function mergePr(owner, repo, token, prNumber) {
  const { json } = await request('PUT', `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, token, {
    merge_method: 'merge',
  });
  return json;
}

async function getPrReviews(owner, repo, token, prNumber) {
  const { json } = await request(
    'GET',
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`,
    token
  );
  return Array.isArray(json) ? json : [];
}

module.exports = {
  parseOwnerRepo,
  getDefaultBranch,
  getBranches,
  createPullRequest,
  getCurrentUser,
  listPullRequests,
  getPrCommits,
  mergePr,
  getPrReviews,
};
