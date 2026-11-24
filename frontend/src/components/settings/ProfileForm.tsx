import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { usersApi } from '@/api/users.api';
import { profileSchema, ProfileInput } from '@/utils/validators';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { ApiClientError } from '@/api/errors';

export const ProfileForm: React.FC = () => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors }
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || ''
    }
  });

  React.useEffect(() => {
    if (user?.name) {
      reset({ name: user.name });
    }
  }, [user?.name, reset]);

  const watchedName = watch('name');
  const isChanged = user && watchedName.trim() !== user.name;

  const onSubmit = async (data: ProfileInput) => {
    if (!isChanged || !user) return;
    setIsLoading(true);
    setServerError(null);

    try {
      const updated = await usersApi.updateMe({ name: data.name.trim() });
      updateUser(updated);
      toast.success('Changes saved');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof ProfileInput, { message: fe.message });
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

      {/* Name */}
      <Input
        label="Full Name"
        error={errors.name?.message}
        {...register('name')}
      />

      {/* Email (Read-only) */}
      <Input
        label="Email Address"
        value={user?.email || ''}
        readOnly
        disabled
        helperText="Email address cannot be changed."
      />

      <div className="pt-2">
        <Button type="submit" variant="primary" disabled={!isChanged || isLoading} isLoading={isLoading}>
          Save changes
        </Button>
      </div>
    </form>
  );
};
