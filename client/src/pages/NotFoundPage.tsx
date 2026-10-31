import { AuthCard } from '../components/AuthCard';
import { TextLink } from '../components/TextLink';

export default function NotFoundPage() {
  return (
    <AuthCard title="Page not found" description="This address doesn't match any page.">
      <TextLink to="/">Go to the start page</TextLink>
    </AuthCard>
  );
}
