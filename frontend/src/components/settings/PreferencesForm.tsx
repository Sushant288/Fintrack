import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { usersApi } from '@/api/users.api';
import { preferencesSchema, PreferencesInput } from '@/utils/validators';
import { getCurrencies, getTimeZones } from '@/utils/intl';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { ApiClientError } from '@/api/errors';

export const PreferencesForm: React.FC = () => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const currencies = getCurrencies().map((c) => ({ value: c.code, label: c.name }));
  const timezones = getTimeZones().map((tz) => ({ value: tz.value, label: tz.label }));

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors }
  } = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      currency: user?.currency || 'USD',
      timezone: user?.timezone || 'UTC'
    }
  });

  React.useEffect(() => {
    if (user) {
      reset({ currency: user.currency, timezone: user.timezone });
    }
  }, [user, reset]);

  const watchedCurrency = watch('currency');
  const watchedTimezone = watch('timezone');

  const isCurrencyChanged = user && watchedCurrency !== user.currency;
  const isTimezoneChanged = user && watchedTimezone !== user.timezone;
  const isChanged = isCurrencyChanged || isTimezoneChanged;

  const onSubmit = async (data: PreferencesInput) => {
    if (!isChanged || !user) return;
    setIsLoading(true);
    setServerError(null);

    const patch: Partial<typeof user> = {};
    if (isCurrencyChanged) patch.currency = data.currency;
    if (isTimezoneChanged) patch.timezone = data.timezone;

    try {
      const updated = await usersApi.updateMe(patch);
      updateUser(updated);
      toast.success('Changes saved');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof PreferencesInput, { message: fe.message });
          });
          return;
        }
        setServerError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-form">
      {serverError && (
        <div role="alert" className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm">
          {serverError}
        </div>
      )}

      {/* Currency */}
      <Select
        label="Base Currency"
        options={currencies}
        error={errors.currency?.message}
        {...register('currency')}
      />

      {/* Timezone */}
      <Select
        label="Time Zone"
        options={timezones}
        error={errors.timezone?.message}
        {...register('timezone')}
      />

      <div className="pt-2">
        <Button type="submit" variant="primary" disabled={!isChanged || isLoading} isLoading={isLoading}>
          Save changes
        </Button>
      </div>
    </form>
  );
};
