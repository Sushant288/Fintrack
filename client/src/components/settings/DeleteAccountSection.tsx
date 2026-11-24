import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '@/api/users.api';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { ROUTES } from '@/config/routes';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';

export const DeleteAccountSection: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!password) {
      setPasswordError('Password is required to delete your account');
      return;
    }

    setIsLoading(true);
    try {
      await usersApi.deleteAccount(password);
      await logout();
      toast.success('Account deleted');
      navigate(ROUTES.REGISTER, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (
          err.code === ERROR_CODES.INVALID_CREDENTIALS ||
          err.code === ERROR_CODES.CURRENT_PASSWORD_INCORRECT
        ) {
          setPasswordError('Incorrect password. Please try again.');
          return;
        }
        setPasswordError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-danger/30 rounded-md p-6 bg-panel">
      <h3 className="text-base font-heading font-semibold text-danger mb-1">Danger Zone</h3>
      <p className="text-sm text-muted mb-4 leading-relaxed max-w-xl">
        Permanently delete your account and all associated financial data, including transactions, budgets, recurring rules, and categories. This action cannot be reversed.
      </p>

      <Button variant="danger" type="button" onClick={() => setIsOpen(true)}>
        Delete account
      </Button>

      {/* Password verification dialog */}
      <Modal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setPassword('');
          setPasswordError(null);
        }}
        title="Delete Account"
      >
        <form onSubmit={handleDelete} className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            This permanently deletes your account, transactions, budgets and goals. This can't be undone.
          </p>

          <PasswordInput
            label="Confirm your password to proceed"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError || undefined}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsOpen(false);
                setPassword('');
                setPasswordError(null);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" isLoading={isLoading}>
              Permanently delete account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
