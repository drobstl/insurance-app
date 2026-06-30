'use client';

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import type { AgentProfile } from '../DashboardContext';
import { PRICING_TIERS, type PricingTierId } from '../../../lib/pricing';
import type { GoogleDriveStatusResponse, GoogleCalendarStatusResponse } from './settingsHelpers';

interface AccountTabProps {
  agentProfile: AgentProfile;
  user: User | null;
  setAgentProfile: Dispatch<SetStateAction<AgentProfile>>;
  /** Lifted to the parent so the Profile tab's "Change" button can open it. */
  showEmailSection: boolean;
  setShowEmailSection: (v: boolean) => void;
  // Subscription — the cancel-warning modal + portal handoff live in the parent shell.
  portalLoading: boolean;
  onManageSubscription: () => void;
  // Google Drive — status/loaders/OAuth-callback effects stay in the parent.
  googleDriveLoading: boolean;
  googleDriveStatus: GoogleDriveStatusResponse['data'] | null;
  googleDriveConnecting: boolean;
  googleDriveDisconnecting: boolean;
  googleDriveError: string | null;
  onConnectDrive: () => void;
  onDisconnectDrive: () => void;
  // Google Calendar
  googleCalendarLoading: boolean;
  googleCalendarStatus: GoogleCalendarStatusResponse['data'] | null;
  googleCalendarConnecting: boolean;
  googleCalendarDisconnecting: boolean;
  googleCalendarError: string | null;
  onConnectCalendar: () => void;
  onDisconnectCalendar: () => void;
}

export default function AccountTab({
  agentProfile,
  user,
  setAgentProfile,
  showEmailSection,
  setShowEmailSection,
  portalLoading,
  onManageSubscription,
  googleDriveLoading,
  googleDriveStatus,
  googleDriveConnecting,
  googleDriveDisconnecting,
  googleDriveError,
  onConnectDrive,
  onDisconnectDrive,
  googleCalendarLoading,
  googleCalendarStatus,
  googleCalendarConnecting,
  googleCalendarDisconnecting,
  googleCalendarError,
  onConnectCalendar,
  onDisconnectCalendar,
}: AccountTabProps) {
  // Password change (form state is local to this tab)
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Email change (form state is local to this tab; open/close is lifted)
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    if (!user?.email) return;
    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Current password is incorrect.');
      } else {
        setPasswordError('Failed to update password. Please try again.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEmailChange = async () => {
    setEmailError('');
    setEmailSuccess('');
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!emailPassword) {
      setEmailError('Please enter your current password to confirm.');
      return;
    }
    if (!user?.email) return;
    setChangingEmail(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, emailPassword);
      await reauthenticateWithCredential(user, credential);

      const token = await user.getIdToken(true);
      const res = await fetch('/api/auth/update-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail: trimmedEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'Failed to update email. Please try again.');
        return;
      }

      setAgentProfile((prev) => ({ ...prev, email: trimmedEmail }));
      setEmailSuccess(`Email updated to ${trimmedEmail}. Sign out and sign back in with your new email.`);
      setNewEmail('');
      setEmailPassword('');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setEmailError('Current password is incorrect.');
      } else {
        setEmailError('Failed to update email. Please try again.');
      }
    } finally {
      setChangingEmail(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Subscription */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Subscription</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                // Status chip. A no-card trial agent (Entry-mechanism
                // cutover) has no `subscriptionStatus`, so without a
                // trial branch they'd show an amber "Unknown". Instead
                // show a teal "Trial · N days left" — the countdown is
                // folded in here so the no-card trial only renders one
                // chip (the separate countdown below skips trial tier).
                // The post-trial Free tier (Phase 2 day-14 default) is
                // likewise not a subscription, so it gets its own neutral
                // "Free" chip rather than the amber "Unknown" fallback.
                const isActive = agentProfile.subscriptionStatus === 'active';
                const isTrial = !isActive && agentProfile.membershipTier === 'trial';
                const isFree = !isActive && !isTrial && agentProfile.membershipTier === 'free';
                const trialEndMs = agentProfile.trialEndsAt;
                const trialDaysLeft =
                  isTrial && typeof trialEndMs === 'number'
                    ? Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                const cls = isActive
                  ? 'bg-green-100 text-green-700'
                  : isTrial
                    ? 'bg-[#daf3f0] text-[#005851]'
                    : isFree
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-amber-100 text-amber-700';
                let label: string;
                if (isActive) label = 'Active';
                else if (isTrial) {
                  label =
                    trialDaysLeft && trialDaysLeft > 0
                      ? `Trial · ${trialDaysLeft === 1 ? '1 day left' : `${trialDaysLeft} days left`}`
                      : 'Trial';
                } else if (isFree) label = 'Free';
                else label = agentProfile.subscriptionStatus || 'Unknown';
                return (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
                    {label}
                  </span>
                );
              })()}
              {agentProfile.isFoundingMember && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-gradient-to-b from-[#f5d976] via-[#e2b93b] to-[#c99a2e] text-[#5c3a0a] text-[10px] font-extrabold uppercase tracking-wider border border-[#c99a2e]">
                  Founding Member
                </span>
              )}
              {(() => {
                // Stripe-native trial countdown (e.g. Growth's 14-day
                // trial on a paid SKU). `trialEndsAt` is normalized to
                // epoch millis in DashboardContext. The no-card trial
                // folds its countdown into the status chip above, so
                // skip here for `membershipTier === 'trial'` to avoid a
                // duplicate "Trial" chip.
                if (agentProfile.membershipTier === 'trial') return null;
                const trialEndMs = agentProfile.trialEndsAt;
                if (typeof trialEndMs !== 'number') return null;
                const daysLeft = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 0) return null;
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wide border border-amber-200">
                    Trial · {daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
                  </span>
                );
              })()}
            </div>
            {(() => {
              // Display the agent's actual tier and price. Stripe webhook
              // writes `membershipTier` on subscription.created/updated
              // (web/app/api/webhooks/stripe/route.ts).
              const tier = (agentProfile as Record<string, unknown>).membershipTier;
              if (typeof tier === 'string' && tier in PRICING_TIERS) {
                const info = PRICING_TIERS[tier as PricingTierId];
                return (
                  <p className="text-sm text-[#707070] mt-1">
                    {info.name} &middot; ${info.priceMonthly}/mo
                  </p>
                );
              }
              // Founding members are on grandfathered legacy SKUs (archived
              // post-Track-C). Keep their existing display in place.
              if (agentProfile.isFoundingMember) {
                return (
                  <p className="text-sm text-[#707070] mt-1">
                    Founding Member &middot; grandfathered plan
                  </p>
                );
              }
              return (
                <p className="text-sm text-[#707070] mt-1">
                  Plan details &mdash; tap Manage for billing portal
                </p>
              );
            })()}
          </div>
          {agentProfile.stripeCustomerId && (
            <button
              onClick={onManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors disabled:opacity-50"
            >
              {portalLoading ? 'Opening...' : 'Manage'}
            </button>
          )}
        </div>
      </div>

      {/* Google Drive */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Google Drive</h3>
        {googleDriveLoading ? (
          <p className="text-sm text-[#707070]">Checking connection...</p>
        ) : googleDriveStatus ? (
          <div className="space-y-3">
            <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/40 px-3 py-2">
              <p className="text-sm font-medium text-[#005851]">Connected</p>
              <p className="text-xs text-[#005851]/80 mt-0.5">
                {googleDriveStatus.googleEmail || 'Google account connected'}
              </p>
            </div>
            <button
              onClick={onDisconnectDrive}
              disabled={googleDriveDisconnecting}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-[5px] hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {googleDriveDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[#707070]">
              Connect Google Drive to browse and import application PDFs without downloading files first.
            </p>
            <button
              onClick={onConnectDrive}
              disabled={googleDriveConnecting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#005851] rounded-[5px] hover:bg-[#004440] transition-colors disabled:opacity-50"
            >
              {googleDriveConnecting ? 'Redirecting...' : 'Connect Google Drive'}
            </button>
          </div>
        )}
        {googleDriveError && (
          <p className="text-xs text-red-600 mt-3">{googleDriveError}</p>
        )}
      </div>

      {/* Google Calendar */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Google Calendar</h3>
        {googleCalendarLoading ? (
          <p className="text-sm text-[#707070]">Checking connection...</p>
        ) : googleCalendarStatus ? (
          <div className="space-y-3">
            <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/40 px-3 py-2">
              <p className="text-sm font-medium text-[#005851]">Connected</p>
              <p className="text-xs text-[#005851]/80 mt-0.5">
                {googleCalendarStatus.googleEmail || 'Google account connected'}
              </p>
            </div>
            <button
              onClick={onDisconnectCalendar}
              disabled={googleCalendarDisconnecting}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-[5px] hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {googleCalendarDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[#707070]">
              Connect Google Calendar to push your AFL appointments to your calendar app, with native device reminders.
            </p>
            <button
              onClick={onConnectCalendar}
              disabled={googleCalendarConnecting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#005851] rounded-[5px] hover:bg-[#004440] transition-colors disabled:opacity-50"
            >
              {googleCalendarConnecting ? 'Redirecting...' : 'Connect Google Calendar'}
            </button>
          </div>
        )}
        {googleCalendarError && (
          <p className="text-xs text-red-600 mt-3">{googleCalendarError}</p>
        )}
      </div>

      {/* Email */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <button
          onClick={() => setShowEmailSection(!showEmailSection)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide">Change Email</h3>
          <svg
            className={`w-5 h-5 text-[#707070] transition-transform ${showEmailSection ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showEmailSection && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[#707070]">
              This will update both your sign-in email and your profile email (used for conservation alerts, notifications, etc.).
            </p>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Current Email</label>
              <input
                type="email"
                value={agentProfile.email || user?.email || ''}
                readOnly
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 bg-[#f5f5f5] text-[#707070] text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">New Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="newemail@example.com"
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Current Password</label>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Enter your password to confirm"
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            {emailError && <p className="text-sm text-red-600">{emailError}</p>}
            {emailSuccess && <p className="text-sm text-green-600">{emailSuccess}</p>}
            <button
              onClick={handleEmailChange}
              disabled={changingEmail || !newEmail.trim() || !emailPassword}
              className="px-4 py-2 text-sm font-medium bg-[#005851] text-white rounded-[5px] hover:bg-[#004440] transition-colors disabled:opacity-50"
            >
              {changingEmail ? 'Updating...' : 'Update Email'}
            </button>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <button
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide">Change Password</h3>
          <svg
            className={`w-5 h-5 text-[#707070] transition-transform ${showPasswordSection ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPasswordSection && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-600">{passwordSuccess}</p>}
            <button
              onClick={handlePasswordChange}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="px-4 py-2 text-sm font-medium bg-[#005851] text-white rounded-[5px] hover:bg-[#004440] transition-colors disabled:opacity-50"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
