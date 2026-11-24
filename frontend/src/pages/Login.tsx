import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { loginSchema, LoginInput } from '@/utils/validators';
import { AuthShell } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';
import { TIMING } from '@/config/timing';

export const Login: React.FC = () => {
  usePageTitle('Sign in');
  const { login } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  // Countdown timer for RATE_LIMITED lockout
  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setFormError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setFormError(null);

    try {
      await login(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === ERROR_CODES.INVALID_CREDENTIALS) {
          // Exactly one form-level message, never marks a specific field
          setFormError('Invalid email or password');
          return;
        }
        if (err.code === ERROR_CODES.RATE_LIMITED) {
          const waitTime = err.retryAfterSeconds ?? TIMING.DEFAULT_LOCKOUT_RETRY_AFTER_SEC;
          setLockoutSeconds(waitTime);
          setFormError(`Too many attempts. Try again in ${formatCountdown(waitTime)}`);
          return;
        }
        if (err.code === ERROR_CODES.NETWORK_ERROR) {
          setFormError("Can't reach the server. Check your connection and try again.");
          return;
        }
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof LoginInput, { message: fe.message });
          });
          return;
        }
        setFormError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your FinTrack passbook.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm font-medium"
          >
            {lockoutSeconds !== null && lockoutSeconds > 0
              ? `Too many attempts. Try again in ${formatCountdown(lockoutSeconds)}`
              : formError}
          </div>
        )}

        {/* Email */}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        {/* Password */}
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {/* Submit */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            disabled={isLoading || (lockoutSeconds !== null && lockoutSeconds > 0)}
          >
            Sign in
          </Button>
        </div>

        {/* Register link */}
        <p className="text-xs text-muted text-center pt-2">
          Don't have an account?{' '}
          <Link
            to={ROUTES.REGISTER}
            className="text-primary font-medium hover:underline focus-visible:outline-2 focus-visible:outline-marigold"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};
