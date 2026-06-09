# D2C Shopify AutoLister - Production Deployment Guide

This repository contains the widescreen console dashboard application for the **D2C Shopify AutoLister**. It comprises a Next.js frontend (React) and a Python FastAPI backend that interfaces with SQLite/PostgreSQL.

---

## Deployment Option 1: Cloud Hosting (Recommended)

To run the application live so anyone can access it, you can host the Frontend on **Vercel** (Free) and the Backend on **Render** or **Railway** (with a managed **Neon.tech** PostgreSQL database).

### 1. Database Setup (Neon.tech)
Since cloud app instances are ephemeral, we use **Neon** (a serverless PostgreSQL provider with a generous free tier) to persist your rules, column mappings, and history:
1. Go to [Neon.tech](https://neon.tech/) and create a free account.
2. Create a new project (e.g. `d2c-autolister`).
3. Under **Connection Details**, copy your connection string (looks like `postgresql://user:password@ep-host.region.aws.neon.tech/neondb?sslmode=require`).

### 2. Backend Deployment (Render or Railway)
Host the FastAPI server on a platform that supports continuous execution:
- **Render Setup**:
  1. Create an account at [Render](https://render.com/).
  2. Click **New +** and select **Web Service**.
  3. Connect your GitHub repository.
  4. Set the following details:
     - **Language**: `Python` (or select `Docker` if you wish to use the Dockerfile).
     - **Build Command**: `pip install -r backend/requirements.txt` (only needed if deploying as Python; if deploying as Docker, Render automatically uses `backend/Dockerfile`).
     - **Start Command**: `python backend/main.py`
  5. Go to the **Environment** tab and add these variables:
     - `DATABASE_URL`: `your_neon_postgresql_connection_string`
     - `PORT`: `8080` (Render will automatically inject this, but you can pin it).
  6. Deploy the service. Copy your public service URL (e.g., `https://d2c-autolister-api.onrender.com`).

### 3. Frontend Deployment (Vercel)
Host the Next.js frontend for free:
1. Go to [Vercel](https://vercel.com/) and link your GitHub account.
2. Click **Add New Project** and import the repository.
3. Select the `frontend` folder as the root directory of the project.
4. Set the **Framework Preset** to `Next.js`.
5. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL`: `https://your-render-backend-url.onrender.com` (pointing to your live backend service).
6. Click **Deploy**. Vercel will build and serve your app globally!

---

## Deployment Option 2: Self-Hosting with Docker Compose

If you have a private Virtual Private Server (VPS) like DigitalOcean, AWS EC2, or Hetzner, you can launch the entire stack using Docker:

### Prerequisites
Make sure `docker` and `docker-compose` are installed on your server.

### Steps to Run
1. Clone this repository to your server:
   ```bash
   git clone <your-repo-url> && cd D2C_AutoLister
   ```
2. Run the Docker Compose orchestration:
   ```bash
   docker-compose up -d --build
   ```
3. This will spin up two services:
   - **Frontend Console Dashboard**: Accessible at `http://your-server-ip:3000`
   - **FastAPI Backend Gateway**: Running internally on port `8080`
4. The database is persistent and stored in the `backend-db` Docker volume.

To shut down the services:
```bash
docker-compose down
```
