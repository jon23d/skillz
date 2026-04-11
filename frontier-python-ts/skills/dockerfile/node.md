# Node (Vite + pnpm, static assets)

The frontend in this harness is **Vite + React + TypeScript**, built with pnpm. The output is a directory of static assets (`dist/`) — there is no Node runtime in production. The production image is **nginx** serving the built files.

## Base image — two stages, two bases

```dockerfile
# Stage 1: builder — node + pnpm to build the static assets
FROM node:22-slim AS builder

# Stage 2: production — nginx serving the built files
FROM nginx:1.27-alpine AS production
```

Avoid Alpine for the builder stage (some native bindings still struggle on musl). Alpine is fine for the nginx stage — it's just a webserver.

Pin both base images to a specific minor version. Match the Node version in `apps/web/package.json` `engines.node` if present, or `.nvmrc` / `.tool-versions`.

## Package manager — pnpm via corepack

Enable corepack so the pnpm version comes from `packageManager` in `package.json` rather than a global install:

```dockerfile
RUN corepack enable && corepack prepare pnpm@latest --activate
```

If `package.json` declares `"packageManager": "pnpm@9.x.x"`, corepack will use exactly that version. This is the supported way to ship a specific pnpm version inside the image.

## Install with `--frozen-lockfile`

```dockerfile
# Bad — install can silently update the lockfile
RUN pnpm install

# Good — frozen-lockfile fails the build if the lockfile is out of sync
RUN pnpm install --frozen-lockfile
```

`--frozen-lockfile` is the pnpm equivalent of `npm ci`. Always use it in Docker builds.

## Lockfile — always copy it

```dockerfile
COPY package.json pnpm-lock.yaml ./
```

Never `COPY package.json ./` without `pnpm-lock.yaml` — the cache will miss on lockfile changes and the install will fail.

## Multi-stage pattern for the Vite frontend

```dockerfile
# Stage 1: builder
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Build-time API base URL — Vite inlines VITE_* values into the bundle.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Cache layer: deps only.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the static assets.
COPY . .
RUN pnpm build

# Stage 2: production — nginx serving /usr/share/nginx/html
FROM nginx:1.27-alpine AS production

# SPA fallback: route every unknown path to index.html so React Router works.
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

The `infra/nginx.conf` file is the SPA fallback. Without it, refreshing the page on `/projects/abc` returns 404 because nginx looks for a file at that path:

```nginx
# infra/nginx.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Long-lived cache for hashed asset filenames; never cache index.html.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  location = /index.html {
    add_header Cache-Control "no-store";
  }
}
```

## VITE_ env vars — inlined at build time, not at runtime

Vite replaces `import.meta.env.VITE_*` literals at build time. **Once the bundle is built, the values are baked in.** This means:

1. Per-environment images must be built per environment, or
2. The image must be built with placeholders that a startup script substitutes into the static files (e.g. `envsubst` in an entrypoint).

For most deployments, building per environment is simpler. CI passes the right `--build-arg VITE_API_BASE_URL=...` for each environment.

**Never put secrets in `VITE_*` variables.** They are visible in the final bundle by design — anything Vite inlines is shipped to the browser.

## .dockerignore for the frontend

```
.git
.env
*.env
node_modules
dist
.vite
coverage
.DS_Store
```

`node_modules` and `dist` must be in `.dockerignore` — copying local artefacts into the build context defeats the purpose of `pnpm install --frozen-lockfile` and can introduce platform-incompatible binaries.

## CMD — exec form

```dockerfile
# Bad
CMD "nginx -g 'daemon off;'"

# Good
CMD ["nginx", "-g", "daemon off;"]
```

## Checklist

- [ ] Builder uses `node:X-slim`, production uses `nginx:X-alpine`
- [ ] `corepack enable` + `corepack prepare pnpm@... --activate`
- [ ] `pnpm install --frozen-lockfile` (never `pnpm install` alone)
- [ ] Lockfile copied alongside `package.json`
- [ ] `node_modules` and `dist` in `.dockerignore`
- [ ] Multi-stage: builder produces `/app/dist`, production copies into `/usr/share/nginx/html`
- [ ] `nginx.conf` has SPA fallback (`try_files $uri $uri/ /index.html`)
- [ ] `VITE_*` build args declared with `ARG` and `ENV` in the builder stage
- [ ] No secrets in `VITE_*` variables
- [ ] `CMD` uses exec form
- [ ] `HEALTHCHECK` defined
