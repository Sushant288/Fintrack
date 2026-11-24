import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { usersApi } from '@/api/users.api';
import { changePasswordSchema, ChangePasswordInput } from '@/utils/validators';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';

export const ChangePasswordForm: React.FC = () => {
  const { applySession } = useAuth();
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
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });

  const watchedNewPassword = watch('newPassword');

  const onSubmit = async (data: ChangePasswordInput) => {
    setIsLoading(true);
    setServerError(null);

    try {
      const newSession = await usersApi.changePassword(data);
      // Apply new session without logging user out
      applySession(newSession);
      reset();
      toast.success('Password changed. Other devices were signed out.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        // CURRENT_PASSWORD_INCORRECT is 400 (never triggers refresh or logout)
        if (err.code === ERROR_CODES.CURRENT_PASSWORD_INCORRECT) {
          setError('currentPassword', { message: 'Current password provided is incorrect' });
          return;
        }
        if (err.code === ERROR_CODES.SAME_PASSWORD) {
          setError('newPassword', { message: 'New password cannot be identical to current password' });
          return;
        }
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof ChangePasswordInput, { message: fe.message });
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

      {/* Current password */}
      <PasswordInput
        label="Current Password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />

      {/* New password */}
      <div>
        <PasswordInput
          label="New Password"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        {watchedNewPassword && <PasswordStrength password={watchedNewPassword} />}
      </div>

      {/* Confirm new password */}
      <PasswordInput
        label="Confirm New Password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <div className="pt-2">
        <Button type="submit" variant="primary" isLoading={isLoading}>
          Update password
        </Button>
      </div>
    </form>
  );
};
