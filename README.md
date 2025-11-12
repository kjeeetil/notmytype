# Typing Race – Docker + Cloud Build starter

This is a minimal typing trainer with:
- **web/**: Next.js app (standalone output) that renders the UI _and_ exposes a `/api/scores` route for saving/fetching recent runs (stored in-memory per instance for now)
- **cloudbuild.yaml**: Google Cloud Build pipeline to build, push, and deploy the single web service
- **docker-compose.yml**: Local dev helper (builds the production image and maps it to port 3000)

> The previous Socket.IO backend still lives under `server/` if you want to resurrect realtime multiplayer later, but it is no longer part of the deployment path.

## Local quickstart

```bash
docker compose up --build
# Web → http://localhost:3000
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
- `_SERVICE_WEB` = typing-race-web
- `_MIN_INSTANCES` = 0
- `_MAX_INSTANCES` = 10
- `_KEEP_RELEASES` = 5

The pipeline will:
1. Build & push the web image to Artifact Registry (with BuildKit cache tagging)
2. Deploy that image to Cloud Run (single service)
3. Prune old image digests beyond `_KEEP_RELEASES`

## Notes / Next steps
- Scoreboard persistence is in-memory per Cloud Run instance. Wire it to Firestore, Supabase, Redis, etc. when you need durable storage.
- Scale/latency: tune `min/max instances` in the deploy step.
- Observability: add structured logs, error tracking, and tracing if needed.
- Observability: add structured logs, error tracking, and tracing if needed.
