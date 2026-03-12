# Human Bridges Deployment

## Live URL
**https://joined-senator-activation-prevent.trycloudflare.com**

## What's Running
- Node.js server on port 4380
- SQLite database for persistence
- Health endpoint: `/health`
- Metrics endpoint: `/api/metrics`

## Local Development
```bash
npm run dev   # starts server on localhost:4380
```

## Deployment
Dockerfile included - ready for any container hosting.
