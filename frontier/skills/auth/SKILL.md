---
name: auth
description: Authentication and authorization implementation guide for TypeScript SaaS. Load whenever implementing login, signup, session management, JWT tokens, protected routes, or role-based access control. Covers strategy selection, the better-auth library (preferred), JWT patterns, middleware, RBAC, and frontend auth guards. Load whenever you see auth-related code or the user mentions login, sessions, permissions, or user roles.
---

# Authentication & Authorization for TypeScript SaaS

## Strategy Decision: JWT vs Database Sessions

### JWT (Stateless)
**Pros:**
- Scales horizontally without shared session store
- Good for APIs, mobile clients, multi-service architectures
- No database lookup on every request (if edge-cached)

**Cons:**
- Cannot revoke immediately (token valid until expiry)
- Larger payload per request
- Requires careful secret management across services

### Database Sessions (Stateful)
**Pros:**
- Revoke instantly (delete session row)
- Easy to add metadata (IP, user agent, device name)
- Better for logout, device management, real-time activity tracking

**Cons:**
- Database lookup per request (mitigated with Redis cache)
- Harder to scale without session store
- Less suitable for distributed systems

### Recommendation for SaaS
**Use better-auth (or similar opinionated library).** Don't roll your own. It handles the hybrid approach: cookies + sessions for browsers, OAuth + JWT for APIs. This covers 95% of SaaS needs:
- Browser users get secure, httpOnly, SameSite cookies (sessions in DB)
- API clients get JWT access tokens
- Social login is pre-integrated
- Type-safe client library

If you must avoid a full auth library:
- Use **database sessions** for browser-based SaaS (traditional session middleware)
- Use **JWT** for public APIs or mobile apps
- Never mix them without careful token management

---

## better-auth Setup (Recommended)

### Backend Configuration

Create `lib/auth.ts`:
```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma),
  secret: process.env.BETTER_AUTH_SECRET, // min 32 chars, use env var
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",

  // Session config
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieSecure: process.env.NODE_ENV === "production",
    cookieHttpOnly: true,
    cookieSameSite: "lax",
  },

  // Email/password auth
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // set to false for dev
    minPasswordLength: 8,
  },

  // OAuth providers (see references/oauth.md for full setup)
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },

  // Custom user metadata
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      organizationId: {
        type: "string",
        defaultValue: null,
      },
    },
  },

  plugins: [
    // Add plugins here (e.g., passkey, 2FA)
  ],
});

export type Session = typeof auth.$Inferred.Session;
export type User = typeof auth.$Inferred.User;
```

### API Route Handler (Hono example)

Create `routes/auth.ts`:
```typescript
import { Hono } from "hono";
import { auth } from "@/lib/auth";

const app = new Hono();

// All auth routes
app.all("/*", async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});

export default app;
```

### Prisma Schema Update

better-auth auto-generates tables, but ensure your User model includes auth fields:
```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  emailVerified Boolean  @default(false)
  name          String?
  image         String?
  password      String? // Only if using email/password

  role          String   @default("user") // For RBAC
  organizationId String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?

  createdAt DateTime @default(now())
}
```

---

## Password Hashing

**Never store plain text passwords. Never use MD5, SHA1, or simple bcrypt without proper rounds.**

### Use Argon2 (Preferred)

```typescript
import { hash, verify } from "argon2";

export async function hashPassword(password: string): Promise<string> {
  // Argon2id: resistant to GPU and side-channel attacks
  return await hash(password, {
    type: 2, // Argon2id
    memoryCost: 19456, // ~16 MB (OWASP recommendation)
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    return false; // Hash is invalid or password doesn't match
  }
}
```

### Installation
```bash
npm install argon2
# Or use bcryptjs as fallback (slightly weaker but still acceptable)
npm install bcryptjs
```

### Signup Example
```typescript
export async function signupUser(email: string, password: string) {
  // Validate email format
  if (!email.includes("@")) throw new Error("Invalid email");

  // Check if user exists
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("User already exists");

  // Hash password (async, do not await in middleware)
  const passwordHash = await hashPassword(password);

  return await db.user.create({
    data: {
      email,
      passwordHash,
      role: "user",
    },
  });
}
```

---

## JWT Patterns (Manual Implementation)

Use this if you cannot use better-auth or need API-only authentication.

### Sign JWT with RS256

```typescript
import { SignJWT, jwtVerify } from "jose";
import { generateKeyPairSync } from "crypto";

// Generate once, store in env vars or key store
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
const TOKEN_ISSUER = "your-saas.com";

interface TokenPayload {
  sub: string; // user ID
  email: string;
  role: string;
  organizationId?: string;
  iat: number; // issued at
  exp: number; // expiration
  iss: string; // issuer
}

export async function signAccessToken(userId: string, role: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 min

  return await new SignJWT({
    sub: userId,
    role,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(PRIVATE_KEY));
}

export async function signRefreshToken(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

  return await new SignJWT({
    sub: userId,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(PRIVATE_KEY));
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(PUBLIC_KEY),
      { issuer: TOKEN_ISSUER }
    );
    return payload as TokenPayload;
  } catch (err) {
    throw new Error("Token verification failed");
  }
}
```

### Token Storage
**httpOnly Cookies (Recommended):**
```typescript
// In login endpoint, after successful auth
c.header("Set-Cookie", `accessToken=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);
```

Pros: XSS-safe, sent automatically, CSRF-protected with SameSite
Cons: CSRF requires CSRF token for state-changing operations

**localStorage (Mobile/SPA):**
```typescript
// Client-side
localStorage.setItem("accessToken", token);

// Authorization header
fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});
```

Pros: Works with any HTTP method, no CSRF token needed
Cons: Vulnerable to XSS, must include in every request header

---

## Middleware Pattern

### Hono Example
```typescript
import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  user: {
    id: string;
    email: string;
    role: string;
    organizationId?: string;
  };
}

export async function authMiddleware(
  c: Context,
  next: Next
) {
  let token: string | undefined;

  // Try cookie first (browser auth)
  token = getCookie(c, "accessToken");

  // Fallback to Authorization header (API auth)
  if (!token) {
    const auth = c.req.header("Authorization");
    if (auth?.startsWith("Bearer ")) {
      token = auth.slice(7);
    }
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token);

    // Attach to context
    c.set("user", {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    });

    c.set("userId", payload.sub);

    await next();
  } catch (err) {
    return c.json({ error: "Invalid token" }, 401);
  }
}

// Optional: require specific role
export function requireRole(role: string) {
  return async (c: Context, next: Next) => {
    await authMiddleware(c, next);

    const user = c.get("user");
    if (user.role !== role) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}
```

### Usage
```typescript
// Public route
app.get("/health", (c) => c.json({ ok: true }));

// Protected route
app.get("/profile", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json(user);
});

// Admin only
app.delete("/users/:id", requireRole("admin"), (c) => {
  return c.json({ deleted: true });
});
```

---

## Role-Based Access Control (RBAC)

### Define Roles and Permissions

```typescript
// lib/permissions.ts

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  OWNER: "owner",
  MODERATOR: "moderator",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // User management
  CREATE_USER: "create:user",
  READ_USER: "read:user",
  UPDATE_USER: "update:user",
  DELETE_USER: "delete:user",

  // Organization
  READ_ORG: "read:org",
  UPDATE_ORG: "update:org",
  DELETE_ORG: "delete:org",
  MANAGE_MEMBERS: "manage:members",

  // Content
  CREATE_POST: "create:post",
  DELETE_POST: "delete:post",
  PUBLISH_POST: "publish:post",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Role -> Permissions mapping
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.USER]: [
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.CREATE_POST,
  ],
  [ROLES.MODERATOR]: [
    ...ROLE_PERMISSIONS["user"],
    PERMISSIONS.DELETE_POST,
    PERMISSIONS.READ_ORG,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.READ_ORG,
    PERMISSIONS.UPDATE_ORG,
    PERMISSIONS.DELETE_ORG,
    PERMISSIONS.MANAGE_MEMBERS,
  ],
  [ROLES.OWNER]: Object.values(PERMISSIONS), // All permissions
};
```

### Permission Check Utility

```typescript
export function hasPermission(
  user: { role: Role },
  permission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes(permission);
}

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    await authMiddleware(c, next);

    const user = c.get("user");
    if (!hasPermission(user, permission)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}
```

### Middleware Usage

```typescript
app.post(
  "/posts",
  requirePermission(PERMISSIONS.CREATE_POST),
  async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json();

    const post = await db.post.create({
      data: {
        ...body,
        authorId: userId,
      },
    });

    return c.json(post);
  }
);

app.delete(
  "/posts/:id",
  requirePermission(PERMISSIONS.DELETE_POST),
  async (c) => {
    const postId = c.req.param("id");

    // Additional check: user can only delete their own posts (unless admin)
    const post = await db.post.findUnique({ where: { id: postId } });
    const user = c.get("user");

    if (post.authorId !== user.id && user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    await db.post.delete({ where: { id: postId } });
    return c.json({ deleted: true });
  }
);
```

---

## Protected Routes — Frontend

### React Router with Auth Context

```typescript
// context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

### Protected Route Component

```typescript
// components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

### Route Setup

```typescript
// routes.tsx
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import AdminPanel from "@/pages/AdminPanel";
import Login from "@/pages/Login";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminPanel />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

### Next.js App Router Pattern

```typescript
// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession();

  if (!session) {
    redirect("/login");
  }

  return <Dashboard user={session.user} />;
}

// Middleware for protecting all /dashboard/* routes
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/dashboard")) {
    const session = await auth.api.getSession();

    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
```

---

## Security Checklist

### Rate Limiting & Account Lockout

```typescript
// lib/security.ts
import { RateLimiter } from "some-rate-limiter"; // e.g., redis-based

const loginLimiter = new RateLimiter({
  key: (req) => req.ip,
  limit: 5, // 5 attempts
  window: 15 * 60 * 1000, // 15 minutes
});

export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  const allowed = await loginLimiter.check(ip);
  return allowed;
}

// In login endpoint
app.post("/auth/signin", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";

  if (!(await checkLoginRateLimit(ip))) {
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  // ... rest of login logic

  // Lock account after 5 failures
  const user = await db.user.findUnique({ where: { email } });
  if (user.failedLoginAttempts >= 5) {
    // Send unlock email or notify user
    return c.json({ error: "Account locked. Check your email." }, 403);
  }
});
```

### Audit Logging

```typescript
export async function logAuthEvent(
  event: "login" | "logout" | "signup" | "passwordChange" | "roleChange",
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  await db.auditLog.create({
    data: {
      event,
      userId,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    },
  });
}

// Usage in login
app.post("/auth/signin", async (c) => {
  // ... auth logic ...

  if (passwordValid) {
    await logAuthEvent("login", user.id, ip, c.req.header("user-agent"));
    // ... set session ...
  } else {
    await logAuthEvent("login_failed", user.id, ip, c.req.header("user-agent"));
  }
});
```

### Cookie Security Best Practices

```typescript
// When setting session cookie
const cookie = `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict`;

// Explanation:
// HttpOnly: Not accessible to JavaScript (prevents XSS token theft)
// Secure: Only sent over HTTPS (prevents MITM)
// SameSite=Strict: Not sent in cross-site requests (prevents CSRF)
```

### CSRF Protection for Cookie-Based Auth

```typescript
// For state-changing operations (POST, PUT, DELETE), require CSRF token

// Middleware to generate CSRF token
export function csrfToken() {
  return async (c: Context, next: Next) => {
    const token = crypto.randomUUID();
    c.header("X-CSRF-Token", token);
    c.set("csrfToken", token);
    await next();
  };
}

// Middleware to verify CSRF token
export function verifyCsrfToken() {
  return async (c: Context, next: Next) => {
    const token = c.req.header("X-CSRF-Token");
    const storedToken = c.get("csrfToken");

    if (!token || token !== storedToken) {
      return c.json({ error: "CSRF token invalid" }, 403);
    }

    await next();
  };
}

// Apply to state-changing routes
app.post("/resource", verifyCsrfToken(), async (c) => {
  // ... create resource ...
});
```

### Never Log Sensitive Data

```typescript
// BAD ❌
console.log("User signed in:", token, user.password);

// GOOD ✅
console.log("User signed in:", user.id, user.email);

// BAD ❌
throw new Error(`Token: ${token}`);

// GOOD ✅
throw new Error("Token verification failed");
```

---

## Common Patterns

### Remember Me (Extended Session)

```typescript
// During login, check "remember me" checkbox
const rememberMe = await c.req.json();

if (rememberMe) {
  // Extend session to 30 days
  sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

const session = await db.session.create({
  data: {
    userId,
    expiresAt: sessionExpiresAt,
    token,
  },
});
```

### Device Management

```typescript
// Store device info with session
const session = await db.session.create({
  data: {
    userId,
    token,
    deviceName: body.deviceName, // "Chrome on macOS"
    ipAddress: c.req.header("x-forwarded-for"),
    userAgent: c.req.header("user-agent"),
  },
});

// Let users see and revoke sessions
app.get("/sessions", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const sessions = await db.session.findMany({
    where: { userId },
    select: { id: token, deviceName, createdAt, lastActivityAt },
  });
  return c.json(sessions);
});

app.delete("/sessions/:id", authMiddleware, async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");

  await db.session.deleteMany({
    where: { id: sessionId, userId },
  });

  return c.json({ ok: true });
});
```

### Email Verification & Password Reset

```typescript
// Send verification email on signup
const verificationToken = crypto.randomUUID();
await db.emailVerification.create({
  data: {
    email: user.email,
    token: verificationToken,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});

// Send link: https://app.com/verify?token={verificationToken}

// Verify endpoint
app.get("/verify", async (c) => {
  const token = c.req.query("token");

  const verification = await db.emailVerification.findUnique({
    where: { token },
  });

  if (!verification || verification.expiresAt < new Date()) {
    return c.json({ error: "Token expired or invalid" }, 400);
  }

  await db.user.update({
    where: { email: verification.email },
    data: { emailVerified: true },
  });

  return c.json({ ok: true });
});
```

---

## Further Reading

- See `references/oauth.md` for social login setup
- See `references/rbac.md` for advanced permission patterns, org-level RBAC, and Prisma integration
