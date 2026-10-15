# ---------------------------------------------------------------------------
# Stage 1 — development  (Vite HMR dev server, used by docker-compose.yml)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Source is bind-mounted at run time (see docker-compose.yml volumes:)
# so we do not COPY . . here — the COPY below is only for the build stage.

EXPOSE 5173

CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Stage 2 — build  (produces /app/dist with hashed filenames)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — production  (nginx serves the static bundle)
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod

# Remove the default config shipped with the image.
RUN rm /etc/nginx/conf.d/default.conf

# Our SPA + API-proxy nginx config.
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy only the compiled assets — no source code, no node_modules.
COPY --from=build /app/dist /usr/share/nginx/html

# The nginx master process needs root to bind port 80.  Worker processes
# drop to the unprivileged "nginx" user automatically (see nginx.conf
# worker_processes / user directives).  If your platform enforces a
# non-root policy you can switch the listen port to 8080 and run as nginx.
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
