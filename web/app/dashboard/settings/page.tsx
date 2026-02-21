'use client';

import { useState, useRef, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';

type Tab = 'profile' | 'branding' | 'referral-ai' | 'account';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'branding', label: 'Branding' },
  { key: 'referral-ai', label: 'Referral & AI' },
  { key: 'account', label: 'Account' },
];

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function detectSchedulingPlatform(url: string): string | null {
  if (/calendly\.com/i.test(url)) return 'Calendly';
  if (/cal\.com/i.test(url)) return 'Cal.com';
  if (/acuityscheduling\.com/i.test(url)) return 'Acuity';
  if (/calendar\.google\.com/i.test(url)) return 'Google Calendar';
  return null;
}

export default function SettingsPage() {
  const { user, agentProfile, setAgentProfile, loading } = useDashboard();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Stripe portal
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const updateField = useCallback(
    <K extends keyof typeof agentProfile>(key: K, value: (typeof agentProfile)[K]) => {
      setAgentProfile((prev) => ({ ...prev, [key]: value }));
    },
    [setAgentProfile],
  );

  const handleImageUpload = useCallback(
    async (file: File, maxSize: number, field: 'photoBase64' | 'agencyLogoBase64' | 'businessCardBase64') => {
      try {
        const base64 = await resizeImage(file, maxSize);
        updateField(field, base64);
      } catch {
        setSaveMessage({ type: 'error', text: 'Failed to process image. Please try a different file.' });
      }
    },
    [updateField],
  );

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await setDoc(doc(db, 'agents', user.uid), {
        phoneNumber: agentProfile.phoneNumber || '',
        schedulingUrl: agentProfile.schedulingUrl || '',
        agencyName: agentProfile.agencyName || '',
        agencyLogoBase64: agentProfile.agencyLogoBase64 || null,
        businessCardBase64: agentProfile.businessCardBase64 || null,
        photoBase64: agentProfile.photoBase64 || null,
        aiAssistantEnabled: agentProfile.aiAssistantEnabled ?? true,
        referralMessage: agentProfile.referralMessage || '',
        autoHolidayCards: agentProfile.autoHolidayCards ?? false,
        anniversaryMessageStyle: agentProfile.anniversaryMessageStyle || 'check_in',
      }, { merge: true });
      setSaveMessage({ type: 'success', text: 'Settings saved successfully.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

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

  const handleManageSubscription = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create portal session');
      window.location.href = data.url;
    } catch {
      alert('Failed to open subscription management. Please try again.');
      setPortalLoading(false);
    }
  };

  if (loading) return null;

  const schedulingPlatform = agentProfile.schedulingUrl
    ? detectSchedulingPlatform(agentProfile.schedulingUrl)
    : null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Settings</h1>
        <p className="text-[#707070] text-sm mt-1">Manage your profile, branding, and account preferences.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-white rounded-[5px] border border-gray-200 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 text-sm font-semibold rounded-[4px] transition-colors ${
              activeTab === tab.key
                ? 'bg-[#005851] text-white'
                : 'text-[#707070] hover:text-[#005851] hover:bg-[#f5f5f5]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Profile Tab ─── */}
      {activeTab === 'profile' && (
        <div className="space-y-5">
          {/* Photo */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Profile Photo</h3>
            <div className="flex items-center gap-5">
              {agentProfile.photoBase64 ? (
                <img
                  src={`data:image/jpeg;base64,${agentProfile.photoBase64}`}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover border-2 border-[#45bcaa]"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#44bbaa] flex items-center justify-center text-white text-2xl font-bold">
                  {agentProfile.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A'}
                </div>
              )}
              <div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f, 400, 'photoBase64');
                  }}
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
                >
                  {agentProfile.photoBase64 ? 'Change Photo' : 'Upload Photo'}
                </button>
                <p className="text-xs text-[#707070] mt-1.5">JPEG, resized to 400px. Stored securely.</p>
              </div>
            </div>
          </div>

          {/* Name & Email */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Personal Info</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Name</label>
                <input
                  type="text"
                  value={agentProfile.name || ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-[5px] border border-gray-200 bg-[#f5f5f5] text-[#707070] text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Email</label>
                <input
                  type="email"
                  value={agentProfile.email || user?.email || ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-[5px] border border-gray-200 bg-[#f5f5f5] text-[#707070] text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={agentProfile.phoneNumber || ''}
                  onChange={(e) => updateField('phoneNumber', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
                />
              </div>
            </div>
          </div>

          {/* Scheduling URL */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Scheduling Link</h3>
            <div>
              <input
                type="url"
                value={agentProfile.schedulingUrl || ''}
                onChange={(e) => updateField('schedulingUrl', e.target.value)}
                placeholder="https://calendly.com/your-name"
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
              {agentProfile.schedulingUrl && !agentProfile.schedulingUrl.startsWith('https://') && (
                <p className="text-xs text-red-500 mt-1.5">URL must start with https://</p>
              )}
              {schedulingPlatform && (
                <p className="text-xs text-[#45bcaa] mt-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Detected: {schedulingPlatform}
                </p>
              )}
              <p className="text-xs text-[#707070] mt-1.5">Supports Calendly, Cal.com, Acuity, and Google Calendar links.</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Branding Tab ─── */}
      {activeTab === 'branding' && (
        <div className="space-y-5">
          {/* Agency Name */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Agency Name</h3>
            <input
              type="text"
              value={agentProfile.agencyName || ''}
              onChange={(e) => updateField('agencyName', e.target.value)}
              placeholder="Your Agency Name"
              className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
            />
          </div>

          {/* Agency Logo */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Agency Logo</h3>
            {agentProfile.agencyLogoBase64 ? (
              <div className="flex items-center gap-5">
                <img
                  src={`data:image/jpeg;base64,${agentProfile.agencyLogoBase64}`}
                  alt="Agency logo"
                  className="w-24 h-24 rounded-[5px] object-contain border border-gray-200 bg-[#f5f5f5] p-2"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f, 200, 'agencyLogoBase64');
                    }}
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
                  >
                    Change Logo
                  </button>
                  <button
                    onClick={() => updateField('agencyLogoBase64', undefined)}
                    className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-[5px] hover:bg-red-50 transition-colors"
                  >
                    Remove Logo
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f, 200, 'agencyLogoBase64');
                  }}
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-gray-300 rounded-[5px] text-[#707070] text-sm hover:border-[#45bcaa] hover:text-[#005851] transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upload Agency Logo
                </button>
                <p className="text-xs text-[#707070] mt-1.5">Resized to 200px. Displayed in your client app.</p>
              </div>
            )}
          </div>

          {/* Business Card */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Business Card</h3>
            {agentProfile.businessCardBase64 ? (
              <div className="space-y-3">
                <img
                  src={`data:image/jpeg;base64,${agentProfile.businessCardBase64}`}
                  alt="Business card"
                  className="w-full max-w-sm rounded-[5px] border border-gray-200"
                />
                <input
                  ref={cardInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f, 800, 'businessCardBase64');
                  }}
                />
                <button
                  onClick={() => cardInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
                >
                  Replace Card
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={cardInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f, 800, 'businessCardBase64');
                  }}
                />
                <button
                  onClick={() => cardInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-gray-300 rounded-[5px] text-[#707070] text-sm hover:border-[#45bcaa] hover:text-[#005851] transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Upload Business Card
                </button>
                <p className="text-xs text-[#707070] mt-1.5">Resized to 800px. Shown in your client-facing app.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Referral & AI Tab ─── */}
      {activeTab === 'referral-ai' && (
        <div className="space-y-5">
          {/* AI Assistant */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">AI Assistant</h3>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#000000]">
                  {agentProfile.aiAssistantEnabled !== false ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-[#707070] mt-1">
                  {agentProfile.aiAssistantEnabled !== false
                    ? 'The AI assistant will automatically draft referral outreach messages, conservation scripts, and anniversary check-ins for you.'
                    : 'AI features are off. You\'ll compose all outreach and follow-up messages manually.'}
                </p>
              </div>
              <button
                onClick={() => updateField('aiAssistantEnabled', !agentProfile.aiAssistantEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  agentProfile.aiAssistantEnabled !== false ? 'bg-[#44bbaa]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                    agentProfile.aiAssistantEnabled !== false ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Referral Message */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Referral Message Template</h3>
            <textarea
              value={agentProfile.referralMessage || ''}
              onChange={(e) => updateField('referralMessage', e.target.value)}
              placeholder="Hi [referral], [client] thought you might benefit from a quick insurance review. I'm [agent] and I'd love to help..."
              rows={4}
              className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-none"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {['[referral]', '[agent]', '[client]'].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851] text-xs font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-xs text-[#707070] mt-1.5">Use placeholders above. They&rsquo;ll be replaced with real names when sent.</p>
          </div>

          {/* Holiday Cards */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Holiday Cards</h3>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#000000]">Auto-Send Holiday Cards</p>
                <p className="text-xs text-[#707070] mt-1">
                  Automatically send branded holiday greetings to all your clients during major holidays.
                </p>
              </div>
              <button
                onClick={() => updateField('autoHolidayCards', !agentProfile.autoHolidayCards)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  agentProfile.autoHolidayCards ? 'bg-[#44bbaa]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                    agentProfile.autoHolidayCards ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Anniversary Message Style */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Anniversary Message Style</h3>
            <p className="text-xs text-[#707070] mb-3">Choose how your 1-year policy anniversary messages are framed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => updateField('anniversaryMessageStyle', 'check_in')}
                className={`p-4 rounded-[5px] border-2 text-left transition-colors ${
                  (agentProfile.anniversaryMessageStyle || 'check_in') === 'check_in'
                    ? 'border-[#44bbaa] bg-[#f0faf8]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    (agentProfile.anniversaryMessageStyle || 'check_in') === 'check_in'
                      ? 'border-[#44bbaa]'
                      : 'border-gray-300'
                  }`}>
                    {(agentProfile.anniversaryMessageStyle || 'check_in') === 'check_in' && (
                      <div className="w-2 h-2 rounded-full bg-[#44bbaa]" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-[#000000]">Friendly Check-In</span>
                </div>
                <p className="text-xs text-[#707070]">
                  A warm, relationship-first message celebrating the milestone and asking how things are going.
                </p>
              </button>
              <button
                onClick={() => updateField('anniversaryMessageStyle', 'lower_price')}
                className={`p-4 rounded-[5px] border-2 text-left transition-colors ${
                  agentProfile.anniversaryMessageStyle === 'lower_price'
                    ? 'border-[#44bbaa] bg-[#f0faf8]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    agentProfile.anniversaryMessageStyle === 'lower_price'
                      ? 'border-[#44bbaa]'
                      : 'border-gray-300'
                  }`}>
                    {agentProfile.anniversaryMessageStyle === 'lower_price' && (
                      <div className="w-2 h-2 rounded-full bg-[#44bbaa]" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-[#000000]">Rate Review</span>
                </div>
                <p className="text-xs text-[#707070]">
                  Proactively offer to shop for a better rate, positioning you as someone who saves them money.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Account Tab ─── */}
      {activeTab === 'account' && (
        <div className="space-y-5">
          {/* Subscription */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Subscription</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    agentProfile.subscriptionStatus === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {agentProfile.subscriptionStatus === 'active' ? 'Active' : agentProfile.subscriptionStatus || 'Unknown'}
                  </span>
                  {agentProfile.isFoundingMember && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-gradient-to-b from-[#f5d976] via-[#e2b93b] to-[#c99a2e] text-[#5c3a0a] text-[10px] font-extrabold uppercase tracking-wider border border-[#c99a2e]">
                      Founding Member
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#707070] mt-1">$9.99/mo &middot; Unlimited clients &amp; policies</p>
              </div>
              {agentProfile.stripeCustomerId && (
                <button
                  onClick={() => setShowCancelWarning(true)}
                  disabled={portalLoading}
                  className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors disabled:opacity-50"
                >
                  {portalLoading ? 'Opening...' : 'Manage'}
                </button>
              )}
            </div>
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
      )}

      {/* Save Bar */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          {saveMessage && (
            <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {showCancelWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelWarning(false)} />
          <div className="relative bg-white rounded-[5px] shadow-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#005851] text-center mb-2">Before you go...</h3>
            <p className="text-sm text-[#4B5563] text-center mb-4">
              If you cancel your subscription, you will lose access to:
            </p>
            <ul className="space-y-2 mb-6">
              {[
                'Your AI business line and phone number',
                'All client records and policy data',
                'Referral conversations and AI history',
                'Conservation alerts and outreach tracking',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#374151]">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#6B7280] text-center mb-5">
              This cannot be undone. Your data will not be preserved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelWarning(false)}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#f0faf8] transition-colors"
              >
                Never Mind
              </button>
              <button
                onClick={() => { setShowCancelWarning(false); handleManageSubscription(); }}
                disabled={portalLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-red-600 rounded-[5px] hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {portalLoading ? 'Opening...' : 'Continue to Billing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
