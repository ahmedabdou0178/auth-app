import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema } from '@auth-app/shared';
import { useAuth } from '../auth/useAuth';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';
import { FormAlert } from '../components/FormAlert';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { PasswordField } from '../components/PasswordField';
import { TextField } from '../components/TextField';
import { TextLink } from '../components/TextLink';
import { describeAuthError } from './server-errors';

const FIELDS = ['email', 'name', 'password'] as const;

export default function SignUpPage() {
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
    defaultValues: { email: '', name: '', password: '' },
  });
  const password = useWatch({ control, name: 'password' });

  // On success the session state changes and PublicOnlyRoute moves on to /app.
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values);
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
      title="Create your account"
      description="It takes a minute. You'll be signed in right after."
      footer={
        <>
          Already have an account? <TextLink to="/signin">Sign in</TextLink>
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
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          error={errors.password?.message}
          description={<PasswordChecklist password={password} />}
          {...register('password')}
        />
        <Button type="submit" pending={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
