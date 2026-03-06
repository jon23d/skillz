---
name: kubernetes-manifests
description: Use when creating or reviewing Kubernetes manifests for any service — covering resource limits, health probes, secrets, rolling updates, and provider-agnostic conventions.
---

# Kubernetes Manifests

## Philosophy

Manifests describe desired state. Write them to be readable by someone who has never seen the cluster — every field should have a clear reason to exist. Keep manifests provider-agnostic: no cloud-vendor-specific annotations unless the user explicitly targets a specific cloud.

## When to use Kubernetes

Assess before generating any manifests. Recommend and confirm with the user first.

Likely appropriate when:
- 3+ independently deployable services with different scaling characteristics
- Independent deployment cycles per service are needed
- Zero-downtime deployments and per-service rollback are required

Likely premature when:
- One service, or all services scale uniformly
- `docker-compose.yml` is sufficient for the team's needs
- The team has no Kubernetes operational experience

## Repository layout

```
k8s/
  base/
    namespace.yaml
  services/
    api/
      deployment.yaml
      service.yaml
      configmap.yaml
      hpa.yaml
```

## Required fields and rules

**Every container must have resource limits.** A container without limits can starve its neighbours.

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

**Both probes are required on every Deployment:**
- `livenessProbe` — answers "is the process alive?"; failure restarts the container
- `readinessProbe` — answers "is the process ready for traffic?"; failure removes the pod from Service endpoints without restarting it
- Use `/health` for liveness, `/ready` for readiness (or a single `/health` if the deployment environment does not distinguish them)

**Image tags:** never `:latest`. Use the explicit version or git SHA.

**`runAsNonRoot: true`** — required on all pods.

**`readOnlyRootFilesystem: true`** — preferred; if the app writes to disk, mount an `emptyDir` volume for those paths.

## Deployment template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: myapp
  labels:
    app.kubernetes.io/name: api
    app.kubernetes.io/part-of: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: api
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: api
          image: myapp/api:a3f8c2d
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
              name: http
          envFrom:
            - configMapRef:
                name: api-config
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: database-url
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
      terminationGracePeriodSeconds: 30
```

## Service

Use `ClusterIP` for internal service-to-service communication. Use `LoadBalancer` only for external entry points without an ingress controller. Prefer `Ingress` for HTTP/HTTPS traffic.

## Secrets

Never commit secret values to the repository. Define the `Secret` object shape in a committed file but populate values out-of-band (CI/CD pipeline or external secrets operator). Document in a `k8s/README.md` how secrets are populated in each environment.

## Labels

Use standard Kubernetes recommended labels on all objects:
- `app.kubernetes.io/name` — component name
- `app.kubernetes.io/component` — role (backend, frontend, worker)
- `app.kubernetes.io/part-of` — parent application
- `app.kubernetes.io/managed-by` — kubectl, helm, argocd, etc.

## Rolling update strategy

Default: `RollingUpdate` with `maxUnavailable: 0`. Only use `Recreate` for stateful services where parallel versions would corrupt state and downtime is acceptable.

## Provider-agnostic conventions

Keep manifests free of cloud-specific annotations unless the user has confirmed a target platform. Prefer `nginx` as the assumed ingress class when one is needed.

## Checklist

- [ ] Kubernetes assessed as appropriate (not blindly generated)
- [ ] All resources in a named namespace, not `default`
- [ ] Every container has `resources.requests` and `resources.limits`
- [ ] Every Deployment has both `livenessProbe` and `readinessProbe`
- [ ] Image tags are pinned versions, never `:latest`
- [ ] Pods run as non-root
- [ ] No secret values committed
- [ ] Rolling update has `maxUnavailable: 0`
- [ ] No cloud-vendor-specific annotations (unless user confirmed target platform)
- [ ] Standard `app.kubernetes.io/*` labels on all objects
- [ ] `k8s/README.md` describes how to apply manifests and how secrets are populated
