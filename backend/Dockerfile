FROM python:3.11-slim

# Prevents Python from writing .pyc files and buffers stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root system user for running the application.
# UID 1000 matches the default host user on most Linux systems, which avoids
# permission errors with development bind mounts on Linux hosts.
# On Windows / macOS Docker Desktop, bind-mount permissions are handled by
# the VM layer and the UID has no practical effect.
RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup --uid 1000 --no-create-home appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Transfer ownership so appuser can write migrations, collectstatic output,
# etc. when the container filesystem is used directly (production).
# In development the bind mount replaces /app at runtime; ownership of the
# mounted host files governs access there instead.
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000
