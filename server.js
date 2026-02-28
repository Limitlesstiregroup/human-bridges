const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SCENARIOS_FILE = path.join(DATA_DIR, 'scenarios.json');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

const DEFAULT_STATE_KEYS = ['outrage', 'fear', 'stress', 'echo', 'goals', 'contact', 'empathy'];

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await Promise.all([
    ensureJsonFile(SCENARIOS_FILE, []),
    ensureJsonFile(SHARES_FILE, []),
    ensureJsonFile(REPORTS_FILE, []),
  ]);
}

async function ensureJsonFile(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(fallback, null, 2));
  }
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

function validateState(state) {
  if (!state || typeof state !== 'object') return 'state must be an object';
  for (const key of DEFAULT_STATE_KEYS) {
    const val = state[key];
    if (typeof val !== 'number' || Number.isNaN(val) || val < 0 || val > 100) {
      return `state.${key} must be a number between 0 and 100`;
    }
  }
  return null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function matchRoute(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = a[i];
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': contentType });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    await ensureDataFiles();

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.method === 'POST' && pathname === '/api/scenarios') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid JSON body' });
      const stateError = validateState(body.state);
      if (stateError) return sendJson(res, 400, { error: stateError });

      const now = new Date().toISOString();
      const scenario = {
        id: randomId('scn'),
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled scenario',
        notes: typeof body.notes === 'string' ? body.notes.trim() : '',
        state: body.state,
        reportsCount: 0,
        flagged: false,
        createdAt: now,
        updatedAt: now,
      };

      const scenarios = await readJson(SCENARIOS_FILE);
      scenarios.push(scenario);
      await writeJson(SCENARIOS_FILE, scenarios);
      return sendJson(res, 201, { scenario });
    }

    const scenarioGet = matchRoute('/api/scenarios/:id', pathname);
    if (req.method === 'GET' && scenarioGet) {
      const scenarios = await readJson(SCENARIOS_FILE);
      const scenario = scenarios.find((item) => item.id === scenarioGet.id);
      if (!scenario) return sendJson(res, 404, { error: 'scenario not found' });
      return sendJson(res, 200, { scenario });
    }

    const scenarioShare = matchRoute('/api/scenarios/:id/share', pathname);
    if (req.method === 'POST' && scenarioShare) {
      const scenarios = await readJson(SCENARIOS_FILE);
      const scenario = scenarios.find((item) => item.id === scenarioShare.id);
      if (!scenario) return sendJson(res, 404, { error: 'scenario not found' });

      const shares = await readJson(SHARES_FILE);
      const share = {
        token: randomId('shr'),
        scenarioId: scenario.id,
        createdAt: new Date().toISOString(),
      };
      shares.push(share);
      await writeJson(SHARES_FILE, shares);

      return sendJson(res, 201, {
        share,
        shareUrl: `/api/share/${share.token}`,
      });
    }

    const shareGet = matchRoute('/api/share/:token', pathname);
    if (req.method === 'GET' && shareGet) {
      const shares = await readJson(SHARES_FILE);
      const entry = shares.find((item) => item.token === shareGet.token);
      if (!entry) return sendJson(res, 404, { error: 'share link not found' });
      const scenarios = await readJson(SCENARIOS_FILE);
      const scenario = scenarios.find((item) => item.id === entry.scenarioId);
      if (!scenario) return sendJson(res, 404, { error: 'scenario not found' });
      return sendJson(res, 200, { scenario, share: entry });
    }

    if (req.method === 'POST' && pathname === '/api/reports') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid JSON body' });
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) return sendJson(res, 400, { error: 'reason is required' });
      if (!body.scenarioId && !body.shareToken) {
        return sendJson(res, 400, { error: 'scenarioId or shareToken is required' });
      }

      const scenarios = await readJson(SCENARIOS_FILE);
      let scenarioId = body.scenarioId;
      if (!scenarioId && body.shareToken) {
        const shares = await readJson(SHARES_FILE);
        const share = shares.find((item) => item.token === body.shareToken);
        if (!share) return sendJson(res, 404, { error: 'share link not found' });
        scenarioId = share.scenarioId;
      }

      const scenario = scenarios.find((item) => item.id === scenarioId);
      if (!scenario) return sendJson(res, 404, { error: 'scenario not found' });

      const report = {
        id: randomId('rpt'),
        scenarioId,
        shareToken: body.shareToken || null,
        reason,
        details: typeof body.details === 'string' ? body.details.trim() : '',
        createdAt: new Date().toISOString(),
      };

      const reports = await readJson(REPORTS_FILE);
      reports.push(report);
      await writeJson(REPORTS_FILE, reports);

      scenario.reportsCount += 1;
      scenario.flagged = scenario.reportsCount >= 3;
      scenario.updatedAt = new Date().toISOString();
      await writeJson(SCENARIOS_FILE, scenarios);

      return sendJson(res, 201, {
        report,
        moderation: {
          scenarioId,
          reportsCount: scenario.reportsCount,
          flagged: scenario.flagged,
        },
      });
    }

    return serveStatic(pathname, res);
  });
}

function startServer(port = Number(process.env.PORT || 4380)) {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  startServer().then(() => {
    process.stdout.write('Human Bridges server running on http://localhost:4380\n');
  });
}

module.exports = { createServer, startServer, DEFAULT_STATE_KEYS };
