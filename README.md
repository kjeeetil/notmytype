# Typing Race – Docker + Cloud Build starter

This is a minimal real-time typing-race MVP with:
- **server/**: Socket.IO Node server (WebSocket), Cloud Run-ready
- **web/**: Next.js app (standalone output), Cloud Run-ready
- **cloudbuild.yaml**: Google Cloud Build pipeline to build, push, and deploy both services
- **docker-compose.yml**: Local dev

## Local quickstart

```bash
docker compose up --build
# Web → http://localhost:3000
# Server health → http://localhost:8081/
```

## Google Cloud setup (one-time)

```bash
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com

# Create Artifact Registry (replace region & repo)
gcloud artifacts repositories create typing-race   --repository-format=docker   --location=europe-north1   --description="Typing race images"
```

## Cloud Build trigger

Create a GitHub trigger that runs `cloudbuild.yaml` on `main`:

Substitutions (example values):
- `_PROJECT_ID` = your-project-id
- `_REGION` = europe-north1 (Finland – close to Oslo)
- `_AR_REPO` = typing-race
- `_SERVICE_SERVER` = typing-race-server
- `_SERVICE_WEB` = typing-race-web
- `_MIN_INSTANCES` = 0
- `_MAX_INSTANCES` = 10
- `_SERVER_CONCURRENCY` = 80

The pipeline will:
1. Build & push images to Artifact Registry
2. Deploy the server service
3. Fetch the server URL
4. Deploy the web service with `NEXT_PUBLIC_SOCKET_URL` pointing at the server

## Notes / Next steps
- CORS: server currently allows all origins for demo purposes.
- Scale/latency: tune `min/max instances` and concurrency in the deploy step.
- Persistence & auth: add Postgres/Redis/NextAuth as you evolve.
- Observability: add structured logs, error tracking, and tracing if needed.
