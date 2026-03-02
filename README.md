# Human Bridges

Human Bridges is a lightweight web app + API for saving, sharing, and moderating social-fragmentation simulation scenarios.

## What it does

- Saves simulation scenarios (`POST /api/scenarios`)
- Fetches saved scenarios (`GET /api/scenarios/:id`)
- Generates share links (`POST /api/scenarios/:id/share`)
- Resolves share links (`GET /api/share/:token`)
- Accepts moderation reports and flags scenarios after repeated reports (`POST /api/reports`)

## Requirements

- Node.js 18+ (Node 20+ recommended)
- npm

## Setup

```bash
npm install
```

## Run locally

```bash
npm run start
```

The server starts on `http://localhost:4380` by default.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `4380` | HTTP port for the API + static frontend |

## Quality checks

```bash
npm run build
npm run lint
npm test
```

## API quick examples

Create scenario:

```bash
curl -sS -X POST http://localhost:4380/api/scenarios \
  -H 'content-type: application/json' \
  -d '{
    "name":"Example",
    "notes":"demo",
    "state":{
      "outrage":50,
      "fear":40,
      "stress":45,
      "echo":55,
      "goals":50,
      "contact":50,
      "empathy":50
    }
  }'
```

Report scenario:

```bash
curl -sS -X POST http://localhost:4380/api/reports \
  -H 'content-type: application/json' \
  -d '{"scenarioId":"<scenario-id>","reason":"misleading framing"}'
```
