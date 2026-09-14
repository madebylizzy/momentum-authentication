# AGENTS.md

## Project Name
Momentum Authentication

## 1. Project Context
Momentum is a human accountability platform designed to help people achieve personal and professional goals by connecting them with compatible accountability partners.

The full Momentum product includes features such as:
- Accountability partner matching
- Goal creation
- AI-generated goal plans
- Progress tracking
- Real-time chat
- Notifications
- Safety and moderation features

However, this project is NOT the full Momentum application. This repository focuses only on the Authentication assessment, and it does not include a landing page, marketing page, or any full-application screen.

## 1a. Tech Stack
This project is built with:
- **Framework:** Next.js
- **Database:** PostgreSQL
- **ORM:** Prisma

Do not introduce a different framework, database, or ORM without explicit confirmation. Do not add unrelated libraries (state management, UI kits, etc.) unless they are already part of the existing Momentum design system setup.

## 1b. Email Delivery (Development)
**Current state (updated 2026-09-14 by explicit user request):** verification codes and password reset links are delivered by **real email over Gmail SMTP** (`smtp.gmail.com:465`, `GMAIL_USER` / `GMAIL_APP_PASSWORD`). `src/lib/email.ts` uses `nodemailer` and falls back to the server console only when `GMAIL_*` credentials are missing or empty. The email address used must have two-factor authentication enabled and an app password generated at https://myaccount.google.com/apppasswords.

History:
- **Resend's API** (original implementation, `RESEND_API_KEY`) was replaced because Resend's free sandbox tier restricts delivery to the registered account owner's email only; it cannot reach arbitrary recipients, which did not meet the requirement of testing real cross-user email delivery.
- **Nodemailer over Gmail SMTP** (port 465) was then attempted as a replacement, but was blocked on this machine by Gmail app-password/account restrictions before cross-recipient delivery could be proven. It was **reintroduced on 2026-09-14 by explicit user decision**, overriding the earlier console-only final decision.
- Console logging remains the fallback when credentials are absent, and the console still shows a delivery confirmation plus the code/token on send.

## 2. Your Role
You are an AI coding agent assisting with the development of the Momentum Authentication project.

Your responsibility is to:
- Follow the project requirements carefully
- Build only features within the defined scope
- Write clean and maintainable code
- Explain important technical decisions when necessary
- Ask for clarification when requirements are unclear
- Avoid adding unnecessary features
- Work step by step instead of changing large parts of the project without explanation

Do not assume that a feature should be added unless it is included in the project requirements.

## 3. Project Goal
Build a secure and user-friendly authentication system for Momentum.

The application should allow users to:
1. Create an account
2. Verify their email address via a code
3. Sign in
4. Request a password reset
5. Reset their password
6. Access protected pages
7. Sign out

## 4. Scope
### Account Registration
Users should be able to enter their name, email address, password, and password confirmation to create an account.

The system should validate input, prevent duplicate accounts via a database-level unique constraint on email, handle a duplicate/double submission of the signup request without creating two accounts, securely hash passwords, create the user account, and begin email verification.

### Email Verification
The system should generate a verification code, allow users to enter it to verify their email, expire the code after a set time in the database, provide a resend control with a server-enforced cooldown, update verification status, and display appropriate success or error messages.

Unverified users should not receive access to protected application areas.

### Sign In
The system should validate credentials, display useful error messages, create an authenticated session, redirect authenticated users appropriately, and rate limit the sign-in endpoint against repeated attempts.

### Forgot Password
The system should process requests securely, avoid unnecessarily revealing whether an email address exists, and rate limit the reset-request endpoint.

### Reset Password
The system should validate reset tokens and new passwords, ensure each reset token is single-use and time-limited, securely update passwords, and prevent invalid, expired, or already-used reset links from being used.

### Protected Dashboard
Create a minimal protected dashboard — a placeholder, not a feature — that:
- Is accessible only to authenticated users
- Displays a one-line welcome message with the user's name
- Includes a sign-out option
- Contains nothing else

This is not the full Momentum dashboard.

## 5. Out of Scope
Do NOT build:
- A landing page or marketing page
- Accountability partner matching
- Goal creation
- AI-generated plans
- AI features
- Real-time chat
- Messaging
- Payments
- Subscriptions
- Progress tracking
- Notifications
- Partner profiles
- Moderation
- Reporting
- Blocking
- Full user onboarding
- Full Momentum dashboard
- Premium features
- Two-factor authentication or social sign-in

Do not add features simply because they exist in the full Momentum PRD.

## 6. Product Requirements
The authentication experience should be:
- Simple
- Clear
- Secure
- Accessible
- Responsive
- Easy to understand

Users should understand:
- What information they need to provide
- Why an error occurred
- What action they should take next
- Whether an action was successful

Avoid technical language in user-facing error messages where possible.

## 7. Design Requirements
Follow the existing Momentum design system and maintain consistency with Momentum branding across:
- Typography
- Colors
- Buttons
- Form fields
- Spacing
- Components
- Error states
- Success states

The interface should work across desktop, tablet, and mobile.

Do not create a completely new visual identity.

## 8. User Experience Requirements
Every form should include:
- Clear labels programmatically bound to their inputs (e.g. `<label for>` / `aria-labelledby`, not placeholder text alone)
- Visible focus states on every interactive element
- Helpful validation messages
- Loading states
- Error states
- Success feedback
- Accessible form controls

Do not rely only on color to communicate errors or success.

Users should not lose form data unnecessarily when an error occurs.

## 9. Security Requirements
Follow secure authentication practices:
- Never store passwords in plain text
- Hash passwords using an adaptive, purpose-built algorithm — never a fast general-purpose hash like SHA-256, and never with a trivially low cost factor. Exact algorithm and cost factor are locked in §9a.
- Validate user input server-side on every endpoint, using a schema rather than validation scattered through handlers; mirror the same rules client-side for immediate feedback, but never trust the client-side check alone
- Protect authentication tokens and configure the session cookie deliberately (httpOnly, secure, appropriate sameSite and expiry). Exact expiry is locked in §9a.
- Use secure, time-limited tokens/codes where required. Exact windows are locked in §9a.
- Verification codes must expire based on a stored timestamp in the database, not only a countdown in the UI
- Password reset tokens must be single-use: once redeemed, the same token cannot be used again
- Prevent unauthorized access to protected pages — every protected route must check for a valid session server-side
- Validate password reset requests securely
- Prevent expired or invalid tokens from being used
- Avoid exposing sensitive user information in error messages
- **Rate limit the following endpoints specifically: sign-in, sign-up, password reset request, and verification code resend.** The resend endpoint is easy to forget and is a real cost risk (each resend typically sends an email) — do not omit it. Exact thresholds are locked in §9a.
- The signup endpoint must be idempotent: submitting the same signup request twice (e.g. a double click or retried request) must not create two accounts or two verification records

Never expose passwords, password hashes, authentication secrets, private tokens, environment variables, or database credentials in frontend code.

## 9a. Locked Security Parameters
These values are decided. Do not ask about them again. Do not substitute different values. If a value must change, it is a deliberate decision to be raised with the user first, then updated here.

| Parameter | Value |
|---|---|
| Password hashing algorithm | bcrypt |
| Bcrypt cost factor | 12 |
| Verification code length/format | 6-digit numeric |
| Verification code expiry | 5 minutes (300 seconds) |
| Verification resend cooldown | 60 seconds |
| Verification resend cap | 5 per hour per account |
| Password reset token expiry | 1 hour |
| Session cookie expiry | 7 days |
| Session cookie flags | httpOnly, secure, sameSite=lax |
| Rate limit — sign-in | 5 attempts per 15 minutes, keyed on email + IP |
| Rate limit — sign-up | 10 requests per hour, keyed on IP |
| Rate limit — password reset request | 5 requests per hour, keyed on email |
| Rate limit — verification resend | governed by the 60s cooldown above, plus the 5/hour cap |

When a rate limit is hit, return HTTP 429 with a `Retry-After` header indicating how many seconds until the next attempt is allowed. Do not return a generic 400 or a silent no-op.

Justify each of these choices in DOCUMENTATION.md Section 5 under the relevant concept (e.g. bcrypt cost factor under "Password Hashing," rate limit numbers under "Rate Limiting") using the "what I chose against, and why" question.

## 10. Database Requirements
Store only information required for authentication.

At minimum, support:
### User
- User ID
- Name
- Email (unique constraint enforced at the database level)
- Password hash
- Email verification status
- Created date
- Updated date

Additional models may be created for:
- Email verification (code, expiry timestamp, used/consumed state)
- Password reset (token, expiry timestamp, single-use/consumed state)
- Authentication sessions

Do not add unrelated Momentum models such as Goals, Matches, Messages, Milestones, or Reports.

## 11. Code Quality Requirements
Write code that is:
- Clear
- Readable
- Maintainable
- Well-organized
- Reusable where appropriate

Use meaningful names for variables, functions, components, files, and database fields.

Avoid:
- Duplicate code
- Extremely large components
- Unused dependencies
- Unnecessary complexity
- Hardcoded secrets
- Unexplained magic values

Do not over-engineer the project.

## 12. File Organization
Keep the project structure organized. Separate concerns where appropriate:
- Pages or routes
- Components
- Authentication logic
- Database logic
- Validation (declared once, shared or mirrored between client and server)
- Rate limiting logic
- Utility functions
- Types

Keep the folder structure simple and understandable.

## 13. Implementation Rules
Before implementing a major feature:
1. Review the requirements
2. Identify the files that need to change
3. Explain the implementation approach briefly
4. Implement the feature
5. Check for errors
6. Test the expected user flow

When making changes:
- Avoid modifying unrelated features
- Avoid deleting working code without explanation
- Preserve existing design system decisions
- Keep changes focused on the current task
- Do not build a landing page, marketing page, or any screen outside this brief, even if it seems like a natural addition

## 14. Testing Requirements
### Registration
- Valid registration
- Missing fields
- Invalid email
- Weak password
- Password mismatch
- Duplicate email
- Double/duplicate submission of the same signup request (idempotency check)

### Email Verification
- Valid verification code
- Invalid verification code
- Expired verification code (confirmed via the database, not just the UI countdown)
- Resend triggers correctly, and is blocked during the cooldown

### Sign In
- Correct email and password
- Incorrect password
- Unknown email
- Unverified account
- Repeated failed attempts trigger the rate limit with a correct status code

### Password Reset
- Valid reset request
- Invalid reset token
- Expired reset token
- Reused reset token (must fail on second use)
- Password mismatch
- Successful password reset
- Repeated reset requests trigger the rate limit

### Protected Routes
- Authenticated user can access the dashboard
- Unauthenticated user cannot access the dashboard
- Signed-out user loses access to protected pages

## 15. Definition of Done
- [ ] Users can create an account
- [ ] Form validation works correctly, server-side, with client-side mirroring for feedback
- [ ] Duplicate accounts are prevented at the database level
- [ ] A double-submitted signup request creates only one account
- [ ] Passwords are securely hashed with an adaptive algorithm
- [ ] Email verification via code works, with server-side expiry
- [ ] Verification resend has a server-enforced cooldown
- [ ] Users can sign in
- [ ] Invalid login attempts are handled correctly
- [ ] Sign-in, sign-up, password reset request, and resend are all rate limited
- [ ] Users can request a password reset
- [ ] Users can reset their password
- [ ] Password reset tokens are validated, single-use, and time-limited
- [ ] Protected routes check for a valid session server-side
- [ ] Authenticated users can access the dashboard
- [ ] Unauthenticated users are redirected appropriately
- [ ] Users can sign out
- [ ] Loading states are implemented
- [ ] Error states are implemented
- [ ] Success feedback is provided
- [ ] Form labels are programmatically bound to inputs, with visible focus states
- [ ] The application is responsive
- [ ] The application follows the Momentum design system
- [ ] No landing page, marketing page, or out-of-scope Momentum feature has been added
- [ ] Code is clean and organized
- [ ] DOCUMENTATION.md is complete per Section 18 below, with all required evidence captured

## 16. How the AI Agent Should Work
Do not attempt to build the entire project in one step. Work in small, reviewable tasks.

Recommended implementation order:

### Phase 1: Project Setup
- Review the existing project
- Review the design system
- Confirm the technology stack
- Set up the database
- Set up required environment variables (`.env`, with `.env.example` committed and real values never committed)

### Phase 2: Registration
- Create the registration UI
- Add server-side validation (schema-based) and mirrored client-side validation
- Create the user record with a database-level unique constraint on email
- Securely hash the password
- Make the signup endpoint idempotent

### Phase 3: Email Verification
- Create verification codes with a stored expiry timestamp
- Create the code-entry verification flow
- Add the resend control with a server-enforced cooldown
- Update verification status

### Phase 4: Sign In
- Create the sign-in UI
- Validate credentials
- Create authenticated sessions with a deliberately configured cookie
- Rate limit the sign-in endpoint

### Phase 5: Password Reset
- Create forgot password flow, rate limited
- Create single-use, time-limited reset tokens
- Create reset password flow

### Phase 6: Protected Routes
- Protect the dashboard with a server-side session check
- Handle unauthenticated access
- Add sign out
- Keep the dashboard to one line of welcome text and a sign-out button — nothing more

### Phase 7: Testing
- Test all authentication flows, including the idempotency, rate-limit, and single-use-token cases from Section 14
- Fix errors
- Check responsive behavior
- Check accessibility (label binding, focus states)

### Phase 8: Documentation and Evidence
- Write DOCUMENTATION.md per the structure in Section 18
- Capture the required evidence (password hash in the database, curl output for a direct signup call, a triggered rate limit, a verification code before and after expiry)

## 17. Important Constraints
This project is one assessment slice of the larger Momentum application.

> Build the authentication system only.

Do not attempt to build the complete Momentum platform.

Do not introduce features outside the authentication scope unless explicitly requested. Do not build a landing page or marketing page under any circumstances — this slice starts at sign-up.

When uncertain:
- Do not silently make major product decisions
- Clearly identify the uncertainty
- Propose a simple solution
- Ask for confirmation before implementing major changes

## 17a. Decision Log (mandatory, every checkpoint)
This is not optional and applies even when a decision seems obviously correct or clearly beneficial.

The moment you build anything that goes beyond what BRIEF.md or this document explicitly asked for — an added security behavior, an extra check, a stricter rule, a different flow branch for an edge case not named in the spec — stop before implementing it and state, in the same message:
- What you are about to add
- Why (the concrete failure it prevents, not a general "for security")
- That it was not explicitly requested

Then proceed, unless the addition is large enough to need explicit confirmation first (in which case follow the "ask for confirmation" rule above instead).

Do not wait to be asked "did you add anything extra?" at the end of a checkpoint. Volunteer it at the point you build it. Every checkpoint report must end with a short "Beyond the brief" list — even if that list is empty — naming anything built that was not directly specified in BRIEF.md, AGENTS.md, or a prior explicit instruction in this conversation. An empty list is a claim, not an assumption: state "Nothing beyond the brief was added this checkpoint" explicitly rather than omitting the section.

## 18. Documentation
Keep project documentation updated as development progresses. The final deliverable is a single file, `DOCUMENTATION.md`, at the repository root, using these eight sections in this order:

1. **What This Is** — two paragraphs: what the slice does, and what is deliberately not included and why.
2. **How To Run It** — numbered steps from a fresh clone to a working local instance: what to install, required environment variables and where each comes from, database setup/migration command, start command, and the local URL.
3. **The Flow, Step By Step** — a narrative walkthrough of each step, stating what the user does, what the frontend sends, and what the server does, naming the actual route or file for each step.
4. **The Data Model** — the schema for every table, what each holds, and which constraints make an invalid state impossible.
5. **The Concepts** — one subheading per required concept, each answering, in order: what it is, why it is needed (with a concrete failure named), how it was implemented (file/function named, short code excerpt if useful), and what was chosen against and why. Required concepts for this assessment: password hashing; rate limiting; client-side vs. server-side validation; session management (and why sessions vs. tokens); token and code expiry, and why expiry must live in the database; idempotency; database constraints as a last line of defence; protected routes.
6. **What Went Wrong** — at least three real problems hit while building, each with symptom, investigation, cause, and fix.
7. **What This Slice Does Not Handle** — an honest list of known limitations, distinguishing what was left out because it was out of scope from what was left out due to time.
8. **If I Built This Again** — one paragraph on the single biggest thing to do differently.

Required evidence to embed in the documentation:
- A screenshot of the users table showing a stored password hash (no plain password anywhere)
- The exact curl command used to hit the signup endpoint directly, and the server's response
- Evidence of the rate limit triggering, including the status code returned
- A screenshot of a verification code in the database, and the same record after expiry

Document only what was actually built. Do not document features that do not exist.