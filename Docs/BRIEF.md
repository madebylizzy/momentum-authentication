# Momentum Authentication — Project Brief

## 1. Project Overview
Momentum is a platform that helps people achieve personal and professional goals by connecting them with accountability partners.

This assessment focuses only on the authentication system of Momentum. The goal is to allow users to securely create an account, verify their email, sign in, reset their password, and access a protected area of the application.

This assessment does not include the full Momentum application, and it does not include a landing or marketing page. The entry point to this slice is the sign-up screen itself.

## 2. What I Am Building
The authentication system should allow users to:
- Create an account
- Verify their email address using a code
- Sign in to their account
- Request a password reset
- Create a new password
- Access a protected dashboard after authentication
- Sign out of their account

## 3. User Flow
### New User
Sign Up → Create Account → Email Verification (code entry, auto-signs in) → Protected Dashboard

### Existing User
Sign In → Protected Dashboard

### Forgot Password
Sign In → Forgot Password → Enter Email Address → Receive Reset Link → Create New Password → Sign In

## 4. Features to Build
### Sign Up
Users can enter their name, email address, password, and password confirmation to create an account.

The system should:
- Validate user input
- Prevent duplicate email accounts (enforced at the database level with a unique constraint, not only in application code)
- Handle duplicate/repeated submissions safely, so submitting the form twice (e.g. a double click or a retried network request) does not create two accounts
- Securely store passwords (hashed with an adaptive algorithm — never plain text, never a fast general-purpose hash)
- Begin the email verification process

### Email Verification
Users should:
- Receive a verification code (not a link) after signing up
- Enter the code on a verification screen to verify their email address
- Be able to request the code again if it expires or is lost, via a resend control
- See confirmation when verification is successful, and a clear message when a code is wrong or expired

The system should:
- Expire verification codes after a set time, enforced in the database — not only as a countdown in the interface
- Enforce a cooldown on the resend control so it cannot be triggered repeatedly

Unverified users should not have full access to protected application areas.

### Sign In
Users should:
- Enter their email and password
- Sign in successfully

The system should:
- Validate login credentials
- Show useful, non-technical error messages
- Redirect authenticated users to the dashboard
- Limit how many sign-in attempts can be made in a given period, to protect against automated guessing

### Forgot Password
Users should:
- Click "Forgot Password"
- Enter their email address
- Request a password reset link

The system should:
- Confirm that the request has been processed without unnecessarily exposing whether an account exists
- Limit how many reset requests can be made in a given period

### Reset Password
Users should:
- Open the password reset link
- Enter and confirm a new password
- Successfully update their password

The system should:
- Validate the reset token and new password
- Ensure each reset token can only be used once, and only within its valid time window
- Securely update the password
- Prevent invalid, expired, or already-used reset links from being used again

### Protected Dashboard
The dashboard is a placeholder, not a feature. It should:
- Only be accessible to authenticated users
- Display a one-line welcome message with the user's name
- Include a sign-out option
- Contain nothing else — no widgets, no additional user information, no navigation beyond sign out

This dashboard exists only to demonstrate that authentication and route protection work correctly. It is not the full Momentum dashboard.

## 5. What I Am NOT Building
- A landing page or marketing page of any kind
- Accountability partner matching
- Goals
- AI features
- Chat
- Payments
- Progress tracking
- Notifications
- Moderation
- Full user profiles
- Two-factor authentication or social sign-in
- The complete Momentum dashboard

These features are outside the scope of this authentication assessment.

## 6. Design Direction
The authentication screens should follow the existing Momentum design system.

The design should be:
- Simple
- Clear
- Accessible — every form input has a label programmatically bound to it, and every interactive element has a visible focus state
- Mobile responsive
- Consistent across all authentication screens

The same branding and design language should be used across future Momentum assessment projects.

## 7. Success Criteria
- [ ] A user can create an account
- [ ] User input is validated
- [ ] Duplicate accounts are prevented, including from a double submission of the same request
- [ ] Passwords are securely hashed, never stored in plain text
- [ ] A user can verify their email using a code
- [ ] A verified user can sign in
- [ ] Incorrect login attempts show appropriate errors
- [ ] Sign-in, sign-up, password reset requests, and verification resends are all rate limited
- [ ] A user can request a password reset
- [ ] A user can reset their password, and the reset token cannot be reused
- [ ] Authenticated users can access the protected dashboard
- [ ] Unauthenticated users cannot access protected pages
- [ ] Users can sign out
- [ ] The application is responsive
- [ ] No landing page or out-of-scope screen has been built
