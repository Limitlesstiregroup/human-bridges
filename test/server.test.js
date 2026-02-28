const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { createServer, DEFAULT_STATE_KEYS } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');

function baseState() {
  return Object.fromEntries(DEFAULT_STATE_KEYS.map((key) => [key, 50]));
}

async function setup() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test('save and retrieve scenario', async () => {
  const ctx = await setup();
  try {
    const createRes = await fetch(`${ctx.baseUrl}/api/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'My scenario', state: baseState() }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.scenario.id);

    const getRes = await fetch(`${ctx.baseUrl}/api/scenarios/${created.scenario.id}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.scenario.id, created.scenario.id);
    assert.equal(fetched.scenario.name, 'My scenario');
  } finally {
    await ctx.close();
  }
});

test('create share and resolve scenario from share token', async () => {
  const ctx = await setup();
  try {
    const createRes = await fetch(`${ctx.baseUrl}/api/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Share me', state: baseState() }),
    });
    const created = await createRes.json();

    const shareRes = await fetch(`${ctx.baseUrl}/api/scenarios/${created.scenario.id}/share`, { method: 'POST' });
    assert.equal(shareRes.status, 201);
    const shared = await shareRes.json();
    assert.match(shared.shareUrl, /\/api\/share\//);

    const resolveRes = await fetch(`${ctx.baseUrl}${shared.shareUrl}`);
    assert.equal(resolveRes.status, 200);
    const resolved = await resolveRes.json();
    assert.equal(resolved.scenario.id, created.scenario.id);
    assert.equal(resolved.share.token, shared.share.token);
  } finally {
    await ctx.close();
  }
});

test('report endpoint increments counts and flags scenario on threshold', async () => {
  const ctx = await setup();
  try {
    const createRes = await fetch(`${ctx.baseUrl}/api/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Moderate me', state: baseState() }),
    });
    const created = await createRes.json();

    for (let i = 1; i <= 3; i += 1) {
      const reportRes = await fetch(`${ctx.baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId: created.scenario.id, reason: `reason ${i}` }),
      });
      assert.equal(reportRes.status, 201);
      const report = await reportRes.json();
      assert.equal(report.moderation.reportsCount, i);
      assert.equal(report.moderation.flagged, i >= 3);
    }

    const getRes = await fetch(`${ctx.baseUrl}/api/scenarios/${created.scenario.id}`);
    const fetched = await getRes.json();
    assert.equal(fetched.scenario.reportsCount, 3);
    assert.equal(fetched.scenario.flagged, true);
  } finally {
    await ctx.close();
  }
});

test('validation rejects incomplete payloads', async () => {
  const ctx = await setup();
  try {
    const badScenario = await fetch(`${ctx.baseUrl}/api/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'broken', state: { outrage: 10 } }),
    });
    assert.equal(badScenario.status, 400);

    const badReport = await fetch(`${ctx.baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'x' }),
    });
    assert.equal(badReport.status, 400);
  } finally {
    await ctx.close();
  }
});
