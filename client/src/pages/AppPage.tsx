import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';
import { FormAlert } from '../components/FormAlert';

const LOGOUT_FAILED = "Couldn't log out. Check your connection and try again.";

export default function AppPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogout = async () => {
    setError(null);
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setError(LOGOUT_FAILED);
      setLoggingOut(false);
    }
  };

  return (
    <AuthCard title="Welcome to the application.">
      <div className="space-y-6">
        {user && (
          <p className="text-[15px] text-muted">
            Signed in as <span className="font-semibold text-ink">{user.name}</span> ({user.email})
          </p>
        )}
        <FormAlert message={error} />
        <Button
          variant="secondary"
          pending={loggingOut}
          onClick={() => void onLogout()}
          className="w-full"
        >
          Log out
        </Button>
      </div>
    </AuthCard>
  );
}
