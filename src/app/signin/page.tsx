'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInSchema } from '@/lib/validation';

const FIELD_LABELS: Record<string, string> = {
  email: 'Email Address',
  password: 'Password',
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justVerified = searchParams.get('verified') === 'true';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (globalError) setGlobalError(null);
    if (unverifiedEmail) setUnverifiedEmail(null);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!value.trim()) {
      const label = FIELD_LABELS[name] || name;
      setErrors((prev) => ({ ...prev, [name]: `${label} field Cannot Be Empty` }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setGlobalError(null);
    setErrors({});
    setUnverifiedEmail(null);

    const validation = signInSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const err of validation.error.errors) {
        const field = err.path[0]?.toString() || 'global';
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          setGlobalError(
            data.message || `Too many failed login attempts. Please try again in ${retryAfter || 900} seconds.`
          );
        } else if (res.status === 403 && data.requiresVerification) {
          setUnverifiedEmail(data.email || formData.email);
          setGlobalError(data.message || 'Please verify your email address before signing in.');
        } else {
          setGlobalError(data.message || 'Invalid email or password.');
        }
        setIsSubmitting(false);
        return;
      }

      // Success: redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      console.error('Sign-in error:', err);
      setGlobalError('A network error occurred. Please check your connection.');
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue to your account</p>
        </header>

        {justVerified && (
          <div className="alert-box alert-success" role="alert" aria-live="polite">
            <span>Email successfully verified! Please sign in below.</span>
          </div>
        )}

        {globalError && (
          <div className="alert-box alert-error" role="alert" aria-live="polite">
            <div>
              <span>{globalError}</span>
              {unverifiedEmail && (
                <div style={{ marginTop: '8px' }}>
                  <Link
                    href={`/verify?email=${encodeURIComponent(unverifiedEmail)}`}
                    className="btn-link"
                    style={{ color: 'var(--color-on-error-container)', textDecoration: 'underline' }}
                  >
                    Enter verification code now →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

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
              className={`form-input ${errors.email ? 'input-error' : ''}`}
              placeholder="jane@example.com"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              disabled={isSubmitting}
            />
            {errors.email && (
              <p id="email-error" className="form-error-text" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label htmlFor="password" className="form-label" style={{ marginBottom: 0 }}>
                Password
              </label>
              <Link href="/forgot-password" className="btn-link" style={{ fontSize: '13px' }}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={`form-input ${errors.password ? 'input-error' : ''}`}
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              disabled={isSubmitting}
            />
            {errors.password && (
              <p id="password-error" className="form-error-text" role="alert">
                {errors.password}
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
                <span>Signing in...</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <footer className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link href="/signup">Create an account</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="auth-page-wrapper"><div className="auth-card">Loading...</div></div>}>
      <SignInContent />
    </Suspense>
  );
}
