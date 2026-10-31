import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';

export default function AppPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <AuthCard title="Welcome to the application.">
      {user && (
        <p className="text-[15px] text-muted">
          Signed in as <span className="font-semibold text-ink">{user.name}</span> ({user.email})
        </p>
      )}
      <Button
        variant="secondary"
        pending={loggingOut}
        onClick={() => void onLogout()}
        className="mt-6 w-full"
      >
        Log out
      </Button>
    </AuthCard>
  );
}
