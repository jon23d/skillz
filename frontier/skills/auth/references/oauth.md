# OAuth & Social Login Reference

## OAuth Overview

OAuth 2.0 is an authorization standard that lets users log in with existing social accounts (Google, GitHub, etc.) without sharing passwords with your app.

**Flow:**
1. User clicks "Sign in with Google"
2. Redirect to Google login page
3. User authorizes your app to access their profile
4. Google redirects back with authorization code
5. Your backend exchanges code for access token
6. You get user profile info
7. Create or update user account

**Key benefits:**
- No password management (Google/GitHub handle security)
- User can manage app access from their Google/GitHub account
- Can request additional permissions (scopes)
- Can revoke access anytime from account settings

---

## better-auth Social Provider Setup

better-auth handles most OAuth complexity. Setup is minimal.

### Environment Variables

```bash
# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Your app
BETTER_AUTH_URL=http://localhost:3000 (production)
```

### Configuration

In your `lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

### Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable "Google+ API"
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Application type: Web application
6. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Secret

**Production:** Use `https://yourdomain.com/api/auth/callback/google`

### Setup GitHub OAuth

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Application name: Your SaaS name
4. Homepage URL: `https://yourdomain.com`
5. Authorization callback URL: `https://yourdomain.com/api/auth/callback/github`
6. Copy Client ID and Client Secret

---

## Frontend Implementation

### Sign In Button

```typescript
// components/SignInButton.tsx
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
      });
    } catch (err) {
      console.error("Sign in failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "github",
      });
    } catch (err) {
      console.error("Sign in failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleGoogleSignIn} disabled={isLoading}>
        Sign in with Google
      </button>
      <button onClick={handleGitHubSignIn} disabled={isLoading}>
        Sign in with GitHub
      </button>
    </div>
  );
}
```

### Client Setup

```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3000",
});
```

---

## Account Linking

Users often sign up with email/password, then later want to sign in with Google. Link their accounts to avoid duplicates.

### Approach 1: Email-Based Matching (Recommended)

If user signs in with Google (email: alice@example.com), check if account with that email exists:
- If exists → Link Google account to existing user
- If not exists → Create new account

better-auth does this automatically if you enable:

```typescript
export const auth = betterAuth({
  // ... other config
  emailVerification: {
    enabled: true,
    autoLinkOAuthAccounts: true, // Link by email address
  },
});
```

### Approach 2: Manual Account Linking

If you want explicit user confirmation before linking:

```typescript
// Backend: POST /link-social
app.post("/link-social", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const { provider, code } = await c.req.json();

  // Exchange code for OAuth token
  const oauthUser = await exchangeOAuthCode(provider, code);

  // Check if OAuth email already linked to different user
  const existing = await db.user.findUnique({
    where: { [provider]: oauthUser.id },
  });

  if (existing && existing.id !== userId) {
    return c.json({ error: "Account already linked to another user" }, 409);
  }

  // Link to current user
  await db.user.update({
    where: { id: userId },
    data: {
      [provider]: oauthUser.id,
    },
  });

  return c.json({ ok: true });
});

// Frontend: Confirm before linking
function LinkAccountDialog({ provider }: { provider: string }) {
  const handleLink = async () => {
    const result = await exchangeOAuthCode(provider);
    await fetch("/link-social", {
      method: "POST",
      body: JSON.stringify({ provider, code: result.code }),
    });
  };

  return (
    <dialog>
      <p>Link your {provider} account?</p>
      <button onClick={handleLink}>Link</button>
    </dialog>
  );
}
```

---

## Handling Account Merge Conflicts

What if a user tries to sign up with Google (alice@example.com) but that email is already in the system under a different OAuth provider?

**Option 1: Force merge** (auto-link by email)
- Safest for UX (user just signs in, no duplication)
- Risk: Someone could use a public email address they don't own
- Mitigation: Require email verification

**Option 2: Show conflict dialog**
```typescript
// User signed up with GitHub (alice@example.com)
// Now tries to sign in with Google (same email)

if (conflictingUser) {
  return c.json({
    status: "conflict",
    message: "Email already linked to GitHub account",
    suggestedAction: "Sign in with GitHub instead",
  }, 409);
}
```

**Option 3: Require password merge**
```typescript
// Create new account but ask for old password
const session = {
  status: "password_required",
  message: "Email already exists. Provide old password to merge accounts.",
};

// User submits password → verify and link
// Delete old session, create new one with OAuth
```

**Recommendation:** Use Option 1 (auto-merge with email verification). It's the best UX and secure if email is verified.

---

## OAuth Scopes

Always request only the scopes you need.

### Google Scopes

```typescript
// In OAuth config (if needed beyond defaults)
google: {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  scopes: [
    "openid",
    "email",
    "profile",
    // Optionally request Google Drive access
    // "https://www.googleapis.com/auth/drive.readonly",
  ],
}
```

**Common scopes:**
- `openid` — Get user ID
- `email` — Get email address
- `profile` — Get name, picture, etc.
- `calendar.readonly` — Read Google Calendar

### GitHub Scopes

```typescript
github: {
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  scopes: [
    "read:user", // Default
    // Optionally request repo access
    // "repo",
    // "gist",
  ],
}
```

**Common scopes:**
- `read:user` — Public profile (default)
- `user:email` — Read private emails
- `repo` — Full repo access
- `gist` — Full gist access

---

## Storing OAuth Tokens for API Access

If you need to call Google Drive API or GitHub API on behalf of the user, store the OAuth access token.

### Schema

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?

  // OAuth identities
  googleId      String?  @unique
  githubId      String?  @unique

  // OAuth tokens (for API access)
  googleToken   String?  // Access token for Google APIs
  googleRefresh String?  // Refresh token to get new access token

  createdAt     DateTime @default(now())
}
```

### Storing Tokens

```typescript
// During OAuth callback (handled by better-auth)
await db.user.update({
  where: { id: userId },
  data: {
    googleToken: oauthResponse.access_token,
    googleRefresh: oauthResponse.refresh_token,
  },
});
```

### Using Tokens

```typescript
import { google } from "googleapis";

export async function listUserGoogleDriveFiles(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user.googleToken) {
    throw new Error("User has not authorized Google Drive access");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: user.googleToken,
    refresh_token: user.googleRefresh,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const { data } = await drive.files.list({
    maxResults: 10,
  });

  return data.files;
}
```

### Refreshing Expired Tokens

Access tokens expire after ~1 hour. Use refresh token to get a new one:

```typescript
export async function refreshGoogleToken(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: user.googleRefresh,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  // Update tokens in database
  await db.user.update({
    where: { id: userId },
    data: {
      googleToken: credentials.access_token,
      // Refresh token only changes if Google issues a new one
      googleRefresh: credentials.refresh_token || user.googleRefresh,
    },
  });
}
```

---

## Security Notes

- **Never log OAuth tokens**. They're like passwords.
- **Encrypt tokens at rest** if storing long-term (e.g., in database).
- **Use HTTPS only.** OAuth requires encrypted transport.
- **Validate redirect URIs.** Only allow registered URIs to prevent token theft.
- **Revoke access** when user disconnects OAuth provider. Call Google/GitHub API to revoke token.
- **PKCE for mobile/SPA.** If using OAuth from client-side (not recommended), use PKCE flow.

---

## Troubleshooting

**Issue:** "Redirect URI mismatch"
- Ensure redirect URI in code matches what's registered in Google/GitHub console
- Production must use HTTPS
- Include `/callback` path

**Issue:** User sees "App not verified" warning
- Expected during development
- In production, request Google verification (can take weeks)
- Alternative: Add test users in Google Cloud Console

**Issue:** OAuth token not being stored
- Check that database has fields for OAuth ID and tokens
- Verify OAuth response is being parsed correctly
- Log OAuth response to debug

---

## Next Steps

For advanced permission patterns and organization-level RBAC, see `rbac.md`.
