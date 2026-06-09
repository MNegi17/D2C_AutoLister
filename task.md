# Checklist - Production Hosting & Deployment

- [x] Modify `backend/database.py` for dynamic `DATABASE_URL` resolution (supporting Neon Postgres / SQLite)
- [x] Update `backend/main.py` for environment-friendly host and port binding
- [x] Create `backend/requirements.txt` with exact version pinning
- [x] Create `backend/Dockerfile` for FastAPI containerization
- [x] Create `frontend/Dockerfile` for Next.js containerization
- [x] Create root `docker-compose.yml` for self-hosting orchestration
- [x] Create root `README.md` containing detailed cloud deployment guides (using Neon.tech)
- [x] Run integration tests to verify database and engine compatibility
- [x] Verify that servers run cleanly under the updated configuration
