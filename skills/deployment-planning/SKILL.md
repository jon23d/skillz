---
name: deployment-planning
description: Use when designing deployment workflows, writing CI/CD pipeline configuration, or advising on release strategy — covering build artefacts, environment promotion, rollback, and pipeline structure.
---

# Deployment Planning

## Core principle: build once, deploy anywhere

The container image (or equivalent artefact) is built exactly once, tagged with the git SHA, and promoted through environments unchanged. No rebuilds per environment. Runtime configuration is injected at deploy time, not baked in at build time.

This is the invariant chain — never break it:
1. Source is tested
2. Tested source produces one image, tagged with the git SHA
3. That image is pushed to a registry
4. The same image digest is deployed to staging, then production
5. All configuration and secrets are injected at deploy time

## Pipeline stages

Run fast stages first — fail fast, fail cheap:

1. Lint and type-check (no network I/O, must finish quickly)
2. Unit tests (before any build — no point building a broken image)
3. Build image (tagged with git SHA)
4. Integration tests (against the built image, not source)
5. Push to registry
6. Deploy to staging
7. Smoke tests against staging
8. Approval gate → deploy to production
9. Health verification
10. Done

## Image tagging

Tag with the full git SHA as the primary identifier:

```
registry.example.com/myapp/api:a3f8c2d
```

Never deploy using `:latest`. Use the SHA as the deployment reference.

## Environments

- **Development** — continuous deployment, no approval gate, used for integration testing
- **Staging** — mirrors production configuration as closely as possible; deployed automatically after CI passes on the main branch; smoke tests run before the production gate opens
- **Production** — deployed after staging smoke tests pass and a human approves (or after a configurable time window for teams that opt into automated promotion)

## Deployment strategies

- **Rolling update** (default) — new instances start before old ones stop; `maxUnavailable: 0` for zero downtime; straightforward rollback by redeploying the previous SHA
- **Blue-green** — two identical environments; traffic switches atomically; use when instant rollback is needed or two versions cannot run simultaneously; costs double infrastructure temporarily
- **Canary** — route a small percentage of traffic to the new version; only worth implementing at meaningful traffic volumes with per-version error rate monitoring
- **Recreate** — stop all instances, then start new ones; causes downtime; only for batch jobs or stateful services where parallel versions would corrupt state

Default to rolling update unless there is a specific reason to choose otherwise.

## Rollback

Rollback is a redeployment of the previous image SHA. The pipeline must record the deployed SHA at each step so rollback is always a single command. Automated rollback on health check failure is desirable — trigger after a confirmed failure during a stabilisation window (e.g. 5 minutes), not on a single failed request.

## Secrets

Secrets are never in source code, Dockerfiles, or committed manifest files. They are injected by the CI/CD system at deploy time using a secrets manager or the CI platform's encrypted secret store. A secret appearing in a pipeline YAML file in plain text is a critical security defect.

## Health verification after deploy

After every production deployment:
1. Wait for the rollout to finish
2. Poll the `/health` endpoint on new instances and confirm `200 OK`
3. Monitor error rate for a stabilisation window (minimum 2 minutes)
4. Mark the deploy successful only after the window passes without errors
5. If verification fails, trigger rollback immediately and notify the team

## Pipeline structure

- Separate concerns across files: one file for CI (test and build), one for staging deploy, one for production deploy
- Cache dependency installation between runs
- Run independent jobs in parallel
- Notify on deployment failure (failure notifications are more important than success)

## Checklist

- [ ] Image built once, tagged with git SHA
- [ ] Same image digest deployed to all environments
- [ ] No secrets in pipeline files, Dockerfiles, or committed manifests
- [ ] Deployment strategy documented and justified
- [ ] Rollback executable in under 5 minutes
- [ ] Health verification runs after every production deployment
- [ ] Production requires manual approval or a passed staging smoke test gate
- [ ] Pipeline fails fast: lint/test before build, build before deploy
- [ ] Failure notifications configured
