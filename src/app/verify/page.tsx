'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmailSchema } from '@/lib/validation';

const FIELD_LABELS: Record<string, string> = {
  email: 'Email Address',
  code: '6-Digit Verification Code',
};

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [codeTimeRemaining, setCodeTimeRemaining] = useState(300); // 5 minutes = 300s

  // Countdown timer for 60s resend cooldown button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Countdown timer for 5-minute code expiration
  useEffect(() => {
    if (codeTimeRemaining <= 0) {
      setError('This verification code has expired. Please request a new code.');
      return;
    }
    const timer = setInterval(() => {
      setCodeTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [codeTimeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6); // Allow numbers only, max 6 digits
    setCode(value);
    if (error && codeTimeRemaining > 0) setError(null);
    if (fieldErrors.code) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.code;
        return next;
      });
    }
    if (success) setSuccess(null);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (fieldErrors.email) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.email;
        return next;
      });
    }
    if (error) setError(null);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!value.trim()) {
      const label = FIELD_LABELS[name] || name;
      setFieldErrors((prev) => ({ ...prev, [name]: `${label} field Cannot Be Empty` }));
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (codeTimeRemaining <= 0) {
      setError('This verification code has expired. Please request a new code.');
      return;
    }

    setError(null);
    setSuccess(null);

    const validation = verifyEmailSchema.safeParse({ email: email.trim(), code: code.trim() });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Please enter a valid 6-digit code');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.isExpired) {
          setCodeTimeRemaining(0);
        }
        setError(data.message || 'Verification failed. Please check your code.');
        setIsSubmitting(false);
        return;
      }

      if (data.alreadyVerified) {
        setSuccess('Your email is already verified. Redirecting to sign in...');
        setTimeout(() => {
          router.push('/signin');
        }, 1200);
        return;
      }

      setSuccess('Your email has been verified! Redirecting to your dashboard...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      console.error('Verification error:', err);
      setError('A network error occurred. Please check your connection.');
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isResending || resendCooldown > 0) return;

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address to receive a code.');
      return;
    }

    setIsResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (res.status === 429) {
        const retryAfter = data.retryAfterSeconds || 60;
        setResendCooldown(retryAfter);
        setError(data.message || `Please wait ${retryAfter} seconds before requesting another code.`);
        setIsResending(false);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.message || 'Failed to resend verification code.');
        setIsResending(false);
        return;
      }

      setSuccess('A new 6-digit code has been generated and sent to your email.');
      setResendCooldown(60); // 60s cooldown for resend button
      setCodeTimeRemaining(300); // 5m validity for fresh code
      setCode(''); // clear previous code input
    } catch (err) {
      console.error('Resend error:', err);
      setError('A network error occurred. Please try again.');
    } finally {
      setIsResending(false);
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
          <h1 className="auth-title">Verify your email</h1>
          <p className="auth-subtitle">
            Enter the 6-digit verification code sent to {email ? <strong>{email}</strong> : 'your email'}
          </p>
        </header>

        {error && (
          <div className="alert-box alert-error" role="alert" aria-live="polite">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert-box alert-success" role="alert" aria-live="polite">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleVerify} noValidate>
          {!initialEmail && (
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
                placeholder="jane@example.com"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleBlur}
                disabled={isSubmitting}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className="form-error-text" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="code" className="form-label" style={{ marginBottom: 0 }}>
                6-Digit Verification Code
              </label>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: codeTimeRemaining > 60 ? 'var(--color-on-surface-variant)' : '#e11d48',
                }}
              >
                {codeTimeRemaining > 0 ? `Expires in ${formatTime(codeTimeRemaining)}` : 'Expired'}
              </span>
            </div>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              className={`form-input ${error || fieldErrors.code ? 'input-error' : ''}`}
              placeholder="123456"
              style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}
              value={code}
              onChange={handleCodeChange}
              onBlur={handleBlur}
              disabled={isSubmitting || codeTimeRemaining <= 0}
              aria-invalid={!!(error || fieldErrors.code)}
              aria-describedby={error ? 'code-error' : fieldErrors.code ? 'code-error' : undefined}
            />
            {fieldErrors.code && (
              <p id="code-error" className="form-error-text" role="alert">
                {fieldErrors.code}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || code.length !== 6 || codeTimeRemaining <= 0}
            style={{ marginBottom: '0.5rem' }}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden="true"></span>
                <span>Verifying code...</span>
              </>
            ) : (
              'Verify Email'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)', marginBottom: '8px' }}>
            Didn't receive the code or did it expire?
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending}
            className="btn-link"
            style={{ fontSize: '14px' }}
          >
            {isResending
              ? 'Sending new code...'
              : resendCooldown > 0
              ? `Resend available in ${resendCooldown}s`
              : 'Resend verification code'}
          </button>
        </div>

        <footer className="auth-footer">
          <p>
            Already verified?{' '}
            <Link href="/signin">Sign In</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="auth-page-wrapper"><div className="auth-card">Loading...</div></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
