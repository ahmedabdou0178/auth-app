import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema } from '@auth-app/shared';
import { useAuth } from '../auth/useAuth';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';
import { FormAlert } from '../components/FormAlert';
import { PasswordField } from '../components/PasswordField';
import { TextField } from '../components/TextField';
import { TextLink } from '../components/TextLink';
import { describeAuthError } from './server-errors';

const FIELDS = ['email', 'password'] as const;

export default function SignInPage() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // On success the session state changes and PublicOnlyRoute moves on.
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
    } catch (error) {
      const { fields, form } = describeAuthError(error, FIELDS);
      fields.forEach(({ name, message }) => {
        setError(name, { message }, { shouldFocus: true });
      });
      setFormError(form);
    }
  });

  return (
    <AuthCard
      title="Sign in"
      description="Use the email and password you signed up with."
      footer={
        <>
          New here? <TextLink to="/signup">Create an account</TextLink>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-5">
        <FormAlert message={formError} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" pending={isSubmitting} className="w-full">
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
