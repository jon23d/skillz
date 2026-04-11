---
name: stripe
description: Stripe payments integration guide for the FastAPI + SQLAlchemy + React stack in this harness. Load whenever implementing payments, subscriptions, billing, webhooks, or the customer portal. Covers SDK setup, products/prices, checkout sessions, webhook handling with idempotency, subscription lifecycle, and the customer portal. Backend uses the official `stripe` Python SDK; the frontend redirects to Stripe-hosted Checkout/Portal and never holds card data.
---

# Stripe Integration (FastAPI + SQLAlchemy + React)

This is the production reference for building payment systems with Stripe in this harness. Backend code is FastAPI + async SQLAlchemy 2.0 + Pydantic v2. Frontend code is Vite + React; it never holds card data — always redirects to Stripe-hosted Checkout and the Stripe Customer Portal.

## 1. SDK setup

### Backend dependency

```bash
cd apps/api && uv add stripe
```

Configure the SDK once at startup. The Python `stripe` package is configured via module-level `stripe.api_key` — there is no client object to inject. Wrap it in a tiny module so the configuration happens once and is testable:

```python
# app/core/stripe.py
import stripe

from app.core.config import get_settings


def configure_stripe() -> None:
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    stripe.api_version = "2024-12-15"
    # Surface the SDK version + your service name in Stripe-side logs.
    stripe.set_app_info("your-app", version=settings.version)


def stripe_module():
    """Tiny indirection so tests can monkeypatch the module reference."""
    return stripe
```

Call `configure_stripe()` from the FastAPI `lifespan` context manager (see the `fastapi` skill) — never from import-time code.

### Frontend

The frontend never imports `stripe-js` for Hosted Checkout or the Customer Portal. Both flows are pure redirects: the backend creates a session, returns the `url`, and the frontend does `window.location.href = url`. Only install `@stripe/stripe-js` if you adopt **Stripe Elements** (an explicit decision — Hosted Checkout is the default in this harness).

### Environment variables

Add the following to the root `.env.example` (see the `pydantic-settings` skill for how `Settings` consumes them):

```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (from the Stripe dashboard)
STRIPE_PRICE_PRO_MONTHLY=price_1ABC...
STRIPE_PRICE_PRO_YEARLY=price_2DEF...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_3GHI...

# URLs the backend builds redirect URLs from
APP_BASE_URL=http://localhost:5173
```

```python
# app/core/config.py — additions to the Settings class
class Settings(BaseSettings):
    stripe_secret_key: SecretStr
    stripe_webhook_secret: SecretStr
    stripe_price_pro_monthly: str
    stripe_price_pro_yearly: str
    stripe_price_enterprise_monthly: str
    app_base_url: AnyHttpUrl
    # ...
```

Never hardcode price IDs or customer IDs. Always go through `Settings` or look them up from the DB.

## 2. Products and prices

### Create them in the Stripe dashboard

For most SaaS, create products and prices in the dashboard, not via the API:

1. **Products** → **Add product**
2. Enter product name (e.g. "Pro Plan")
3. Set pricing — recurring with the right interval (monthly/yearly)
4. Optional: trial period
5. Optional: metadata for feature flags

### Surfacing prices to the frontend

Expose a thin endpoint that returns the price IDs the frontend should display, derived from `Settings`. The frontend does not need to know about Stripe at all — it sees a list of plans with IDs the backend understands.

```python
# app/api/v1/billing.py
from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.schemas.billing import PlanRead
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanRead])
async def list_plans():
    return billing_service.list_plans()
```

```python
# app/services/billing_service.py
from app.core.config import get_settings
from app.schemas.billing import PlanRead


def list_plans() -> list[PlanRead]:
    s = get_settings()
    return [
        PlanRead(id="pro_monthly",  name="Pro (monthly)",  price_id=s.stripe_price_pro_monthly),
        PlanRead(id="pro_yearly",   name="Pro (yearly)",   price_id=s.stripe_price_pro_yearly),
        PlanRead(id="enterprise",   name="Enterprise",     price_id=s.stripe_price_enterprise_monthly),
    ]
```

### Price metadata for feature gates

Store feature limits in price metadata (set in the dashboard or via the API). Read it server-side only:

```python
import stripe

price = stripe.Price.retrieve(price_id)
features = price.metadata or {}
max_seats = int(features.get("seats", "1"))
```

## 3. Customer management

Every tenant in this harness has a `stripe_customer_id` column. Create the Stripe customer when the tenant is provisioned, store the ID, and never look up by email again.

```python
# app/models/tenant.py
class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
```

```python
# app/services/billing_service.py
import stripe
from sqlalchemy import select

from app.models.tenant import Tenant


async def get_or_create_stripe_customer(db, tenant_id: str) -> str:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    if tenant.stripe_customer_id:
        return tenant.stripe_customer_id

    customer = stripe.Customer.create(
        name=tenant.name,
        metadata={"tenant_id": tenant.id},
    )
    tenant.stripe_customer_id = customer.id
    await db.flush()
    return customer.id
```

**Always look up by `stripe_customer_id` first.** Never search by email — `stripe.Customer.search` is rate-limited and racy. The DB is the source of truth for the link between your tenant and the Stripe customer.

The Stripe SDK is **synchronous**. In an async FastAPI handler, calls like `stripe.Customer.create(...)` block the event loop. For low-throughput billing endpoints this is acceptable; for high-throughput webhook handlers or hot paths, wrap calls in `await asyncio.to_thread(stripe.Customer.create, ...)`.

## 4. Checkout sessions

Use **Stripe Hosted Checkout** by default. It reduces PCI scope, handles 3D Secure, supports every payment method, and converts better than custom forms.

```python
# app/api/v1/billing.py (continued)
import asyncio

import stripe
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_settings
from app.core.tenant_db import TenantSession
from app.deps import get_tenant_db
from app.schemas.billing import CheckoutSessionCreate, CheckoutSessionRead
from app.services import billing_service


@router.post("/checkout", response_model=CheckoutSessionRead)
async def create_checkout_session(
    payload: CheckoutSessionCreate,
    tdb: TenantSession = Depends(get_tenant_db),
):
    settings = get_settings()
    customer_id = await billing_service.get_or_create_stripe_customer(tdb.session, tdb.tenant_id)

    try:
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": payload.price_id, "quantity": 1}],
            success_url=f"{settings.app_base_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.app_base_url}/billing",
            metadata={"tenant_id": tdb.tenant_id},
        )
    except stripe.error.InvalidRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return CheckoutSessionRead(id=session.id, url=session.url)
```

The frontend redirects:

```ts
// apps/web/src/services/billingService.ts
import { apiClient } from "@/api/client"

export async function startCheckout(priceId: string): Promise<string> {
  const { data, error } = await apiClient.POST("/api/v1/billing/checkout", {
    body: { price_id: priceId },
  })
  if (error) throw new Error(error.detail ?? "Failed to start checkout")
  return data.url
}

// In the component:
const url = await startCheckout(plan.price_id)
window.location.href = url
```

The success page is just a "thanks, your subscription is being activated" screen — **do not** treat the redirect as authoritative. The webhook is the source of truth.

## 5. Webhook handling (critical)

Webhooks are how Stripe notifies your app of payment events. This is the most important part of the integration.

### Endpoint

```python
# app/api/v1/stripe_webhooks.py
import asyncio

import stripe
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models.stripe_event import StripeWebhookEvent
from app.services import billing_service
import structlog

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
log = structlog.get_logger()


@router.post("/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
):
    settings = get_settings()

    # Read the RAW body — never parse JSON before signature verification.
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.stripe_webhook_secret.get_secret_value(),
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        log.warning("stripe.webhook.invalid_signature", error=str(exc))
        raise HTTPException(status_code=400, detail="Invalid signature")

    async with async_session_maker() as db:
        # Idempotency — UNIQUE constraint on event_id catches the race.
        already = await db.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event.id)
        )
        if already.scalar_one_or_none() is not None:
            log.info("stripe.webhook.duplicate", event_id=event.id, type=event.type)
            return {"received": True}

        try:
            await dispatch(db, event)
            db.add(StripeWebhookEvent(event_id=event.id, type=event.type))
            await db.commit()
        except Exception:
            await db.rollback()
            log.exception("stripe.webhook.processing_failed", event_id=event.id, type=event.type)
            # Return 500 so Stripe retries — but only if the failure is transient.
            raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


async def dispatch(db, event: stripe.Event) -> None:
    handler = HANDLERS.get(event.type)
    if handler is None:
        log.info("stripe.webhook.unhandled", type=event.type)
        return
    await handler(db, event)


# --- handlers ---

async def handle_checkout_completed(db, event):
    session = event.data.object
    if session.subscription:
        sub = await asyncio.to_thread(stripe.Subscription.retrieve, session.subscription)
        await billing_service.sync_subscription(db, sub)


async def handle_subscription_event(db, event):
    sub = event.data.object
    await billing_service.sync_subscription(db, sub)


async def handle_invoice_payment_succeeded(db, event):
    invoice = event.data.object
    if invoice.subscription:
        sub = await asyncio.to_thread(stripe.Subscription.retrieve, invoice.subscription)
        await billing_service.sync_subscription(db, sub)


async def handle_invoice_payment_failed(db, event):
    invoice = event.data.object
    log.warning("stripe.invoice.payment_failed", invoice_id=invoice.id)
    # Send email alert, schedule dunning, etc.


HANDLERS = {
    "checkout.session.completed":      handle_checkout_completed,
    "customer.subscription.created":   handle_subscription_event,
    "customer.subscription.updated":   handle_subscription_event,
    "customer.subscription.deleted":   handle_subscription_event,
    "invoice.payment_succeeded":       handle_invoice_payment_succeeded,
    "invoice.payment_failed":          handle_invoice_payment_failed,
}
```

### Critical: read the raw body before any JSON parsing

`stripe.Webhook.construct_event` requires the **exact** bytes Stripe sent in order to verify the HMAC signature. FastAPI's automatic JSON parsing for `Body(...)` would re-serialise the body and break verification. Use `await request.body()` and pass the bytes through unchanged.

Do not declare a Pydantic body model on this route — the only way the route accesses the body is `await request.body()`.

### Idempotency

Every webhook event has a unique `id`. Store processed event IDs in a dedicated table with a UNIQUE constraint:

```python
# app/models/stripe_event.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class StripeWebhookEvent(Base, TimestampMixin):
    __tablename__ = "stripe_webhook_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
```

The UNIQUE primary key (`event_id`) is the catch-net: if two webhook deliveries race, the second insert raises an `IntegrityError` and we abort. The check-then-insert in `dispatch` is the fast path; the constraint is the safety net.

### Webhook handler must be reachable without auth

The Stripe webhook endpoint must **not** require a JWT or any custom authentication header — Stripe authenticates via the `Stripe-Signature` HMAC. If your global auth middleware rejects unauthenticated requests, exempt the webhook path explicitly. Easier: use FastAPI's per-route dependencies and never depend on `get_current_user` from this router.

## 6. Subscription lifecycle

### Status enum

```python
# app/models/subscription.py
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, String, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SubscriptionStatus(str, enum.Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    UNPAID = "unpaid"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"
    INCOMPLETE_EXPIRED = "incomplete_expired"
    PAUSED = "paused"


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    stripe_subscription_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    stripe_customer_id: Mapped[str] = mapped_column(String(64), nullable=False)
    stripe_price_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"), nullable=False
    )
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    trial_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

### Sync helper

```python
# app/services/billing_service.py (continued)
from datetime import datetime, timezone
from sqlalchemy import select

from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant


def _ts(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, tz=timezone.utc) if value else None


async def sync_subscription(db, stripe_sub) -> None:
    # Resolve tenant_id from the customer metadata, then verify against the DB.
    tenant_id = (stripe_sub.metadata or {}).get("tenant_id")
    if not tenant_id:
        # Fall back to the customer record.
        customer_id = stripe_sub.customer if isinstance(stripe_sub.customer, str) else stripe_sub.customer.id
        tenant = (await db.execute(
            select(Tenant).where(Tenant.stripe_customer_id == customer_id)
        )).scalar_one_or_none()
        if tenant is None:
            return
        tenant_id = tenant.id

    existing = (await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub.id)
    )).scalar_one_or_none()

    if existing is None:
        existing = Subscription(
            tenant_id=tenant_id,
            stripe_subscription_id=stripe_sub.id,
            stripe_customer_id=stripe_sub.customer if isinstance(stripe_sub.customer, str) else stripe_sub.customer.id,
            stripe_price_id=stripe_sub["items"]["data"][0]["price"]["id"],
            status=SubscriptionStatus(stripe_sub.status),
            current_period_start=_ts(stripe_sub.current_period_start),
            current_period_end=_ts(stripe_sub.current_period_end),
            trial_end=_ts(stripe_sub.trial_end),
            canceled_at=_ts(stripe_sub.canceled_at),
            cancel_at_period_end=bool(stripe_sub.cancel_at_period_end),
        )
        db.add(existing)
        return

    existing.stripe_price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    existing.status = SubscriptionStatus(stripe_sub.status)
    existing.current_period_start = _ts(stripe_sub.current_period_start)
    existing.current_period_end = _ts(stripe_sub.current_period_end)
    existing.trial_end = _ts(stripe_sub.trial_end)
    existing.canceled_at = _ts(stripe_sub.canceled_at)
    existing.cancel_at_period_end = bool(stripe_sub.cancel_at_period_end)
```

### Feature gates

Gate by **status**, never by plan name alone:

```python
ACTIVE_STATUSES = {SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING}


async def is_subscription_active(db, tenant_id: str) -> bool:
    sub = (await db.execute(
        select(Subscription).where(Subscription.tenant_id == tenant_id)
    )).scalar_one_or_none()
    return sub is not None and sub.status in ACTIVE_STATUSES
```

## 7. Customer Portal

Let users manage their subscriptions in Stripe's hosted portal — payment methods, plan changes, cancellations, invoices:

```python
@router.post("/portal", response_model=PortalSessionRead)
async def create_portal_session(tdb: TenantSession = Depends(get_tenant_db)):
    settings = get_settings()
    customer_id = await billing_service.get_or_create_stripe_customer(tdb.session, tdb.tenant_id)

    portal = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=customer_id,
        return_url=f"{settings.app_base_url}/billing",
    )
    return PortalSessionRead(url=portal.url)
```

Frontend just redirects:

```ts
const { data, error } = await apiClient.POST("/api/v1/billing/portal", {})
if (error) throw new Error(error.detail ?? "Failed to open portal")
window.location.href = data.url
```

## 8. Testing

### Test mode keys

Always use test mode for development:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

### Local webhook testing

```bash
# https://stripe.com/docs/stripe-cli
stripe login

# Forward webhooks to the FastAPI dev server
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe

# The CLI prints the signing secret — set it in .env:
# STRIPE_WEBHOOK_SECRET=whsec_test_...

# Trigger events from another terminal
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_succeeded
```

### Test cards

- Visa success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

Any future expiry, any 3-digit CVC.

### Unit testing the webhook handler

Mock the SDK with `unittest.mock` (or `pytest-mock`). For HTTP-level mocking of outbound Stripe API calls inside business logic, use `respx` (see the `tdd` skill) — Stripe's REST endpoints are at `https://api.stripe.com/v1/...`.

Construct a fake event payload directly and call `dispatch` from a test — there is no need to involve `construct_event` in unit tests:

```python
async def test_subscription_created_syncs_to_db(db):
    fake_event = stripe.Event.construct_from(
        {
            "id": "evt_test_1",
            "type": "customer.subscription.created",
            "data": {"object": {"id": "sub_test_1", ...}},
        },
        key="sk_test_dummy",
    )
    await dispatch(db, fake_event)
    assert (await db.execute(select(Subscription))).scalar_one_or_none() is not None
```

## Key principles

1. **Never hardcode price or customer IDs** — use `Settings` and DB lookups.
2. **Always verify webhook signatures** — read the raw body, never parse JSON first.
3. **Process webhooks idempotently** — UNIQUE constraint on `event_id` is the safety net.
4. **Return 200 fast** — heavy work goes to an arq job (see the `arq` skill); the webhook handler should only acknowledge or fail.
5. **Gate features by subscription status** — `active` or `trialing`, never by plan name alone.
6. **Use the Customer Portal** — do not build custom billing UI unless absolutely necessary.
7. **Webhooks are the source of truth** — keep the local `Subscription` table synced from webhooks, never poll.
8. **`stripe.*` is sync; the event loop is async** — wrap calls in `asyncio.to_thread` on hot paths.
9. **Test locally** — `stripe listen` forwards real signed webhooks to the dev server.
10. **Webhook routes have no JWT auth** — Stripe authenticates via HMAC, exempt the path from any global auth dependency.
