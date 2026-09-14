'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPasswordSchema } from '@/lib/validation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailBlur = () => {
    if (!email.trim()) {
      setEmailError('Email Address field Cannot Be Empty');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccessMessage(null);

    const validation = forgotPasswordSchema.safeParse({ email: email.trim() });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        setError(data.message || `Too many reset requests. Please wait ${retryAfter || 3600} seconds before retrying.`);
        setIsSubmitting(false);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.message || 'Unable to process your request. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(data.message || 'If an account exists for that email, password reset instructions have been sent.');
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-brand">
        <div className="auth-logo">
          <span className="auth-logo-icon" aria-hidden="true">M</span>
        </div>
      </div>
      <div className="auth-card">
        <header className="auth-header">
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-subtitle">
            Enter your email and we'll send you instructions to reset your password.
          </p>
        </header>

        {error && (
          <div className="alert-box alert-error" role="alert" aria-live="polite">
            <span>{error}</span>
          </div>
        )}

        {successMessage ? (
          <div>
            <div className="alert-box alert-success" role="alert" aria-live="polite">
              <span>{successMessage}</span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', textAlign: 'center', margin: '20px 0' }}>
              Please check your inbox (or dev server console) for the secure password reset link.
            </p>
            <div style={{ textAlign: 'center' }}>
              <Link href="/signin" className="btn-primary" style={{ textDecoration: 'none' }}>
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`form-input ${emailError ? 'input-error' : ''}`}
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                  if (error) setError(null);
                }}
                onBlur={handleEmailBlur}
                disabled={isSubmitting}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && (
                <p id="email-error" className="form-error-text" role="alert">
                  {emailError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" aria-hidden="true"></span>
                  <span>Sending reset instructions...</span>
                </>
              ) : (
                'Send Reset Instructions'
              )}
            </button>
          </form>
        )}

        <footer className="auth-footer">
          <p>
            Remembered your password?{' '}
            <Link href="/signin">Sign In</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
