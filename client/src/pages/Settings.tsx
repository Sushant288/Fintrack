import React from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { PreferencesForm } from '@/components/settings/PreferencesForm';
import { AlertPreferencesForm } from '@/components/settings/AlertPreferencesForm';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';

export const Settings: React.FC = () => {
  usePageTitle('Settings');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-semibold text-ink">Account Settings</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage your personal details, regional preferences, and security.
        </p>
      </div>

      {/* Profile Section */}
      <section id="profile" className="p-6 bg-panel border border-hairline rounded-md space-y-4">
        <div>
          <h2 className="text-base font-heading font-semibold text-ink">Personal Profile</h2>
          <p className="text-xs text-muted">Update your account name.</p>
        </div>
        <ProfileForm />
      </section>

      {/* Regional Preferences Section */}
      <section id="region" className="p-6 bg-panel border border-hairline rounded-md space-y-4">
        <div>
          <h2 className="text-base font-heading font-semibold text-ink">Regional Preferences</h2>
          <p className="text-xs text-muted">Select your primary currency and time zone.</p>
        </div>
        <PreferencesForm />
      </section>

      {/* Alert Preferences Section */}
      <section id="alerts" className="p-6 bg-panel border border-hairline rounded-md space-y-4">
        <div>
          <h2 className="text-base font-heading font-semibold text-ink">Budget Notifications</h2>
          <p className="text-xs text-muted">Configure budget threshold alerts and delivery channels.</p>
        </div>
        <AlertPreferencesForm />
      </section>

      {/* Appearance Section */}
      <section id="appearance" className="p-6 bg-panel border border-hairline rounded-md space-y-4">
        <div>
          <h2 className="text-base font-heading font-semibold text-ink">Appearance</h2>
          <p className="text-xs text-muted">Customize the application theme.</p>
        </div>
        <AppearanceSection />
      </section>

      {/* Password Section */}
      <section id="password" className="p-6 bg-panel border border-hairline rounded-md space-y-4">
        <div>
          <h2 className="text-base font-heading font-semibold text-ink">Change Password</h2>
          <p className="text-xs text-muted">Update your account password to protect your data.</p>
        </div>
        <ChangePasswordForm />
      </section>

      {/* Danger Zone Section */}
      <section id="danger-zone">
        <DeleteAccountSection />
      </section>
    </div>
  );
};
