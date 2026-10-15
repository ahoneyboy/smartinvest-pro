# ---- 前端构建 ----
FROM node:20-alpine AS fe
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-fund --no-audit
COPY frontend/ .
RUN npm run build

# ---- 后端运行 ----
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /app/backend/
COPY --from=fe /fe/dist /app/frontend/dist
ENV SI_DATA_DIR=/data \
    SI_HOST=0.0.0.0 \
    SI_PORT=8000
VOLUME /data
EXPOSE 8000
WORKDIR /app/backend
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
