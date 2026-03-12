const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'human-bridges.db');

const DEFAULT_STATE_KEYS = ['outrage', 'fear', 'stress', 'echo', 'goals', 'contact', 'empathy'];

let db;

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      state TEXT NOT NULL,
      reports_count INTEGER DEFAULT 0,
      flagged INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      scenario_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    );
    
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      share_token TEXT,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
    CREATE INDEX IF NOT EXISTS idx_reports_scenario ON reports(scenario_id);
  `);
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

async function ensureDataDir() {
  const fs = require('node:fs/promises');
  await fs.mkdir(DATA_DIR, { recursive: true });
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
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) return 'PAYLOAD_TOO_LARGE';
    chunks.push(chunk);
  }
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

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function serveStatic(pathname, res) {
  const fs = require('node:fs/promises');
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, "." + rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
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
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      const scenarioCount = db.prepare('SELECT COUNT(*) as count FROM scenarios').get();
      const shareCount = db.prepare('SELECT COUNT(*) as count FROM shares').get();
      const reportCount = db.prepare('SELECT COUNT(*) as count FROM reports').get();
      return sendJson(res, 200, { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        metrics: {
          scenarios: scenarioCount.count,
          shares: shareCount.count,
          reports: reportCount.count
        }
      });
    }

    // Metrics endpoint for dashboard
    if (req.method === 'GET' && pathname === '/api/metrics') {
      const total = db.prepare('SELECT COUNT(*) as count FROM scenarios').get();
      const flagged = db.prepare('SELECT COUNT(*) as count FROM scenarios WHERE flagged = 1').get();
      const recent = db.prepare('SELECT COUNT(*) as count FROM scenarios WHERE created_at > datetime("now", "-7 days")').get();
      return sendJson(res, 200, {
        total: total.count,
        flagged: flagged.count,
        lastWeek: recent.count
      });
    }

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.method === 'POST' && pathname === '/api/scenarios') {
      const body = await readBody(req);
      if (body === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'payload too large' });
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

      const stmt = db.prepare(`
        INSERT INTO scenarios (id, name, notes, state, reports_count, flagged, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(scenario.id, scenario.name, scenario.notes, JSON.stringify(scenario.state), 0, 0, now, now);
      
      return sendJson(res, 201, { scenario });
    }

    const scenarioGet = matchRoute('/api/scenarios/:id', pathname);
    if (req.method === 'GET' && scenarioGet) {
      const stmt = db.prepare('SELECT * FROM scenarios WHERE id = ?');
      const row = stmt.get(scenarioGet.id);
      if (!row) return sendJson(res, 404, { error: 'scenario not found' });
      const scenario = {
        id: row.id,
        name: row.name,
        notes: row.notes,
        state: JSON.parse(row.state),
        reportsCount: row.reports_count,
        flagged: Boolean(row.flagged),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return sendJson(res, 200, { scenario });
    }

    const scenarioShare = matchRoute('/api/scenarios/:id/share', pathname);
    if (req.method === 'POST' && scenarioShare) {
      const stmt = db.prepare('SELECT * FROM scenarios WHERE id = ?');
      const row = stmt.get(scenarioShare.id);
      if (!row) return sendJson(res, 404, { error: 'scenario not found' });

      const now = new Date().toISOString();
      const token = randomId('shr');
      const shareStmt = db.prepare('INSERT INTO shares (token, scenario_id, created_at) VALUES (?, ?, ?)');
      shareStmt.run(token, row.id, now);

      return sendJson(res, 201, {
        share: { token, scenarioId: row.id, createdAt: now },
        shareUrl: `/api/share/${token}`,
      });
    }

    const shareGet = matchRoute('/api/share/:token', pathname);
    if (req.method === 'GET' && shareGet) {
      const shareStmt = db.prepare('SELECT * FROM shares WHERE token = ?');
      const shareRow = shareStmt.get(shareGet.token);
      if (!shareRow) return sendJson(res, 404, { error: 'share link not found' });
      
      const scenarioStmt = db.prepare('SELECT * FROM scenarios WHERE id = ?');
      const scenarioRow = scenarioStmt.get(shareRow.scenario_id);
      if (!scenarioRow) return sendJson(res, 404, { error: 'scenario not found' });

      const scenario = {
        id: scenarioRow.id,
        name: scenarioRow.name,
        notes: scenarioRow.notes,
        state: JSON.parse(scenarioRow.state),
        reportsCount: scenarioRow.reports_count,
        flagged: Boolean(scenarioRow.flagged),
        createdAt: scenarioRow.created_at,
        updatedAt: scenarioRow.updated_at,
      };
      return sendJson(res, 200, { scenario, share: { token: shareRow.token, createdAt: shareRow.created_at } });
    }

    if (req.method === 'POST' && pathname === '/api/reports') {
      const body = await readBody(req);
      if (body === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'payload too large' });
      if (!body) return sendJson(res, 400, { error: 'invalid JSON body' });
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) return sendJson(res, 400, { error: 'reason is required' });
      if (!body.scenarioId && !body.shareToken) {
        return sendJson(res, 400, { error: 'scenarioId or shareToken is required' });
      }

      let scenarioId = body.scenarioId;
      if (!scenarioId && body.shareToken) {
        const shareStmt = db.prepare('SELECT * FROM shares WHERE token = ?');
        const shareRow = shareStmt.get(body.shareToken);
        if (!shareRow) return sendJson(res, 404, { error: 'share link not found' });
        scenarioId = shareRow.scenario_id;
      }

      const scenarioStmt = db.prepare('SELECT * FROM scenarios WHERE id = ?');
      const scenarioRow = scenarioStmt.get(scenarioId);
      if (!scenarioRow) return sendJson(res, 404, { error: 'scenario not found' });

      const now = new Date().toISOString();
      const reportId = randomId('rpt');
      const report = {
        id: reportId,
        scenarioId,
        shareToken: body.shareToken || null,
        reason,
        details: typeof body.details === 'string' ? body.details.trim() : '',
        createdAt: now,
      };

      const reportStmt = db.prepare(`
        INSERT INTO reports (id, scenario_id, share_token, reason, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      reportStmt.run(report.id, scenarioId, report.shareToken, report.reason, report.details, now);

      const newCount = scenarioRow.reports_count + 1;
      const flagged = newCount >= 3 ? 1 : 0;
      const updateStmt = db.prepare('UPDATE scenarios SET reports_count = ?, flagged = ?, updated_at = ? WHERE id = ?');
      updateStmt.run(newCount, flagged, now, scenarioId);

      return sendJson(res, 201, {
        report,
        moderation: {
          scenarioId,
          reportsCount: newCount,
          flagged: Boolean(flagged),
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
  (async () => {
    await ensureDataDir();
    initDb();
    const port = Number(process.env.PORT || 4380);
    await startServer(port);
    process.stdout.write(`Human Bridges server running on http://localhost:${port}\n`);
  })();
}

module.exports = { createServer, startServer, DEFAULT_STATE_KEYS, initDb, ensureDataDir };
