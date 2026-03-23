'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getCroppedImage(imageSrc: string, pixelCrop: Area, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(pixelCrop.width, pixelCrop.height);
      const outSize = Math.min(size, maxSize);
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, outSize, outSize,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

  // Email change
  const [showEmailSection, setShowEmailSection] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Photo crop modal
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

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

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleCropSave = useCallback(async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const base64 = await getCroppedImage(cropImageSrc, croppedAreaPixels, 400);
      updateField('photoBase64', base64);
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to crop image. Please try a different file.' });
    } finally {
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [cropImageSrc, croppedAreaPixels, updateField]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const newPhone = (agentProfile.phoneNumber || '').trim();
      const agentRef = doc(db, 'agents', user.uid);
      const existingSnap = await getDoc(agentRef);
      const previousPhone = (existingSnap.data()?.phoneNumber as string) ?? '';
      const isFirstTimePhone = !previousPhone.trim() && !!newPhone;

      await setDoc(agentRef, {
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
        anniversaryMessageCustom: agentProfile.anniversaryMessageCustom || '',
        anniversaryMessageCustomTitle: agentProfile.anniversaryMessageCustomTitle || '',
        policyReviewAIEnabled: agentProfile.policyReviewAIEnabled ?? true,
        welcomeSmsTemplate: agentProfile.welcomeSmsTemplate || '',
        skipWelcomeSmsConfirmation: agentProfile.skipWelcomeSmsConfirmation ?? false,
      }, { merge: true });

      if (isFirstTimePhone) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/agent-invite/sms', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // non-blocking: settings still saved
        }
      }

      captureEvent(ANALYTICS_EVENTS.SETTINGS_UPDATED, {
        setting_changed: activeTab,
      });

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

  const agentFirstName = agentProfile.name?.split(' ')[0] || 'Agent';
  const showPhonePreview = activeTab === 'profile' || activeTab === 'branding';

  return (
    <div className={`mx-auto ${showPhonePreview ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Settings</h1>
        <p className="text-[#707070] text-sm mt-1">Manage your profile, branding, and account preferences.</p>
      </div>

      <div className={showPhonePreview ? 'flex gap-8 items-start' : ''}>
      <div className={showPhonePreview ? 'flex-1 min-w-0' : ''}>

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
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const dataUrl = await readFileAsDataUrl(f);
                      setCropImageSrc(dataUrl);
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                    } catch {
                      setSaveMessage({ type: 'error', text: 'Failed to read image. Please try a different file.' });
                    }
                    if (photoInputRef.current) photoInputRef.current.value = '';
                  }}
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
                >
                  {agentProfile.photoBase64 ? 'Change Photo' : 'Upload Photo'}
                </button>
                <p className="text-xs text-[#707070] mt-1.5">Upload a photo and position it to fit. Stored securely.</p>
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
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={agentProfile.email || user?.email || ''}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-[5px] border border-gray-200 bg-[#f5f5f5] text-[#707070] text-sm cursor-not-allowed"
                  />
                  <button
                    onClick={() => { setActiveTab('account'); setShowEmailSection(true); }}
                    className="px-3 py-2 text-xs font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={agentProfile.phoneNumber || ''}
                  onChange={(e) => updateField('phoneNumber', formatPhoneNumber(e.target.value))}
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
              placeholder="Hey [referral], wanted to connect you with my insurance agent [agent]. They just got my family's finances protected and I thought they might be able to help you too. They'll probably reach out — super easy to talk to."
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
            <p className="text-xs text-[#707070] mt-1.5">Unless you change it, this is the default message clients send when they refer someone. Use the placeholders above; they&rsquo;re replaced with real names when sent.</p>
          </div>

          {/* Client Welcome Text */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Client Welcome Text</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1.5">Message Template</label>
                <textarea
                  value={agentProfile.welcomeSmsTemplate || ''}
                  onChange={(e) => updateField('welcomeSmsTemplate', e.target.value)}
                  placeholder="Hey {{firstName}}! {{agentName}} here. Download the AgentForLife app and use code {{code}} to connect with me. https://agentforlife.app/app"
                  rows={4}
                  className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-y"
                />
                <p className="text-xs text-[#707070] mt-1.5">
                  Used for client welcome texts when you add a client (including single-PDF create).
                  Leave blank to use the default message.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['{{firstName}}', '{{code}}', '{{agentName}}'].map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851] text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#000000]">Skip Warning on Single-PDF Create</p>
                  <p className="text-xs text-[#707070] mt-1">
                    When on, creating a client from a single PDF auto-sends the welcome text immediately (no confirmation step).
                  </p>
                </div>
                <button
                  onClick={() => updateField('skipWelcomeSmsConfirmation', !(agentProfile.skipWelcomeSmsConfirmation ?? false))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    (agentProfile.skipWelcomeSmsConfirmation ?? false) ? 'bg-[#44bbaa]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                      (agentProfile.skipWelcomeSmsConfirmation ?? false) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <button
                onClick={() => updateField('anniversaryMessageStyle', 'custom')}
                className={`p-4 rounded-[5px] border-2 text-left transition-colors ${
                  agentProfile.anniversaryMessageStyle === 'custom'
                    ? 'border-[#44bbaa] bg-[#f0faf8]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    agentProfile.anniversaryMessageStyle === 'custom'
                      ? 'border-[#44bbaa]'
                      : 'border-gray-300'
                  }`}>
                    {agentProfile.anniversaryMessageStyle === 'custom' && (
                      <div className="w-2 h-2 rounded-full bg-[#44bbaa]" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-[#000000]">Custom Message</span>
                </div>
                <p className="text-xs text-[#707070]">
                  Write your own message that goes out automatically to every client at their policy anniversary.
                </p>
              </button>
            </div>
            {agentProfile.anniversaryMessageStyle === 'custom' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#000000] mb-1">Push Notification Title <span className="text-[#707070] font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={agentProfile.anniversaryMessageCustomTitle || ''}
                    onChange={(e) => updateField('anniversaryMessageCustomTitle', e.target.value)}
                    placeholder="Policy Review"
                    className="w-full px-3 py-2 border border-gray-200 rounded-[5px] text-sm text-[#000000] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#44bbaa] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#000000] mb-1">Message Template</label>
                  <textarea
                    value={agentProfile.anniversaryMessageCustom || ''}
                    onChange={(e) => updateField('anniversaryMessageCustom', e.target.value)}
                    placeholder={`Hi {{firstName}}, your {{policyLabel}} anniversary is coming up. I'd love to check in and make sure everything still fits. — {{agentName}}`}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-[5px] text-sm text-[#000000] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#44bbaa] focus:border-transparent resize-y"
                  />
                  {agentProfile.anniversaryMessageStyle === 'custom' && !agentProfile.anniversaryMessageCustom?.trim() && (
                    <p className="text-xs text-amber-600 mt-1">Please enter a message template before saving.</p>
                  )}
                </div>
                <div className="bg-[#f8fafb] rounded-[5px] p-3 border border-gray-100">
                  <p className="text-xs font-medium text-[#005851] mb-1.5">Available Placeholders</p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-[#707070]">
                    <span><code className="bg-white px-1 py-0.5 rounded border border-gray-200 text-[#005851]">{`{{firstName}}`}</code> Client first name</span>
                    <span><code className="bg-white px-1 py-0.5 rounded border border-gray-200 text-[#005851]">{`{{policyLabel}}`}</code> Policy description</span>
                    <span><code className="bg-white px-1 py-0.5 rounded border border-gray-200 text-[#005851]">{`{{agentName}}`}</code> Your name</span>
                    <span><code className="bg-white px-1 py-0.5 rounded border border-gray-200 text-[#005851]">{`{{schedulingNote}}`}</code> Scheduling link</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rewrite campaigns (policy review AI) */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Rewrite Campaigns</h3>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#000000]">
                  {agentProfile.policyReviewAIEnabled !== false ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-[#707070] mt-1">
                  {agentProfile.policyReviewAIEnabled !== false
                    ? 'When a policy hits its 1-year anniversary, AI will automatically reach out to your client to schedule a review call. ROP and Graded policies are always skipped.'
                    : 'Anniversary review campaigns are off. You\'ll need to reach out to clients manually for policy reviews.'}
                </p>
              </div>
              <button
                onClick={() => updateField('policyReviewAIEnabled', !(agentProfile.policyReviewAIEnabled !== false))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  agentProfile.policyReviewAIEnabled !== false ? 'bg-[#44bbaa]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                    agentProfile.policyReviewAIEnabled !== false ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Account Tab ─── */}
      {activeTab === 'account' && (
        <div className="space-y-5">
          {/* Invite Agents */}
          <InviteAgentsCard />

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

          {/* Section Tips */}
          <div className="bg-white rounded-[5px] border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-2">Section Tips</h3>
            <p className="text-sm text-[#707070] mb-3">Re-show the help tips that appear when you first visit each dashboard section.</p>
            <button
              onClick={async () => {
                if (!user) return;
                try {
                  await setDoc(doc(db, 'agents', user.uid), { tipsSeen: {} }, { merge: true });
                  setAgentProfile(prev => ({ ...prev, tipsSeen: {} }));
                } catch (err) {
                  console.error('Error resetting tips:', err);
                }
              }}
              className="px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
            >
              Reset Tips
            </button>
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
                'Your AI referral assistant',
                'All client records and policy data',
                'Referral conversations and AI history',
                'Retention alerts and outreach tracking',
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

      {cropImageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCropImageSrc(null)} />
          <div className="relative bg-white rounded-[5px] shadow-2xl w-full max-w-md">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-[#005851]">Position Your Photo</h3>
              <p className="text-xs text-[#707070] mt-0.5">Drag to reposition. Use the slider to zoom.</p>
            </div>
            <div className="relative w-full" style={{ height: 320 }}>
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-6 py-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-[#707070] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-[#44bbaa]"
                />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => { setCropImageSrc(null); setCrop({ x: 0, y: 0 }); setZoom(1); }}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#f0faf8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCropSave}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] rounded-[5px] hover:bg-[#005751] transition-colors"
              >
                Save Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhonePreview && (
        <div className="hidden md:block w-[280px] shrink-0 sticky top-6">
          <p className="text-xs text-[#707070] font-semibold uppercase tracking-wide text-center mb-3">Client App Preview</p>
          <div className="w-[260px] mx-auto bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
            <div className="w-full h-[520px] rounded-[2.5rem] overflow-hidden flex flex-col">

              {/* Header — matches mobile #0D4D4D header */}
              <div className="bg-[#0D4D4D] px-4 pt-5 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-[9px] font-medium">Welcome back,</p>
                  <p className="text-white text-[13px] font-bold">Sarah</p>
                </div>
                <div className="px-2 py-1 bg-white/[0.15] rounded-md border border-white/30">
                  <span className="text-white text-[8px] font-semibold">Sign Out</span>
                </div>
              </div>

              {/* Body — off-white #F8F9FA like the real app */}
              <div className="flex-1 bg-[#F8F9FA] px-3 py-3 overflow-hidden">

                {/* Agent Card — white, rounded-[10px] to match mobile rounded-20 at ~half scale */}
                <div className="bg-white rounded-[10px] p-3 shadow-sm">

                  {/* YOUR INSURANCE AGENT badge */}
                  <div className="bg-[#0D4D4D] rounded-md py-1.5 px-3 mx-auto w-fit mb-3">
                    <p className="text-white text-[7px] font-bold tracking-[0.12em] text-center">YOUR INSURANCE AGENT</p>
                  </div>

                  {/* Agent Avatar */}
                  <div className="flex justify-center mb-2">
                    {agentProfile.photoBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${agentProfile.photoBase64}`}
                        alt="Agent"
                        className="w-[52px] h-[52px] rounded-full object-cover border-[2.5px] border-[#3DD6C3]"
                      />
                    ) : (
                      <div className="w-[52px] h-[52px] rounded-full bg-[#0D4D4D] border-[2.5px] border-[#3DD6C3] flex items-center justify-center">
                        <span className="text-white text-lg font-bold">
                          {agentProfile.name?.charAt(0)?.toUpperCase() || 'A'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Agent Name */}
                  <p className="text-[#2D3748] text-[13px] font-bold text-center">{agentProfile.name || 'Your Name'}</p>

                  {/* Agency Name */}
                  {agentProfile.agencyName && (
                    <p className="text-[#6B7280] text-[9px] font-medium text-center mt-0.5">{agentProfile.agencyName}</p>
                  )}

                  {/* Agency Logo */}
                  {agentProfile.agencyLogoBase64 && (
                    <div className="flex justify-center mt-2 mb-1">
                      <div className="border border-[#E5E7EB] rounded-md p-1 bg-white">
                        <img
                          src={`data:image/jpeg;base64,${agentProfile.agencyLogoBase64}`}
                          alt="Logo"
                          className="h-[26px] w-auto object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Contact Rows */}
                  <div className="mt-3 space-y-1.5">
                    {/* Email row */}
                    <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-lg p-2 border border-[#E5E7EB]">
                      <div className="w-6 h-6 rounded-[4px] bg-[#0D4D4D] flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-[#2D3748] text-[9px] font-semibold flex-1">Email {agentFirstName}</span>
                      <div className="w-4 h-4 rounded-full bg-[#3DD6C3] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-semibold leading-none">&rsaquo;</span>
                      </div>
                    </div>

                    {/* Call row */}
                    <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-lg p-2 border border-[#E5E7EB]">
                      <div className="w-6 h-6 rounded-[4px] bg-[#fdcc02] flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <span className="text-[#2D3748] text-[9px] font-semibold flex-1">Call {agentFirstName}</span>
                      <div className="w-4 h-4 rounded-full bg-[#3DD6C3] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-semibold leading-none">&rsaquo;</span>
                      </div>
                    </div>

                    {/* Book Appointment row */}
                    {agentProfile.schedulingUrl && (
                      <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-lg p-2 border border-[#E5E7EB]">
                        <div className="w-6 h-6 rounded-[4px] bg-[#0D4D4D] flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-[#2D3748] text-[9px] font-semibold flex-1">Book w/ {agentFirstName}</span>
                        <div className="w-4 h-4 rounded-full bg-[#3DD6C3] flex items-center justify-center shrink-0">
                          <span className="text-white text-[8px] font-semibold leading-none">&rsaquo;</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Refer button — matches red #e31837 referral button */}
                <div className="mt-2 bg-[#e31837] rounded-[8px] py-2 px-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] bg-white/20 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-[9px] font-bold">Refer {agentFirstName}</p>
                    <p className="text-white/80 text-[7px]">Share with friends &amp; family</p>
                  </div>
                  <span className="text-white text-sm font-light">&rsaquo;</span>
                </div>

                {/* View Policies button — matches blue #0099FF */}
                <div className="mt-1.5 bg-[#0099FF] rounded-[8px] py-2 px-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] bg-white/20 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-[9px] font-bold">View My Policies</p>
                    <p className="text-white/80 text-[7px]">See your coverage details</p>
                  </div>
                  <span className="text-white text-sm font-light">&rsaquo;</span>
                </div>

              </div>
            </div>
          </div>
          <p className="text-[10px] text-[#9CA3AF] text-center mt-2">Updates live as you edit</p>
        </div>
      )}

      </div>
    </div>
  );
}

function InviteAgentsCard() {
  const { user } = useDashboard();
  const [inviteUrl, setInviteUrl] = useState('');
  const [agentsReferred, setAgentsReferred] = useState(0);
  const [rewardsGiven, setRewardsGiven] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch('/api/agent-invite', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setInviteUrl(data.inviteUrl ?? '');
          setAgentsReferred(data.agentsReferred ?? 0);
          setRewardsGiven(data.referralRewardsGiven ?? 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    );
  }, [user]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      captureEvent(ANALYTICS_EVENTS.REFERRAL_LINK_SHARED, { channel: 'copy_invite_link' });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <div className="bg-white rounded-[5px] border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-3">
        Invite Agents
      </h3>
      <p className="text-sm text-[#707070] mb-4">
        Share your invite link. Help a fellow agent discover smarter client retention — and earn your recruiter badge.
      </p>

      {loading ? (
        <div className="h-10 bg-[#f8f8f8] rounded-[5px] animate-pulse" />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 text-sm bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] px-3 py-2.5 text-[#000000] select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="shrink-0 px-4 py-2.5 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-[5px] transition-colors min-w-[80px]"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div>
            <span className="text-2xl font-extrabold text-[#005851]">{agentsReferred}</span>
            <p className="text-xs text-[#707070]">agents recruited</p>
          </div>
        </>
      )}
    </div>
  );
}
