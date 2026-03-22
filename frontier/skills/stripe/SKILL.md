---
name: stripe
description: Stripe payments integration guide for TypeScript SaaS. Load whenever implementing payments, subscriptions, billing, webhooks, or the customer portal. Covers SDK setup, products/prices, checkout sessions, webhook handling with idempotency, subscription lifecycle, and the customer portal. Load whenever you see Stripe imports or the user mentions payments, billing, subscriptions, or Stripe.
---

# Stripe Integration for TypeScript SaaS

This is a comprehensive reference for building production-grade payment systems with Stripe in TypeScript SaaS applications. Covers everything from setup through subscription lifecycle management and webhook handling.

## 1. SDK Setup & Configuration

### Server-Side Installation

```bash
npm install stripe
```

Create a singleton Stripe client using the same globalThis pattern as Prisma to avoid multiple client instances:

```typescript
// lib/stripe.ts
import Stripe from "stripe";

const globalForStripe = globalThis as unknown as { stripe: Stripe };

export const stripe =
  globalForStripe.stripe ||
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-15",
    typescript: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe;
}
```

Always use the `typescript: true` flag for full type safety.

### Client-Side Installation (if using Stripe Elements)

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

```typescript
// lib/stripe-client.ts
import { loadStripe } from "@stripe/stripe-js";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export const getStripe = async () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};
```

### Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Product/Price IDs (from Stripe dashboard or API)
STRIPE_PRICE_PRO_MONTHLY=price_1ABC...
STRIPE_PRICE_PRO_YEARLY=price_2DEF...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_3GHI...

# Webhook
STRIPE_WEBHOOK_SECRET=whsec_...
```

Never hardcode price IDs or customer IDs. Always use environment variables or database lookups.

## 2. Products and Prices

### Creating Products and Prices in Stripe Dashboard

Most SaaS teams create products and prices in the Stripe dashboard for ease of management:

1. Go to **Products** → **Add product**
2. Enter product name (e.g., "Pro Plan")
3. Set pricing:
   - **One-time** for one-off charges
   - **Recurring** for subscriptions with interval (monthly, yearly, etc.)
4. Optional: Set trial period (default 0 days)
5. Optional: Add metadata for feature flags (see below)

### Price IDs & Metadata

Each price has a unique ID (`price_...`). Store these as environment variables:

```typescript
const PRICING = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
  },
};

export const getPriceId = (plan: "pro" | "enterprise", billing: "monthly" | "yearly") => {
  return PRICING[plan][billing];
};
```

### Price Metadata for Feature Gates

Store feature limits in price metadata (set in dashboard or API):

```typescript
const price = await stripe.prices.retrieve(priceId);

// Metadata might be: { seats: "10", api_calls: "1000000", ... }
const features = price.metadata;
const maxSeats = parseInt(features?.seats || "1", 10);
```

### Creating Prices via API (Less Common)

```typescript
// Only do this if prices are dynamic (rare)
const price = await stripe.prices.create({
  product: "prod_...",
  unit_amount: 99900, // $999.00 in cents
  currency: "usd",
  recurring: {
    interval: "month",
    trial_period_days: 14,
  },
  metadata: {
    seats: "10",
    features: "api,webhooks,sso",
  },
});
```

## 3. Customer Management

### Creating Stripe Customers

Create a Stripe customer when a user signs up in your app. Store the `stripeCustomerId` on the user record:

```typescript
// services/user.ts
import { stripe } from "@/lib/stripe";
import { db } from "@/db";

export async function createUserWithStripeCustomer(userData: {
  email: string;
  name: string;
}) {
  // Create Stripe customer first
  const customer = await stripe.customers.create({
    email: userData.email,
    name: userData.name,
    metadata: {
      appUserId: "will-be-set-after-user-creation",
    },
  });

  // Then create user in your database with the Stripe ID
  const user = await db.user.create({
    data: {
      email: userData.email,
      name: userData.name,
      stripeCustomerId: customer.id,
    },
  });

  // Update metadata with the app user ID
  await stripe.customers.update(customer.id, {
    metadata: { appUserId: user.id },
  });

  return user;
}
```

### Lazy Customer Creation

Alternatively, create the Stripe customer on first checkout if you prefer:

```typescript
export async function getOrCreateStripeCustomer(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create now
  const customer = await stripe.customers.create({
    email: user!.email,
    name: user!.name,
    metadata: { appUserId: userId },
  });

  await db.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
```

### Preventing Duplicate Customers

Always look up by `stripeCustomerId` first. Never create a customer without checking:

```typescript
// Avoid this ❌
const customer = await stripe.customers.create({ email: userEmail });

// Do this instead ✅
const existingCustomer = await stripe.customers.search({
  query: `email:"${userEmail}"`,
  limit: 1,
});

const customerId =
  existingCustomer.data[0]?.id || (await stripe.customers.create({ email: userEmail })).id;
```

## 4. Checkout Sessions

### Hosted Checkout (Recommended)

Stripe Hosted Checkout (Stripe-hosted payment page) is preferred for most SaaS because it:
- Reduces PCI compliance burden
- Handles 3D Secure automatically
- Works with all payment methods
- Better conversion than custom forms

```typescript
// app/api/checkout/route.ts
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceId, billingCycle } = await req.json();

  // Get or create Stripe customer
  let user = await db.user.findUnique({ where: { id: session.user.id } });

  if (!user?.stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      name: session.user.name || undefined,
      metadata: { appUserId: session.user.id },
    });
    user = await db.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  // Create checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId,
    mode: "subscription", // or "payment" for one-time
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    metadata: {
      userId: session.user.id,
      billingCycle,
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

### URL Redirect

On the frontend, redirect to the `checkoutSession.url`:

```typescript
// components/billing.tsx
async function handleCheckout(priceId: string) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ priceId }),
  });

  const { url } = await res.json();
  window.location.href = url; // Redirect to Stripe Hosted Checkout
}
```

### Checkout Success Handling

Stripe sends `checkout.session.completed` webhook. Process it there (see Webhooks section). Optionally, fetch session details on success page:

```typescript
// app/billing/success/page.tsx
async function SuccessPage({ searchParams }: { searchParams: { session_id: string } }) {
  const checkoutSession = await stripe.checkout.sessions.retrieve(
    searchParams.session_id
  );

  // Session has subscription ID and customer ID
  console.log("Subscription ID:", checkoutSession.subscription);
  console.log("Customer ID:", checkoutSession.customer);

  return <div>Success! Your subscription is active.</div>;
}
```

## 5. Webhook Handling (Critical)

Webhooks are how Stripe notifies your app of payment events. This is the most important part of the integration.

### Setup: Webhook Endpoint

Create a webhook endpoint in your API:

```typescript
// app/api/webhooks/stripe/route.ts
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";

// CRITICAL: Don't parse JSON body automatically
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Get raw body for signature verification
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    // Check idempotency: have we processed this event before?
    const existing = await db.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existing) {
      console.log("Event already processed, skipping:", event.id);
      return NextResponse.json({ received: true });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event as Stripe.CustomerSubscriptionCreatedEvent);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event as Stripe.CustomerSubscriptionUpdatedEvent);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event as Stripe.CustomerSubscriptionDeletedEvent);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event as Stripe.InvoicePaymentSucceededEvent);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event as Stripe.InvoicePaymentFailedEvent);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await db.stripeWebhookEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Return 500 to trigger Stripe retry, but log the error
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handleCheckoutSessionCompleted(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  console.log("Checkout session completed:", session.id);
  // Subscription is auto-created by Stripe, but sync it when this fires
  if (typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await syncSubscription(subscription);
  }
}

async function handleSubscriptionCreated(event: Stripe.CustomerSubscriptionCreatedEvent) {
  const subscription = event.data.object;
  await syncSubscription(subscription);
}

async function handleSubscriptionUpdated(event: Stripe.CustomerSubscriptionUpdatedEvent) {
  const subscription = event.data.object;
  await syncSubscription(subscription);
}

async function handleSubscriptionDeleted(event: Stripe.CustomerSubscriptionDeletedEvent) {
  const subscription = event.data.object;
  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: "canceled",
      canceledAt: new Date(subscription.canceled_at! * 1000),
    },
  });
}

async function handleInvoicePaymentSucceeded(event: Stripe.InvoicePaymentSucceededEvent) {
  const invoice = event.data.object;
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  await syncSubscription(subscription);
}

async function handleInvoicePaymentFailed(event: Stripe.InvoicePaymentFailedEvent) {
  const invoice = event.data.object;
  console.warn("Payment failed for invoice:", invoice.id);
  // Send email alert, disable features, etc.
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const userId = customer.metadata?.appUserId;

  if (!userId) {
    console.warn("No userId in customer metadata:", subscription.customer);
    return;
  }

  // Upsert subscription record
  const priceId = subscription.items.data[0]?.price.id;

  await db.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      userId,
      stripePriceId: priceId,
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
    update: {
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    },
  });
}
```

### Idempotency Pattern

Always store processed events in your database to prevent duplicate processing:

```prisma
// schema.prisma
model StripeWebhookEvent {
  id          String   @id @default(cuid())
  eventId     String   @unique // Stripe event ID
  type        String   // "checkout.session.completed", etc.
  processedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  @@index([eventId])
  @@index([type])
}
```

## 6. Subscription Lifecycle

### Status Mapping

Map Stripe subscription statuses to your database:

```typescript
type SubscriptionStatus =
  | "active"     // Active and paying
  | "trialing"   // In free trial
  | "past_due"   // Payment failed, grace period
  | "unpaid"     // Payment failed, past grace period
  | "canceled"   // Canceled by user or dunning
  | "paused";    // (Rare) Paused subscription

// Store as enum in database
model Subscription {
  id                      String   @id @default(cuid())
  userId                  String
  stripeSubscriptionId    String   @unique
  stripeCustomerId        String
  stripePriceId           String
  status                  SubscriptionStatus
  currentPeriodStart      DateTime
  currentPeriodEnd        DateTime
  trialEnd                DateTime?
  canceledAt              DateTime?
  cancelAtPeriodEnd       Boolean  @default(false)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

### Checking Subscription Status

```typescript
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: { userId },
  });

  if (!subscription) return false;

  return subscription.status === "active" || subscription.status === "trialing";
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  const subscription = await db.subscription.findFirst({
    where: { userId },
  });

  return subscription?.status || null;
}
```

### Gating Features

```typescript
export async function canUserAccessFeature(userId: string, feature: string): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: { userId },
  });

  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return false;
  }

  // Check price metadata for feature enablement
  const price = await stripe.prices.retrieve(subscription.stripePriceId);
  const allowedFeatures = (price.metadata?.features || "").split(",");

  return allowedFeatures.includes(feature);
}
```

## 7. Customer Portal

Let users manage their subscriptions (update payment, cancel, upgrade/downgrade):

```typescript
// app/api/billing/portal/route.ts
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

On the frontend:

```typescript
async function goToPortal() {
  const res = await fetch("/api/billing/portal", { method: "POST" });
  const { url } = await res.json();
  window.location.href = url;
}
```

## 8. Testing

### Test Mode Keys

Always use test mode for development:

```bash
STRIPE_SECRET_KEY=sk_test_... (test)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Local Webhook Testing

Install the Stripe CLI and forward webhooks to localhost:

```bash
# Install: https://stripe.com/docs/stripe-cli

# Authenticate
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the signing secret and set it:
# STRIPE_WEBHOOK_SECRET=whsec_test_...

# In another terminal, trigger events
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.completed
```

### Test Card Numbers

- Visa success: `4242 4242 4242 4242`
- Visa declined: `4000 0000 0000 0002`
- Requires authentication: `4000 2500 0000 3155`

Use any future expiry date and any 3-digit CVC.

### Testing Subscription Lifecycle

```bash
# Create a test customer and subscription, then simulate events
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.deleted
```

## Key Principles

1. **Never hardcode price or customer IDs** — Use environment variables and database lookups.
2. **Always verify webhook signatures** — Stripe sends a signature header for security.
3. **Process webhooks idempotently** — Store event IDs to prevent duplicate processing.
4. **Return 200 immediately** — Process heavy logic async (queue with BullMQ, etc.).
5. **Gate features by subscription status** — Check `active` or `trialing` status, not just plan name.
6. **Use the customer portal** — Don't build custom billing UI unless absolutely necessary.
7. **Keep Stripe data synced** — Use webhooks to sync subscriptions, not polling.
8. **Test locally** — Use `stripe listen` for local webhook development.
