import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/lib/auth';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    redirect('/signin');
  }

  const sessionData = await getSessionUser(sessionToken);
  if (!sessionData || !sessionData.user.emailVerified) {
    redirect('/signin');
  }

  const { user } = sessionData;

  return (
    <div className="auth-page-wrapper">
      <div className="auth-brand">
        <div className="auth-logo">
          <span className="auth-logo-icon" aria-hidden="true">M</span>
        </div>
      </div>
      <div className="auth-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <header className="auth-header" style={{ marginBottom: '24px' }}>
          <h1 className="auth-title" style={{ marginTop: '16px' }}>
            Welcome, {user.name}!
          </h1>
          <p className="auth-subtitle">
            You are signed in as {user.email}
          </p>
        </header>

        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="btn-primary" style={{ backgroundColor: 'var(--primitive-neutral-30)' }}>
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
