'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPasswordSchema } from '@/lib/validation';

const FIELD_LABELS: Record<string, string> = {
  password: 'New Password',
  passwordConfirmation: 'Confirm New Password',
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [formData, setFormData] = useState({
    password: '',
    passwordConfirmation: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

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

    if (!token) {
      setGlobalError('Missing password reset token. Please request a new reset link.');
      return;
    }

    const validation = resetPasswordSchema.safeParse({
      token,
      password: formData.password,
      passwordConfirmation: formData.passwordConfirmation,
    });

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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: formData.password,
          passwordConfirmation: formData.passwordConfirmation,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.message || 'Failed to reset password. The link may have expired or been used.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('Password reset successfully! Redirecting to sign in...');
      setTimeout(() => {
        router.push('/signin?reset=success');
      }, 2000);
    } catch (err) {
      console.error('Reset password error:', err);
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
          <h1 className="auth-title">Create new password</h1>
          <p className="auth-subtitle">Please choose a strong new password for your account</p>
        </header>

        {globalError && (
          <div className="alert-box alert-error" role="alert" aria-live="polite">
            <span>{globalError}</span>
          </div>
        )}

        {successMessage ? (
          <div className="alert-box alert-success" role="alert" aria-live="polite">
            <span>{successMessage}</span>
          </div>
        ) : !token ? (
          <div style={{ textAlign: 'center' }}>
            <div className="alert-box alert-error" role="alert">
              <span>No reset token provided. Please click the reset link in your email.</span>
            </div>
            <Link href="/forgot-password" className="btn-primary" style={{ textDecoration: 'none', marginTop: '16px' }}>
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                New Password
              </label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={`form-input ${errors.password ? 'input-error' : ''}`}
                  placeholder="At least 8 characters (1 uppercase, 1 number)"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  disabled={isSubmitting}
                />
                {formData.password.length > 0 && (
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {errors.password && (
                <p id="password-error" className="form-error-text" role="alert">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="passwordConfirmation" className="form-label">
                Confirm New Password
              </label>
              <div className="password-input-wrapper">
                <input
                  id="passwordConfirmation"
                  name="passwordConfirmation"
                  type={showPasswordConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={`form-input ${errors.passwordConfirmation ? 'input-error' : ''}`}
                  placeholder="Re-enter your new password"
                  value={formData.passwordConfirmation}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={!!errors.passwordConfirmation}
                  aria-describedby={errors.passwordConfirmation ? 'passwordConfirmation-error' : undefined}
                  disabled={isSubmitting}
                />
                {formData.passwordConfirmation.length > 0 && (
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPasswordConfirm((prev) => !prev)}
                    aria-label={showPasswordConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showPasswordConfirm ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {errors.passwordConfirmation && (
                <p id="passwordConfirmation-error" className="form-error-text" role="alert">
                  {errors.passwordConfirmation}
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
                  <span>Updating password...</span>
                </>
              ) : (
                'Reset Password'
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page-wrapper"><div className="auth-card">Loading...</div></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
