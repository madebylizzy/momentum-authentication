'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUpSchema, fullNameErrorMessage, nameTypingPattern } from '@/lib/validation';

const FIELD_LABELS: Record<string, string> = {
  name: 'Full Name',
  email: 'Email Address',
  password: 'Password',
  passwordConfirmation: 'Confirm Password',
};

const PASSWORD_REQUIREMENTS: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: 'lowercase', label: 'Password must contain a lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'uppercase', label: 'Password must contain an uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'number', label: 'Password must contain a number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'Password must contain a special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
  { id: 'length', label: 'Minimum of 8 characters', test: (v) => v.length >= 8 },
];

export default function SignUpPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const isFormComplete =
    formData.name.trim() !== '' &&
    formData.email.trim() !== '' &&
    formData.password.trim() !== '' &&
    formData.passwordConfirmation.trim() !== '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Live feedback: name must contain only letters (and spaces while typing)
    if (name === 'name' && value.trim() !== '' && !nameTypingPattern.test(value)) {
      setErrors((prev) => ({ ...prev, name: 'Full Name Must Use Letters' }));
      return;
    }

    // Live feedback: show email error as soon as typing starts, and stop once a
    // domain is typed after the @ symbol
    if (name === 'email' && value.trim() !== '') {
      const atIndex = value.indexOf('@');
      const hasDomainAfterAt = atIndex !== -1 && value.length > atIndex + 1;
      if (!hasDomainAfterAt) {
        setErrors((prev) => ({ ...prev, email: 'Enter A Valid Email Address' }));
        return;
      }
    }

    // Clear error on change
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
      return;
    }
    if (name === 'name') {
      const message = fullNameErrorMessage(value);
      if (message) {
        setErrors((prev) => ({ ...prev, name: message }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setGlobalError(null);
    setErrors({});

    // Client-side validation mirroring server schema
    const clientValidation = signUpSchema.safeParse(formData);
    if (!clientValidation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const err of clientValidation.error.errors) {
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          setGlobalError(
            data.message || `Too many requests. Please wait ${retryAfter || 'a few'} seconds before retrying.`
          );
        } else if (data.errors) {
          const formattedErrors: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.errors as Record<string, string[]>)) {
            formattedErrors[key] = msgs[0];
          }
          setErrors(formattedErrors);
          setGlobalError(data.message || 'Please fix the errors below.');
        } else {
          setGlobalError(data.message || 'Failed to create account. Please try again.');
        }
        setIsSubmitting(false);
        return;
      }

      // Success: redirect to verification screen
      router.push(`/verify?email=${encodeURIComponent(formData.email.trim().toLowerCase())}`);
    } catch (err) {
      console.error('Registration submit error:', err);
      setGlobalError('A network error occurred. Please check your connection and try again.');
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Get started with your accountability journey</p>
        </header>

        {globalError && (
          <div className="alert-box alert-error" role="alert" aria-live="polite">
            <span>{globalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className={`form-input ${errors.name ? 'input-error' : ''}`}
              placeholder="Jane Doe"
              value={formData.name}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p id="name-error" className="form-error-text" role="alert">
                {errors.name}
              </p>
            )}
          </div>

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
            <label htmlFor="password" className="form-label">
              Password
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
            {formData.password.length > 0 && (
              <ul className="password-requirements" aria-live="polite">
                {PASSWORD_REQUIREMENTS.filter((req) => !req.test(formData.password)).map((req) => (
                  <li key={req.id} className="password-requirement password-requirement-unmet">
                    <span className="password-requirement-icon" aria-hidden="true">
                      ○
                    </span>
                    {req.label}
                  </li>
                ))}
              </ul>
            )}
            {errors.password && (
              <p id="password-error" className="form-error-text" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirmation" className="form-label">
              Confirm Password
            </label>
            <div className="password-input-wrapper">
              <input
                id="passwordConfirmation"
                name="passwordConfirmation"
                type={showPasswordConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className={`form-input ${errors.passwordConfirmation ? 'input-error' : ''}`}
                placeholder="Re-enter your password"
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
            disabled={isSubmitting || !isFormComplete}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden="true"></span>
                <span>Creating account...</span>
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <footer className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link href="/signin">Sign In</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
