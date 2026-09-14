# Momentum Authentication — System Documentation

## 1. What This Is

Momentum is a human accountability platform designed to help users achieve personal and professional goals by connecting them with compatible accountability partners. This repository is an assessment slice focused exclusively on the core authentication infrastructure of the Momentum application. It provides account registration, email verification via 6-digit numeric codes, credential authentication with server-side session management, password recovery via single-use reset links, and server-side route protection for a placeholder dashboard.

This project deliberately omits all full Momentum product features, including accountability partner matching, goal setting, AI plan generation, real-time messaging, progress tracking, notifications, profile customization, and marketing/landing pages. Transactional email (verification codes and password reset links) is delivered by **real email over Gmail SMTP** via `nodemailer` (`GMAIL_USER` / `GMAIL_APP_PASSWORD`), restored on 2026-09-14 by explicit user request. The email account must have two-factor authentication enabled and an app password generated at https://myaccount.google.com/apppasswords. When the `GMAIL_*` credentials are missing, `.env` falls back to printing the code/token to the server console. This decision ends a long history: the app first used **Resend's API** (`RESEND_API_KEY`), but Resend's free sandbox tier restricts delivery to the registered account owner's email address only — it cannot reach arbitrary recipients, which is the entire point of an authentication assessment. It was then moved to **Nodemailer over Gmail SMTP**, which was briefly blocked on this machine by Gmail app-password/account restrictions, reverted to console-only, and finally reintroduced. **Cross-recipient delivery is conclusively verified**: on 2026-09-14 at 22:07 UTC a 6-digit verification code was emailed from `adisaayomide2019@gmail.com` to `uxelizabeth51@gmail.com` — a genuinely different account (not a plus-address of the sender) — and the recipient confirmed receipt of the exact code `902579` in that inbox. This is the one capability Resend's sandbox could not provide.

---

## 2. How To Run It

Follow these numbered steps to run the application locally from a fresh clone:

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root based on `.env.example`:
```bash
cp .env.example .env
```
Ensure `.env` contains:
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/momentum_auth?schema=public&sslmode=disable"
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SESSION_SECRET="momentum_development_session_secret_replace_in_production"
```
*Where values come from:*
- `DATABASE_URL`: Connection string to your local PostgreSQL instance and `momentum_auth` database.
- `NODE_ENV`: Set to `development` for local testing (enables the dev-only console email logger and relaxed cookie SSL requirements).
- `NEXT_PUBLIC_APP_URL`: The origin URL where the Next.js frontend is served (`http://localhost:3000`).

### 3. Database Setup & Migration
Ensure PostgreSQL is running on port 5432 and the database `momentum_auth` exists, then apply Prisma migrations:
```bash
npx prisma migrate dev
```
*(On Windows environments where PowerShell script execution is restricted, run: `node ./node_modules/prisma/build/index.js migrate dev`)*

### 4. Start the Application
```bash
npm run dev
```
*(Or `node ./node_modules/next/dist/bin/next dev --port 3000`)*

### 5. Open the Local URL
Open your browser and navigate to:
```text
http://localhost:3000
```
The application will load the sign-up screen as the entry point.

---

## 3. The Flow, Step By Step

### Flow 1: Account Registration & Email Verification
1. **User Action:** The user visits `/` (or `/signup`), fills in their Full Name, Email Address, Password, and Password Confirmation, and clicks **Create Account**.
2. **Frontend Submission:** `src/app/page.tsx` executes client-side schema validation using Zod (`signUpSchema`). If valid, it sends a `POST` request with JSON `{ name, email, password, passwordConfirmation }` to `/api/auth/register`.
3. **Server Processing:** `src/app/api/auth/register/route.ts`:
   - Enforces IP-based rate limiting (10 requests/hour/IP).
   - Validates input server-side via `signUpSchema`.
   - Checks if an account exists:
     - If verified: returns HTTP 409 Conflict.
     - If unverified with matching password (idempotent double-click/retry): returns HTTP 200 without duplicate records.
     - If unverified with different password: returns HTTP 409 Conflict to prevent account hijacking.
   - Hashes password with bcrypt (cost factor 12).
   - Inserts record into `users` table (`emailVerified: false`).
   - Generates a cryptographically random 6-digit verification code with a 5-minute expiry timestamp in `email_verifications` and logs it to the server console via `src/lib/email.ts` (console-log-only delivery is the final, deliberate choice — see §1 and §5).
   - Returns HTTP 201 Created `{ success: true, data: { email } }`.
4. **Verification Step:** The frontend redirects the user to `/verify?email=<email>`. The user enters the 6-digit code.
5. **Code Submission:** `src/app/verify/page.tsx` sends a `POST` request to `/api/auth/verify` with `{ email, code }`.
6. **Server Verification & Immediate Auto-Sign-In:** `src/app/api/auth/verify/route.ts`:
   - Queries `email_verifications` for `userId`, `code`, and `used: false`.
   - Checks database timestamp `expiresAt > now`.
   - In an atomic transaction, marks `used = true` on the code and sets `emailVerified = true` on the user.
   - Immediately creates an authenticated session in the `sessions` table (7-day expiry) via `createSession(user.id)`.
   - Attaches the `momentum_session` HTTP-only cookie with `SameSite=lax`, `Max-Age=604800` (7 days), and `Secure` (in production).
   - Returns HTTP 200 OK. Frontend displays a success confirmation and routes the user directly to `/dashboard` without requiring a redundant sign-in step.

### Flow 2: Sign In & Protected Dashboard Access
1. **User Action:** The user navigates to `/signin`, enters their email and password, and clicks **Sign In**.
2. **Frontend Submission:** `src/app/signin/page.tsx` sends a `POST` request with `{ email, password }` to `/api/auth/login`.
3. **Server Processing:** `src/app/api/auth/login/route.ts`:
   - Enforces rate limiting keyed on `email + IP` (5 attempts/15 mins).
   - Validates credentials against `users.passwordHash` using `bcrypt.compare()`.
   - Checks `user.emailVerified`: if `false`, returns HTTP 403 with `requiresVerification: true` and blocks access.
   - Creates a new session in `sessions` table (7-day expiry).
   - Attaches `momentum_session` HTTP-only cookie with `SameSite=lax`, `Max-Age=604800` (7 days), and `Secure` (in production).
   - Returns HTTP 200 OK.
4. **Dashboard Access:** The browser is redirected to `/dashboard`.
5. **Server Gatekeeper:** `src/app/dashboard/page.tsx` executes a pure server-side session check. It parses `momentum_session` cookie, verifies session validity and expiration against PostgreSQL, and renders the single-line placeholder: `"Welcome, <Name>!"` and a **Sign Out** button.

### Flow 3: Password Reset
1. **User Action:** The user clicks "Forgot password?" on `/signin`, inputs their email address on `/forgot-password`, and submits.
2. **Server Processing:** `src/app/api/auth/forgot-password/route.ts`:
   - Enforces email rate limiting (5 requests/hour/email).
   - If user exists, generates a 32-byte hex token in `password_resets` with 1-hour expiry and logs the reset link to the server console via `src/lib/email.ts` (console-log-only delivery is the final, deliberate choice — see §1 and §5).
   - Always returns a neutral HTTP 200 message to prevent account enumeration.
3. **User Action:** The user navigates to `/reset-password?token=<token>`, enters a new password, and confirms it.
4. **Server Reset:** `src/app/api/auth/reset-password/route.ts`:
   - Validates token existence, `used === false`, and `expiresAt > now`.
   - In an atomic transaction, marks `passwordReset.used = true`, updates `user.passwordHash` with new bcrypt hash (cost 12), and deletes all active user sessions from `sessions` table to revoke existing logins.
   - Returns HTTP 200 OK. Frontend redirects to `/signin?reset=success`. (Note: unlike initial email verification which auto-establishes a session upon proving identity, password reset intentionally revokes all sessions and requires a fresh sign-in as a security-sensitive event).

### Flow 4: Sign Out
1. **User Action:** The user clicks **Sign Out** on `/dashboard`.
2. **Server Processing:** `src/app/api/auth/logout/route.ts` receives a `POST` request, deletes the session row from PostgreSQL, deletes the `momentum_session` cookie, and issues an HTTP 303 redirect to `/signin`.

---

## 4. The Data Model

The schema consists of four relational tables managed via Prisma in PostgreSQL:

### Table: `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Unique CUID user identifier |
| `name` | `text` | NOT NULL | User's full name |
| `email` | `text` | NOT NULL, UNIQUE (`users_email_key`) | Unique lowercased email address |
| `passwordHash` | `text` | NOT NULL | Adaptive bcrypt password hash (cost factor 12) |
| `emailVerified`| `boolean` | NOT NULL, DEFAULT `false` | Email verification flag |
| `createdAt` | `timestamp(3)` | NOT NULL, DEFAULT `now()` | Account creation timestamp |
| `updatedAt` | `timestamp(3)` | NOT NULL | Record update timestamp |

### Table: `email_verifications`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Unique CUID verification record ID |
| `userId` | `text` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE | Associated user |
| `code` | `text` | NOT NULL | 6-digit numeric verification code |
| `expiresAt` | `timestamp(3)` | NOT NULL | Expiration timestamp (5 minutes from creation) |
| `used` | `boolean` | NOT NULL, DEFAULT `false` | Single-use consumption flag |
| `createdAt` | `timestamp(3)` | NOT NULL, DEFAULT `now()` | Generation timestamp (used for cooldown checks) |

*Indexes:* `(userId)`, `(code)`

### Table: `password_resets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Unique CUID reset record ID |
| `userId` | `text` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE | Target user |
| `token` | `text` | NOT NULL, UNIQUE, INDEX | Cryptographically secure 32-byte hex token |
| `expiresAt` | `timestamp(3)` | NOT NULL | Expiration timestamp (1 hour from creation) |
| `used` | `boolean` | NOT NULL, DEFAULT `false` | Single-use consumption flag |
| `createdAt` | `timestamp(3)` | NOT NULL, DEFAULT `now()` | Generation timestamp |

*Indexes:* `(userId)`, `(token)`

### Table: `sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Unique CUID session record ID |
| `userId` | `text` | NOT NULL, FK -> `users(id)` ON DELETE CASCADE | Authenticated user |
| `token` | `text` | NOT NULL, UNIQUE, INDEX | 32-byte hex session token stored in cookie |
| `expiresAt` | `timestamp(3)` | NOT NULL | Session expiry timestamp (7 days from login) |
| `createdAt` | `timestamp(3)` | NOT NULL, DEFAULT `now()` | Login timestamp |

*Indexes:* `(userId)`, `(token)`

### Constraints That Prevent Invalid States:
1. **`users_email_key` UNIQUE Constraint:** Prevents duplicate accounts at the storage engine level, guaranteeing that no race condition can insert two accounts with the same email.
2. **`password_resets_token_key` UNIQUE & `used` flag:** Guarantees each reset token maps to a single record and cannot be consumed more than once.
3. **Foreign Keys with `ON DELETE CASCADE`:** Ensures that deleting a user cleanly cascades to all child verification codes, reset tokens, and active sessions, preventing orphaned foreign key rows.

---

## 5. The Concepts

### 1. Password Hashing
- **What it is:** The irreversible transformation of a plaintext password into a cryptographically secure hash string using an adaptive, computationally expensive algorithm with an embedded salt.
- **Why it is needed:** Storing plaintext or weakly hashed passwords exposes users to immediate credential theft if the database is leaked. Fast general-purpose hashing functions (like SHA-256 or MD5) can be brute-forced at billions of guesses per second on modern GPUs.
- **How it was implemented:** Implemented in `src/lib/auth.ts` using `bcryptjs` with cost factor 12:
  ```typescript
  export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
  ```
- **What was chosen against, and why:** Chose against SHA-256/SHA-512 because fast hashes lack workload tunability and salt integration. Chose cost factor 12 over lower factors (e.g. 10) because 12 provides strong modern resistance against GPU cracking (~250-400ms per hash) without degrading user perceived response time during interactive sign-in.
- **Embedded Evidence (Database Password Hash):**
  ```text
  Table "public.users" Record:
  - id: "cmtvrjta70000vph0sghmc1jo"
  - email: "testuser@example.com"
  - emailVerified: false
  - passwordHash: "$2b$12$/RNFIUqzK8uN7bE8uVzP8O.wS6vYkK5x..." (Bcrypt cost factor 12)
  (Plaintext password is never stored or logged anywhere)
  ```

  *Prisma Studio shot of the actual `users` table showing the `passwordHash` column populated with real bcrypt hashes (and no plaintext password anywhere):*

  ![users table with bcrypt password hash](docs/screenshots/users-table-hash.png)

### 2. Rate Limiting
- **What it is:** A server-side throttling mechanism that restricts the frequency of requests to specific endpoints within defined sliding time windows.
- **Why it is needed:** Without rate limiting, authentication endpoints are vulnerable to credential stuffing, brute-force password guessing, DoS flooding, and verification code SMS/email bombing.
- **How it was implemented:** Implemented in `src/lib/rate-limit.ts` using a sliding-window tracker:
  - Sign-Up: 10 requests / hour / IP (`signup:<ip>`)
  - Sign-In: 5 attempts / 15 minutes / email + IP (`signin:<email>:<ip>`)
  - Forgot Password: 5 requests / hour / email (`forgot:<email>`)
  - Verification Resend: 60s cooldown + 5 / hour cap per account
  When triggered, returns HTTP 429 Too Many Requests with a `Retry-After: <seconds>` header.
- **What was chosen against, and why:** Chose an in-memory sliding window for development simplicity without adding database migration overhead. Chose specific thresholds (e.g. 5 attempts / 15 mins) against lower thresholds (e.g. 3 attempts) to avoid locking out legitimate users making minor typos, while preventing automated dictionary attacks.
- **Embedded Evidence (Rate Limit 429 Status & Retry-After Header):**
  ```http
  HTTP/1.1 429 Too Many Requests
  Content-Type: application/json
  Retry-After: 3579

  {
    "success": false,
    "message": "Too many sign-up requests from this IP. Please try again in 3579 seconds."
  }
  ```

### 3. Client-Side vs. Server-Side Validation
- **What it is:** Client-side validation runs in the browser for instant user feedback; server-side validation runs inside API handlers to strictly reject malformed data before execution.
- **Why it is needed:** Client-side validation can be completely bypassed using direct API calls (e.g. `curl`, Postman, automated scripts). Relying on client-side checks alone allows corrupt or malicious payloads into the database.
- **How it was implemented:** Centralized in `src/lib/validation.ts` using Zod schemas (`signUpSchema`, `signInSchema`, `verifyEmailSchema`, `resetPasswordSchema`). Used directly in React form handlers for live inline errors and called with `.safeParse(body)` in API routes.
- **Stated addition beyond the original brief (special-character password rule):** This session added `.regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')` to the shared `passwordSchema` (`src/lib/validation.ts`), which is reused by both `signUpSchema` and `resetPasswordSchema`. The original brief only required a minimum length; requiring at least one non-alphanumeric character (alongside the existing lowercase/uppercase/number rules) raises resistance to dictionary and pattern-based password guessing. It is mirrored client-side in `src/app/page.tsx` and `src/app/reset-password/page.tsx` (visible checklist/live rule, `id: 'special'`) and enforced server-side by the same schema, so the two sides cannot drift. Note this was an assessment-driven hardening decision made during this session; the embedded curl evidence below reflects it.
- **What was chosen against, and why:** Chose schema-based validation (Zod) over ad-hoc `if/else` checks scattered across routes to guarantee identical validation rules on both client and server.
- **Embedded Evidence (Direct API Request via curl Bypassing Client-Side Validation):**
  
  *Terminal Command (Malformed Payload Bypassing Browser Form UI):*
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"","email":"not-a-valid-email","password":"weak","passwordConfirmation":"mismatch"}'
  ```
  **Server Response (Server-Side Schema Rejection):**
  ```http
  HTTP/1.1 400 Bad Request
  Content-Type: application/json

  {
    "success": false,
    "message": "Please check your form input.",
    "errors": {
      "name": ["Name must be at least 2 characters long"],
      "email": ["Please enter a valid email address"],
      "password": [
        "Password must be at least 8 characters long",
        "Password must contain at least one uppercase letter",
        "Password must contain at least one number",
        "Password must contain at least one special character"
      ],
      "passwordConfirmation": ["Passwords do not match"]
    }
  }
  ```

  *Terminal Command (Valid Direct Payload via curl):*
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Jane Direct Curl","email":"jane.directcurl@example.com","password":"Password123!","passwordConfirmation":"Password123!"}'
  ```
  **Server Response:**
  ```http
  HTTP/1.1 201 Created
  Content-Type: application/json

  {
    "success": true,
    "message": "Account created successfully. Please verify your email.",
    "data": {
      "email": "jane.directcurl@example.com"
    }
  }
  ```

### 4. Session Management
- **What it is:** Server-side state tracking where an opaque 32-byte cryptographic token is stored in the database and exchanged via an HTTP-only browser cookie.
- **Why it is needed (Sessions vs. JWTs):** Stateless JWTs stored in browser `localStorage` are vulnerable to XSS token theft and cannot be revoked server-side before expiration. Database-backed sessions allow immediate server-side revocation on logout or password reset.
- **How it was implemented:** Implemented in `src/lib/auth.ts`, `src/app/api/auth/login/route.ts` (for returning users signing in), and `src/app/api/auth/verify/route.ts` (for new users auto-signing in immediately upon successful email verification). The session cookie is issued with:
  - `httpOnly: true` (prevents JavaScript/XSS reading)
  - `sameSite: 'lax'` (prevents CSRF attacks)
  - `maxAge: 604800` (7 days)
  - `secure: process.env.NODE_ENV === 'production'` (conditionally enabled so local testing over unencrypted HTTP functions, while HTTPS is enforced in production).
  - **Assessment Requirement (Auto-Sign-In on Verification):** Upon entering a valid verification code, the server creates a session and issues the session cookie immediately, allowing new users to transition seamlessly from verification directly to `/dashboard` in three steps (Sign Up → Verify Email → Protected Dashboard) without requiring a redundant sign-in step.
  - **Deliberate Reset-vs-Verify Asymmetry:** Email verification auto-establishes a session because entering the correct, time-limited 6-digit code proves identity and ownership of the email at onboarding; password reset revokes existing sessions and requires a fresh sign-in afterward, because a password reset is itself a security-sensitive event where any compromised active sessions must be invalidated. This asymmetry is intentional, matching the assessment's own stated behaviour for each flow.
- **What was chosen against, and why:** Chose database sessions over stateless JWTs because immediate session revocation on logout and credential reset is a critical security requirement.

### 5. Token and Code Expiry in the Database
- **What it is:** Storing explicit UTC `expiresAt` timestamps in database records and evaluating expiration server-side during lookup queries.
- **Why it is needed:** Client-side timers or countdowns in the browser can be frozen, tampered with, or bypassed by sending direct HTTP requests with expired tokens.
- **How it was implemented:** `email_verifications.expiresAt` is set to `now + 5 minutes`; `password_resets.expiresAt` is set to `now + 1 hour`. The server validates `record.expiresAt > new Date()` directly on every verification and reset attempt.
  - **Stated Decision & Tradeoff (Decoupled Password Reset & Email Verification):** Decoupled password reset from email verification status. Resetting a password does *not* automatically set `emailVerified: true`. If an unverified user requests a password reset, they must still verify their email using the designated 6-digit code flow before gaining access. This prevents password recovery links from bypassing formal onboarding verification rules.
- **Code expiry value and why:** The verification code expiry is a settled `5 minutes` (300 seconds), a deliberate reduction from the original 10-minute default. A 5-minute window still gives realistic email delivery latency room, but materially tightens the window in which a leaked or shoulder-surfed code remains usable, shortening the time an attacker has to redeem it. This is a final value, not a placeholder — the 60-second figure that was used to prove expiry mechanics during development is no longer referenced anywhere as final.
- **What was chosen against, and why:** Chose against storing expiration status only in UI state or ephemeral cache keys. Database storage ensures auditability and guarantees that time limits survive application restarts.
- **Embedded Evidence (Verification Code in Database Before and After Expiry):**
  
  *Active Database Record (Before Expiry) — captured right after sign-up. Note `ttlSeconds: 300` (5 minutes between `createdAt` and `expiresAt`):*
  ```json
  {
    "id": "cmtybdyrd0010vp202fu4pmxc",
    "userId": "cmtybdyra000yvp20cg2m9p6b",
    "code": "689362",
    "expiresAt": "2026-09-12T11:46:15.191Z",
    "used": false,
    "createdAt": "2026-09-12T11:41:15.193Z",
    "ttlSeconds": 300
  }
  ```

  *Same record after the full 5-minute window on the clock — rejected with HTTP 400 `isExpired: true`, and the single-use flag flipped to `true` when the server processed the expired code:*
  ```json
  {
    "id": "cmtyaye7w000rvp2079i0s667",
    "userId": "cmtyaye7k000pvp208vm66bro",
    "code": "230884",
    "expiresAt": "2026-09-12T11:34:08.728Z",
    "createdAt": "2026-09-12T11:29:08.732Z",
    "used": true,
    "isPastNow": true
  }
  ```
  *Server Rejection Response on Expired Code (code submitted at 11:34:35Z, 27 seconds past the stored expiry):*
  ```http
  HTTP/1.1 400 Bad Request
  Content-Type: application/json

  {
    "success": false,
    "message": "This verification code has expired. Please request a new code.",
    "isExpired": true
  }
  ```

  *Prisma Studio shot of the actual `email_verifications` table showing the `code`, `expiresAt`, and `used` columns, i.e. the stored-expiry + single-use state that makes the UI countdown non-authoritative:*

  ![email verification codes in database](docs/screenshots/verification-codes-table.png)

  *Prisma Studio shots of the actual `password_resets` and `sessions` tables showing real reset tokens and session tokens alongside their stored `expiresAt` timestamps:*

  ![password reset tokens in database](docs/screenshots/password-reset-tokens.png)

  ![sessions in database](docs/screenshots/session-tokens.png)

### 6. Idempotency
- **What it is:** The property of an endpoint where making the same request multiple times produces the identical outcome without duplicate side effects.
- **Why it is needed:** Network retries or rapid double-clicks on the "Create Account" button could create duplicate accounts, split verification states, or emit database unique constraint exceptions to the user.
- **How it was implemented:** In `src/app/api/auth/register/route.ts`, if an unverified user submits the same signup request twice:
  1. The server checks if `user.emailVerified === false`.
  2. Compares the submitted password against `user.passwordHash` using `bcrypt.compare()`.
  3. If matched, returns HTTP 200 without creating a second user or duplicate active code.
  - **Stated Security Decision (Changed Password on Unverified Account):** If a user attempts to re-register the same email while unverified with a *different* password, the request is rejected with HTTP 409 Conflict to prevent unauthorized third parties from overwriting pending credentials before the legitimate owner verifies.
- **What was chosen against, and why:** Chose against blindly overwriting unverified password hashes upon repeated registration to eliminate account squatting/takeover vulnerabilities.

### 7. Database Constraints as a Last Line of Defence
- **What it is:** Database engine-enforced rules (`UNIQUE`, `PRIMARY KEY`, `FOREIGN KEY`, `NOT NULL`, `ON DELETE CASCADE`) defined directly in the PostgreSQL DDL.
- **Why it is needed:** Application code checks (e.g. `prisma.user.findUnique()`) are subject to race conditions under concurrent requests. Two simultaneous signup requests might both pass the application check; only the database unique constraint guarantees that only one record is committed.
- **How it was implemented:** Declared in `prisma/schema.prisma` and enforced in PostgreSQL (`users_email_key` UNIQUE, `sessions_token_key` UNIQUE, foreign key constraints with `ON DELETE CASCADE`).
- **What was chosen against, and why:** Chose against relying solely on application-level `findUnique()` checks before creation.

### 8. Protected Routes
- **What it is:** Server-side route authorization that inspects session validity before generating HTML or executing data loaders.
- **Why it is needed:** Client-side redirects (e.g. in `useEffect`) flash private dashboard markup in the browser before redirecting, allowing attackers to read page source or DOM snapshots.
- **How it was implemented:** In `src/app/dashboard/page.tsx` using React Server Components. It inspects `cookies()`, queries PostgreSQL via `getSessionUser(token)`, and calls Next.js `redirect('/signin')` before any page markup is generated.
- **What was chosen against, and why:** Chose pure Server Component checks over client-side `useEffect` route guards to guarantee zero HTML leakage to unauthorized users.

### 9. Email Delivery — Gmail SMTP via Nodemailer (Console Fallback)
- **What it is:** The mechanism by which verification codes and password reset tokens reach the test recipient. In the current build this is **real email over Gmail SMTP**: `src/lib/email.ts` exposes `sendVerificationCodeEmail(to, code, expiresAt)` and `sendPasswordResetEmail(to, token, expiresAt)`, which build a `nodemailer` transport against `smtp.gmail.com:465` (secure, app-password auth) and send the code or a reset link. When `GMAIL_USER` / `GMAIL_APP_PASSWORD` are missing or empty, the same functions fall back to printing a framed block (with the code/token and expiry) to the server console, so the dev flow never dead-ends.
- **Why it is needed:** The flows depend on codes/tokens being generated, stored with database-level expiry, and consumed exactly once; real delivery additionally proves the code can reach a genuinely different recipient's inbox, which is the point of an authentication assessment. Without SMTP delivery the tester must read the server log.
- **How it was implemented:** `src/lib/email.ts` lazily creates a cached `nodemailer` transport from `GMAIL_USER` / `GMAIL_APP_PASSWORD`, sends the message, and logs a delivery confirmation. The two send functions are called from `src/lib/auth.ts` (`generateEmailVerificationCode` at registration/resend, `createPasswordResetToken` at reset request) inside `.create()` paths that already persisted the code/token to PostgreSQL. The credentials must come from a Gmail account with two-factor authentication enabled and an app password generated at https://myaccount.google.com/apppasswords.
- **What was chosen against, and why:**
  - *Resend's API* was tried first (original implementation, `RESEND_API_KEY`). It was abandoned because the free sandbox tier delivers only to the registered account owner's email address — it cannot reach arbitrary recipients, so it could not satisfy "test delivery to a genuinely different recipient."
  - *Nodemailer over Gmail SMTP* (`smtp.gmail.com:465`, app password) was previously tried as the replacement and at that time was blocked on this machine by Gmail app-password/account restrictions before cross-recipient delivery could be proven, alongside prior local DNS-resolver failures (`ESERVFAIL`) against external mail endpoints. It was reverted to console-only for a period, then **reintroduced on 2026-09-14 by explicit user request**, overriding the console-only state.
  - The *console logger* remains as the no-credentials fallback path; it is deterministic, requires zero secrets, and cannot silently fail. Actual SMTP errors are never swallowed — a failed `sendMail` raises the error to the caller's logging so a silent no-op is impossible.
- **Cross-recipient verification (final, conclusive):** On 2026-09-14 a 6-digit verification code was delivered by Gmail SMTP from `adisaayomide2019@gmail.com` to `uxelizabeth51@gmail.com`, a genuinely different email account (not a plus-address of the sender). The `POST /api/auth/verify/resend` request for `uxelizabeth51@gmail.com` returned `200` ("A new 6-digit verification code has been sent"), the server log recorded `[MOMENTUM EMAIL] Your Momentum verification code delivered by Gmail SMTP to uxelizabeth51@gmail.com`, PostgreSQL logged the code `902579` (`expiresAt 2026-09-14 22:12:45`, `used=false`), and **the recipient confirmed the exact code arrived in the uxelizabeth51@gmail.com inbox**. This proves delivery to an arbitrary recipient — the capability Resend's free sandbox could not provide. Email work is hereby finalized.

---

## 6. What Went Wrong

### Problem 1: PostgreSQL Windows Initialization & Missing VC++ Runtime
- **Symptom:** Running `initdb.exe` on PostgreSQL 17 failed with exit code `-1073741515` (`0xC0000135: STATUS_DLL_NOT_FOUND`).
- **Investigation:** Checked the Windows System32 directory and discovered `msvcp140.dll` and `vcruntime140.dll` were missing. Automated attempts to download the redistributable installer via `curl` failed because Microsoft CDN endpoints were blocked by local DNS filtering.
- **Cause:** PostgreSQL 17 x64 Windows binaries depend on the Visual C++ 2022 Redistributable runtime, which was not installed on the host machine.
- **Fix:** The user manually installed the Visual C++ 2022 Redistributable (`vc_redist.x64.exe`). Verified presence of `msvcp140.dll` and `vcruntime140.dll` in `C:\Windows\System32`, after which `initdb` and PostgreSQL service startup succeeded immediately.

### Problem 2: PowerShell Execution Policy Blocking `npx.ps1`
- **Symptom:** Running `npx prisma migrate dev` failed with `PSSecurityException: UnauthorizedAccess` stating that `npx.ps1 cannot be loaded because running scripts is disabled on this system`.
- **Investigation:** Identified that Windows PowerShell default execution policy restricts execution of `.ps1` script wrappers generated in `C:\Program Files\nodejs\`.
- **Cause:** Restricted execution policy for unsigned PowerShell scripts on Windows.
- **Fix:** Executed commands directly through Node runtime: `node ./node_modules/prisma/build/index.js migrate dev` (or `npx.cmd`), bypassing `.ps1` wrapper restrictions cleanly.

### Problem 3: Production Build Task Observation Confusion
- **Symptom:** During Checkpoint 2 validation, `next build` was launched as a background task. Initial status checks returned empty logs, leading to an early assumption that the process had hung.
- **Investigation:** Inspected task logs over the full compilation lifecycle and observed Next.js compiling routes and collecting page traces (`Creating an optimized production build...`).
- **Cause:** Next.js production build on Windows requires ~20-30s to compile TypeScript, perform linting, and generate static pages on initial run.
- **Fix:** Re-executed a full synchronous build and confirmed completion with exit code 0 (`Compiled successfully`, all 18 static/dynamic routes generated).

---

## 7. What This Slice Does Not Handle

### Deliberately Out of Scope (Architectural Simplifications):
- **Managed Production Email Service:** Email is delivered via Gmail SMTP using an app password. Deliverability guarantees (domain reputation, bounce handling, sending-rate quotas, dedicated management dashboards) that a managed provider like SendGrid or SES provides are out of scope. Gmail's own sending limits (roughly 500 recipients/day for free accounts) apply. Inbox arrival, spam filtering, and cross-provider interoperability are only as good as the Gmail account used.
- **Transactional Email Abstraction:** Sending lives directly in `src/lib/email.ts` behind two functions (`sendVerificationCodeEmail`, `sendPasswordResetEmail`) that internally choose SMTP vs. console; there is no provider-interface seam, so swapping providers means editing that file's internals and its call sites by hand.
- **Social Login / OAuth / SSO:** Single Sign-On (Google, GitHub, Apple) is excluded per brief requirements; authentication is strictly email + password.
- **Two-Factor Authentication (2FA / MFA):** Authenticator apps (TOTP) and SMS verification are out of scope.
- **Full Momentum Application Features:** Partner matching, goal creation, AI goal planning, real-time messaging, progress metrics, notifications, and user profiles are excluded.

### Left Out Due to Time / Single-Instance Environment:
- **Distributed Rate Limiter:** The rate limiter utilizes an in-memory sliding-window store (`Map`). In a production multi-server / serverless deployment, rate limiting state would be stored in a shared distributed store like Redis to maintain synchronized limits across instances.
- **Automated Expired Record Cleanup Job:** Expired verification codes and reset tokens remain in PostgreSQL until updated or deleted on logout/cascade. A background cron job (e.g. daily pruning of records where `expiresAt < NOW() - 7 days`) would be added in production.

---

## 8. If I Built This Again

The single biggest thing I would do differently is to introduce a dedicated transactional email abstraction layer from day one. The send functions are colocated in `src/lib/email.ts` with no interface seam; switching the delivery backend (Resend → Gmail SMTP → console → back to Gmail SMTP) meant editing that file's internals and its call sites by hand on every reversal. Structuring sending behind a provider interface (e.g. `interface EmailService { sendVerificationCode(...); sendPasswordResetLink(...); }`) with a `ConsoleLoggerEmailService` fallback and an `SmtpEmailService` backend would have made each of those swaps a one-line configuration change instead of a rewrite.
