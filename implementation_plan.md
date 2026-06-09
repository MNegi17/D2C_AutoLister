# Implementation Plan - Production Hosting & Deployment Setup

This plan outlines the changes needed to package the **D2C Shopify AutoLister** for cloud hosting (Vercel, Render, Railway) or self-hosted deployment (Docker Compose).

---

## User Review Required

Please review the proposed architectural and infrastructure setups:

> [!IMPORTANT]
> ### 1. Database Portability (SQLite to Postgres)
> Since standard serverless containers (like free Render or Fly.io instances) are ephemeral, using a local SQLite file (`autolister.db`) directly inside the container means database updates (custom column mappings, brand rules, spec templates, audit history) will be lost when the container restarts.
> 
> To resolve this:
> - **We will make database connectivity dynamic** by reading `DATABASE_URL` from the environment.
> - If `DATABASE_URL` is empty, the backend automatically falls back to local SQLite (retaining standard local behavior).
> - If `DATABASE_URL` is provided (e.g. Neon Postgres or Supabase), the backend will automatically initialize and use the PostgreSQL database.

---

## Proposed Changes

### 1. Database Configuration Layer

#### [MODIFY] [database.py](file:///c:/Users/Manann/Desktop/D2C_AutoLister/backend/database.py)
- Update engine initialization to load database URL dynamically:
  ```python
  DATABASE_URL = os.environ.get("DATABASE_URL")
  if not DATABASE_URL:
      DB_DIR = os.path.dirname(os.path.abspath(__file__))
      DB_PATH = os.path.join(DB_DIR, "autolister.db")
      DATABASE_URL = f"sqlite:///{DB_PATH}"

  if DATABASE_URL.startswith("sqlite"):
      engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
  else:
      # If using postgresql:// scheme, handle the postgres/postgresql alias compatibility (needed for Heroku/Render)
      if DATABASE_URL.startswith("postgres://"):
          DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
      engine = create_engine(DATABASE_URL)
  ```

### 2. Backend Server Casing and Dynamic Binding

#### [MODIFY] [main.py](file:///c:/Users/Manann/Desktop/D2C_AutoLister/backend/main.py)
- Make the default host and port environment-variable friendly so it automatically listens on Render/Railway target ports:
  ```python
  if __name__ == "__main__":
      import uvicorn
      port = int(os.environ.get("PORT", 8080))
      host = os.environ.get("HOST", "0.0.0.0")
      uvicorn.run(app, host=host, port=port)
  ```

### 3. Containerization and Dependencies Layer

#### [NEW] [requirements.txt](file:///c:/Users/Manann/Desktop/D2C_AutoLister/backend/requirements.txt)
- Define production-grade python dependencies with exact version mappings:
  ```
  fastapi==0.136.3
  uvicorn==0.46.0
  sqlalchemy==2.0.50
  pandas==3.0.2
  openpyxl==3.1.5
  python-multipart==0.0.9
  psycopg2-binary==2.9.9
  ```

#### [NEW] [Dockerfile (Backend)](file:///c:/Users/Manann/Desktop/D2C_AutoLister/backend/Dockerfile)
- Multi-stage build for optimal lightweight container size.
- Uses `python:3.11-slim` base image.
- Installs dependencies and runs the FastAPI service.

#### [NEW] [Dockerfile (Frontend)](file:///c:/Users/Manann/Desktop/D2C_AutoLister/frontend/Dockerfile)
- Node.js multi-stage build container.
- Builds Next.js production files using `npm run build`.
- Serves using Next.js standalone runner.

#### [NEW] [docker-compose.yml](file:///c:/Users/Manann/Desktop/D2C_AutoLister/docker-compose.yml)
- Root orchestrator that spins up the backend on port `8080` and the frontend on port `3000` locally/self-hosted.

### 4. Documentation

#### [NEW] [README.md](file:///c:/Users/Manann/Desktop/D2C_AutoLister/README.md)
- Write step-by-step deploy instructions:
  - **Option 1**: Cloud deployment using Vercel (Frontend) and Render/Railway (Backend) with Supabase/Neon PostgreSQL database.
  - **Option 2**: Self-hosted Docker Compose deployment.

---

## Verification Plan

### Automated Tests
- Run `python backend/test_integration.py` to confirm that SQLite and standard generator functions remain completely operational.

### Manual Verification
- Validate local Docker Compose builds to verify frontend-to-backend communication over dynamic host bindings.
