import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { registerSchema, RegisterInput } from '@/utils/validators';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ROUTES } from '@/config/routes';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';
import { getCurrencies, getTimeZones } from '@/utils/intl';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const Register: React.FC = () => {
  usePageTitle('Create account');
  const { register: registerUser } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-detect browser currency & timezone as suggestion for advanced settings
  const detectedCurrency = React.useMemo(() => {
    try {
      const parts = new Intl.NumberFormat(navigator.language, { style: 'currency', currency: 'USD' }).formatToParts(1);
      const curr = parts.find((p) => p.type === 'currency')?.value;
      return curr && curr.length === 3 ? curr : 'USD';
    } catch {
      return 'USD';
    }
  }, []);

  const detectedTimeZone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const currencies = getCurrencies().map((c) => ({ value: c.code, label: c.name }));
  const timezones = getTimeZones().map((tz) => ({ value: tz.value, label: tz.label }));

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors }
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      useDeviceSettings: false,
      currency: detectedCurrency,
      timezone: detectedTimeZone
    }
  });

  const watchedPassword = watch('password');
  const watchedUseDevice = watch('useDeviceSettings');

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    setFormError(null);

    try {
      await registerUser(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === ERROR_CODES.EMAIL_TAKEN) {
          setError('email', { message: 'An account with this email address already exists' });
          return;
        }
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof RegisterInput, { message: fe.message });
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
    <AuthShell title="Create your passbook" subtitle="Start tracking your finances with calm precision.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm font-medium"
          >
            {formError}
          </div>
        )}

        {/* Name */}
        <Input
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />

        {/* Email */}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        {/* Password */}
        <div>
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {watchedPassword && <PasswordStrength password={watchedPassword} />}
        </div>

        {/* Confirm password */}
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {/* Advanced settings disclosure */}
        <div className="border border-hairline rounded-sm p-3 bg-panel/60">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            aria-expanded={showAdvanced}
            className="w-full flex items-center justify-between text-xs font-medium text-ink select-none"
          >
            <span>Region preferences (optional)</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
          </button>

          {showAdvanced && (
            <div className="pt-3 space-y-3 border-t border-hairline mt-2">
              <label className="flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  {...register('useDeviceSettings')}
                  className="rounded-sm border-hairline text-primary focus:ring-marigold"
                />
                Use my device settings
              </label>

              {watchedUseDevice && (
                <div className="space-y-3 pt-1">
                  <Select
                    label="Currency"
                    options={currencies}
                    error={errors.currency?.message}
                    {...register('currency')}
                  />
                  <Select
                    label="Time zone"
                    options={timezones}
                    error={errors.timezone?.message}
                    {...register('timezone')}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
            Create account
          </Button>
        </div>

        {/* Login link */}
        <p className="text-xs text-muted text-center pt-2">
          Already have an account?{' '}
          <Link
            to={ROUTES.LOGIN}
            className="text-primary font-medium hover:underline focus-visible:outline-2 focus-visible:outline-marigold"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};
