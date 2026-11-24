import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usersApi } from '@/api/users.api';
import { alertPreferencesSchema } from '@/utils/validators';
import {
  ALERT_THRESHOLDS_MIN_COUNT,
  ALERT_THRESHOLDS_MAX_COUNT,
  ALERT_THRESHOLD_MIN_VALUE,
  ALERT_THRESHOLD_MAX_VALUE
} from '@/config/limits';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { ApiClientError } from '@/api/errors';
import { Plus, X } from 'lucide-react';

export const AlertPreferencesForm: React.FC = () => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [thresholds, setThresholds] = useState<number[]>(user?.alertThresholds || [80, 100]);
  const [inApp, setInApp] = useState(user?.alertInAppEnabled ?? true);
  const [emailAlerts, setEmailAlerts] = useState(user?.alertEmailEnabled ?? false);
  const [newThresholdInput, setNewThresholdInput] = useState('');
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  const initialThresholdsSorted = [...(user?.alertThresholds || [80, 100])].sort((a, b) => a - b);
  const currentThresholdsSorted = [...thresholds].sort((a, b) => a - b);

  const isThresholdsChanged =
    initialThresholdsSorted.length !== currentThresholdsSorted.length ||
    initialThresholdsSorted.some((v, i) => v !== currentThresholdsSorted[i]);

  const isInAppChanged = user && inApp !== user.alertInAppEnabled;
  const isEmailChanged = user && emailAlerts !== user.alertEmailEnabled;
  const isChanged = isThresholdsChanged || isInAppChanged || isEmailChanged;

  const handleAddThreshold = () => {
    setThresholdError(null);
    const parsed = parseInt(newThresholdInput.trim(), 10);

    if (isNaN(parsed)) {
      setThresholdError('Please enter a valid percentage number.');
      return;
    }
    if (parsed < ALERT_THRESHOLD_MIN_VALUE || parsed > ALERT_THRESHOLD_MAX_VALUE) {
      setThresholdError(`Threshold must be between ${ALERT_THRESHOLD_MIN_VALUE} and ${ALERT_THRESHOLD_MAX_VALUE}%.`);
      return;
    }
    if (thresholds.includes(parsed)) {
      setThresholdError('This threshold already exists.');
      return;
    }
    if (thresholds.length >= ALERT_THRESHOLDS_MAX_COUNT) {
      setThresholdError(`Maximum of ${ALERT_THRESHOLDS_MAX_COUNT} thresholds allowed.`);
      return;
    }

    const updated = [...thresholds, parsed].sort((a, b) => a - b);
    setThresholds(updated);
    setNewThresholdInput('');
  };

  const handleRemoveThreshold = (val: number) => {
    setThresholdError(null);
    if (thresholds.length <= ALERT_THRESHOLDS_MIN_COUNT) {
      setThresholdError(`At least ${ALERT_THRESHOLDS_MIN_COUNT} threshold is required.`);
      return;
    }
    setThresholds(thresholds.filter((t) => t !== val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isChanged || !user) return;
    setIsLoading(true);
    setServerError(null);
    setThresholdError(null);

    const validation = alertPreferencesSchema.safeParse({
      alertThresholds: thresholds,
      alertInAppEnabled: inApp,
      alertEmailEnabled: emailAlerts
    });

    if (!validation.success) {
      setIsLoading(false);
      setThresholdError(validation.error.errors[0]?.message || 'Invalid thresholds');
      return;
    }

    const patch: Partial<typeof user> = {};
    if (isThresholdsChanged) patch.alertThresholds = validation.data.alertThresholds;
    if (isInAppChanged) patch.alertInAppEnabled = inApp;
    if (isEmailChanged) patch.alertEmailEnabled = emailAlerts;

    try {
      const updated = await usersApi.updateMe(patch);
      updateUser(updated);
      toast.success('Changes saved');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors.length > 0) {
          setThresholdError(err.fieldErrors[0].message);
          return;
        }
        setServerError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-form">
      {serverError && (
        <div role="alert" className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm">
          {serverError}
        </div>
      )}

      {/* Threshold Editor */}
      <div className="space-y-3">
        <div>
          <h3 className="block text-sm font-medium text-ink mb-1 select-none">
            Budget Alert Thresholds
          </h3>
          <p className="text-xs text-muted">
            Receive warnings when spending reaches these percentages of any monthly budget.
          </p>
        </div>

        {/* Existing thresholds badges */}
        <div className="flex flex-wrap gap-2 items-center" aria-label="Current alert thresholds">
          {thresholds.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-panel border border-hairline rounded-full text-xs font-mono font-medium text-ink shadow-xs"
            >
              {t}%
              <button
                type="button"
                onClick={() => handleRemoveThreshold(t)}
                aria-label={`Remove ${t}% threshold`}
                className="text-muted hover:text-danger p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Add threshold input */}
        {thresholds.length < ALERT_THRESHOLDS_MAX_COUNT && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="number"
              min={ALERT_THRESHOLD_MIN_VALUE}
              max={ALERT_THRESHOLD_MAX_VALUE}
              value={newThresholdInput}
              onChange={(e) => setNewThresholdInput(e.target.value)}
              placeholder="e.g. 90"
              aria-label="New threshold percentage"
              className="w-24 px-3 py-1.5 text-xs font-mono bg-panel text-ink border border-hairline rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddThreshold}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add threshold
            </Button>
          </div>
        )}

        {thresholdError && (
          <p className="text-xs text-danger font-medium" role="alert">
            {thresholdError}
          </p>
        )}
      </div>

      <div className="border-t border-hairline pt-4 space-y-3">
        {/* In-app switch */}
        <Switch
          label="In-App Notifications"
          description="Display notifications in the application when budgets are close to limit."
          checked={inApp}
          onChange={setInApp}
        />

        {/* Email switch */}
        <Switch
          label="Email Notifications"
          description="Email delivery depends on the server being configured with mail settings."
          checked={emailAlerts}
          onChange={setEmailAlerts}
        />
      </div>

      <div className="pt-2">
        <Button type="submit" variant="primary" disabled={!isChanged || isLoading} isLoading={isLoading}>
          Save changes
        </Button>
      </div>
    </form>
  );
};
