'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import type { AgentProfile } from '../DashboardContext';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';
import {
  resizeImage,
  getCroppedImage,
  type SaveMessage,
  type GoogleDriveStatusResponse,
  type GoogleCalendarStatusResponse,
} from '../settings/settingsHelpers';
import ProfileTab from '../settings/ProfileTab';
import BrandingTab from '../settings/BrandingTab';
import MessagesTab from '../settings/MessagesTab';
import AppointmentsLeadsTab from '../settings/AppointmentsLeadsTab';
import AccountTab from '../settings/AccountTab';

type Tab = 'you' | 'appointments' | 'leads' | 'messages' | 'account';

const TABS: { key: Tab; label: string; subtitle: string }[] = [
  { key: 'you', label: 'You', subtitle: 'Who you are and how you show up' },
  { key: 'appointments', label: 'Appointments', subtitle: 'How you book, confirm, and remind' },
  { key: 'leads', label: 'Leads & dialer', subtitle: 'Your scripts, dialing, and lead-home videos' },
  { key: 'messages', label: 'Messages & automation', subtitle: 'What goes out, and what runs on its own' },
  { key: 'account', label: 'Account', subtitle: 'Billing, login, and connections' },
];

// Old tab keys still arrive from deep links (onboarding, GetStartedHome,
// patch nudges). Map them onto the regrouped tabs so nothing 404s a tab.
const TAB_ALIASES: Record<string, Tab> = {
  profile: 'you',
  branding: 'you',
  'appointments-leads': 'appointments',
};

/* The Leads & dialer mirror: what a booked lead sees in their lead-home —
   the agent's intro video, FAQs, and a quick intake. Reflects the agent's
   real leadContent so editing the tab updates the preview. */
function LeadHomePreview({ agentProfile }: { agentProfile: AgentProfile }) {
  const lc = agentProfile.leadContent;
  const introTitle = lc?.intro?.title || 'Welcome — what to do next';
  const introPlayable = !!(lc?.intro?.url || lc?.intro?.iframeUrl);
  const faqs = lc?.faqs ?? [];
  const faqTiles = faqs.length ? faqs.slice(0, 2).map((f) => f.title) : ['Is this a sales pitch?', 'How long does this take?'];
  const agentFirst = agentProfile.name?.split(' ')[0] || 'your agent';
  return (
    <div className="hidden md:block w-[280px] shrink-0 sticky top-6">
      <p className="text-xs text-[#707070] font-semibold uppercase tracking-wide text-center mb-3">Lead Home Preview</p>
      <div className="w-[260px] mx-auto bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
        <div className="w-full h-[520px] rounded-[2.5rem] overflow-hidden flex flex-col bg-[#F8F9FA]">
          {/* Header — the lead-home greets the lead by name */}
          <div className="bg-[#0D4D4D] px-4 pt-5 pb-4">
            <p className="text-white/70 text-[10px] font-medium">Welcome, Sarah</p>
            <p className="text-white text-[14px] font-bold leading-tight">{agentProfile.name || 'Your Agent'}</p>
          </div>
          <div className="flex-1 px-3 py-3 overflow-hidden space-y-3">
            {/* Intro video — big teal play tile, badge top-right, title at bottom */}
            <div className="relative rounded-[12px] bg-[#0D4D4D] min-h-[116px] p-3 flex flex-col justify-end">
              <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-[#3DD6C3] flex items-center justify-center text-[#0D4D4D] text-[10px]">▶</span>
              <p className="text-white text-[13px] font-bold leading-snug">{introTitle}</p>
              {!introPlayable && <p className="text-white/55 text-[8px] mt-0.5">Coming soon</p>}
            </div>
            {/* Step 1 — quick assessment (comes before the FAQs) */}
            <div>
              <p className="text-[#0f7d68] text-[9px] font-bold uppercase tracking-[0.1em] mb-1.5">Step 1</p>
              <div className="rounded-[12px] bg-[#3DD6C3] px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[#063b35] text-[12px] font-bold">Quick assessment</p>
                  <p className="text-[#0D4D4D]/80 text-[9px] mt-0.5 leading-snug">10 quick questions so {agentFirst} doesn&rsquo;t have to ask the basics on the call.</p>
                </div>
                <span className="text-[#063b35] text-[15px] font-bold shrink-0">&rarr;</span>
              </div>
            </div>
            {/* Step 2 — FAQ tiles, 2-up */}
            <div>
              <p className="text-[#0f7d68] text-[9px] font-bold uppercase tracking-[0.1em] mb-1.5">Step 2 &middot; Common questions</p>
              <div className="grid grid-cols-2 gap-2">
                {faqTiles.map((t, i) => (
                  <div key={i} className="relative rounded-[10px] bg-[#0D4D4D] min-h-[64px] p-2 flex flex-col justify-end">
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#3DD6C3] flex items-center justify-center text-[#0D4D4D] text-[8px]">▶</span>
                    <p className="text-white text-[9px] font-semibold leading-snug">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[#9CA3AF] text-center mt-2">What your booked leads see</p>
    </div>
  );
}

export default function SettingsV2Page() {
  const { user, agentProfile, setAgentProfile, loading } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<Tab>('you');

  // Deep-link a specific tab via ?tab=account|you|appointments-leads etc.,
  // so onboarding links can drop the agent exactly where they need to be.
  // Legacy keys (profile, branding) resolve through TAB_ALIASES.
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam) return;
    const resolved = (TAB_ALIASES[tabParam] ?? tabParam) as Tab;
    if (TABS.some((t) => t.key === resolved)) {
      setActiveTab(resolved);
    }
  }, [searchParams]);

  const activeTabIndex = TABS.findIndex((t) => t.key === activeTab);

  // Tab-switch motion: a conveyor belt. The outgoing panel slides off one
  // side while the incoming slides in from the other. `belt` holds the
  // leaving tab + direction during the ~320ms transition — only then are
  // two panels rendered at once. Skipped entirely under reduced-motion.
  const [belt, setBelt] = useState<{ from: Tab; dir: 'left' | 'right' } | null>(null);
  const beltTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (beltTimerRef.current) window.clearTimeout(beltTimerRef.current);
  }, []);

  function goToTab(key: Tab) {
    if (key === activeTab) return;
    const toIndex = TABS.findIndex((t) => t.key === key);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      setBelt({ from: activeTab, dir: toIndex > activeTabIndex ? 'right' : 'left' });
      if (beltTimerRef.current) window.clearTimeout(beltTimerRef.current);
      beltTimerRef.current = window.setTimeout(() => setBelt(null), 320);
    }
    setActiveTab(key);
  }

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<SaveMessage>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Change Email open/close is lifted here (not into AccountTab) because
  // the Profile tab's "Change" button opens it on the Account tab.
  const [showEmailSection, setShowEmailSection] = useState(false);

  // Photo crop modal
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Stripe portal
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [googleDriveConnecting, setGoogleDriveConnecting] = useState(false);
  const [googleDriveDisconnecting, setGoogleDriveDisconnecting] = useState(false);
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveStatusResponse['data'] | null>(null);
  const [googleDriveError, setGoogleDriveError] = useState<string | null>(null);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleCalendarConnecting, setGoogleCalendarConnecting] = useState(false);
  const [googleCalendarDisconnecting, setGoogleCalendarDisconnecting] = useState(false);
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<GoogleCalendarStatusResponse['data'] | null>(null);
  const [googleCalendarError, setGoogleCalendarError] = useState<string | null>(null);

  const saveInFlightRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autosaveHydratedRef = useRef(false);
  const lastSavedSnapshotRef = useRef('');
  // Holds a live "flush if there are unsaved edits" closure so the unmount
  // handler can persist a pending (debounced) autosave instead of dropping it.
  const flushPendingSaveRef = useRef<() => void>(() => {});

  const updateField = useCallback(
    <K extends keyof typeof agentProfile>(key: K, value: (typeof agentProfile)[K]) => {
      setAgentProfile((prev) => ({ ...prev, [key]: value }));
    },
    [setAgentProfile],
  );

  const settingsSnapshot = useMemo(() => JSON.stringify({
    name: agentProfile.name || '',
    phoneNumber: agentProfile.phoneNumber || '',
    schedulingUrl: agentProfile.schedulingUrl || '',
    agencyName: agentProfile.agencyName || '',
    npn: agentProfile.npn || '',
    agencyLogoBase64: agentProfile.agencyLogoBase64 || null,
    businessCardBase64: agentProfile.businessCardBase64 || null,
    photoBase64: agentProfile.photoBase64 || null,
    familyPhotoBase64: agentProfile.familyPhotoBase64 || null,
    carrierStripBase64: agentProfile.carrierStripBase64 || null,
    aiAssistantEnabled: agentProfile.aiAssistantEnabled ?? true,
    referralMessage: agentProfile.referralMessage || '',
    autoHolidayCards: agentProfile.autoHolidayCards ?? false,
    anniversaryMessageStyle: agentProfile.anniversaryMessageStyle || 'check_in',
    anniversaryMessageCustom: agentProfile.anniversaryMessageCustom || '',
    anniversaryMessageCustomTitle: agentProfile.anniversaryMessageCustomTitle || '',
    policyReviewAIEnabled: agentProfile.policyReviewAIEnabled ?? true,
    welcomeSmsTemplate: agentProfile.welcomeSmsTemplate || '',
    introTextTemplate: agentProfile.introTextTemplate || '',
    appointmentMode: agentProfile.appointmentMode || 'phone',
    defaultMeetingLink: agentProfile.defaultMeetingLink || '',
    autoCreateGoogleMeet: agentProfile.autoCreateGoogleMeet ?? true,
    reminderPushHoursBefore: agentProfile.reminderPushHoursBefore ?? 1,
    dialScript: agentProfile.dialScript || '',
    dialPersistence: agentProfile.dialPersistence ?? 1,
    forwardInboundSms: agentProfile.forwardInboundSms ?? true,
    confirmationChannel: agentProfile.confirmationChannel === 'email' ? 'email' : 'text',
    includeAppAccessInConfirmations: agentProfile.includeAppAccessInConfirmations ?? true,
    resetRevealEnabled: agentProfile.resetRevealEnabled ?? false,
    // Tri-state: null preserves "undefined = show only if real videos exist".
    showLeadFaqs: agentProfile.showLeadFaqs ?? null,
    showLeadCaseStudies: agentProfile.showLeadCaseStudies ?? null,
  }), [
    agentProfile.name,
    agentProfile.phoneNumber,
    agentProfile.schedulingUrl,
    agentProfile.agencyName,
    agentProfile.npn,
    agentProfile.agencyLogoBase64,
    agentProfile.businessCardBase64,
    agentProfile.photoBase64,
    agentProfile.familyPhotoBase64,
    agentProfile.carrierStripBase64,
    agentProfile.aiAssistantEnabled,
    agentProfile.referralMessage,
    agentProfile.autoHolidayCards,
    agentProfile.anniversaryMessageStyle,
    agentProfile.anniversaryMessageCustom,
    agentProfile.anniversaryMessageCustomTitle,
    agentProfile.policyReviewAIEnabled,
    agentProfile.welcomeSmsTemplate,
    agentProfile.introTextTemplate,
    agentProfile.appointmentMode,
    agentProfile.defaultMeetingLink,
    agentProfile.autoCreateGoogleMeet,
    agentProfile.reminderPushHoursBefore,
    agentProfile.dialScript,
    agentProfile.dialPersistence,
    agentProfile.forwardInboundSms,
    agentProfile.confirmationChannel,
    agentProfile.includeAppAccessInConfirmations,
    agentProfile.resetRevealEnabled,
    agentProfile.showLeadFaqs,
    agentProfile.showLeadCaseStudies,
  ]);

  const loadGoogleDriveStatus = useCallback(async () => {
    if (!user) return;
    setGoogleDriveLoading(true);
    setGoogleDriveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as GoogleDriveStatusResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load Google Drive status.');
      }
      setGoogleDriveStatus(data.connected ? (data.data || null) : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Google Drive status.';
      setGoogleDriveError(message);
      setGoogleDriveStatus(null);
    } finally {
      setGoogleDriveLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGoogleDriveStatus();
  }, [loadGoogleDriveStatus]);

  useEffect(() => {
    const status = searchParams.get('google_drive');
    if (!status) return;

    if (status === 'success') {
      setSaveMessage({ type: 'success', text: 'Google Drive connected successfully.' });
      loadGoogleDriveStatus();
    } else if (status === 'error') {
      const reason = searchParams.get('reason');
      setSaveMessage({
        type: 'error',
        text: reason ? `Google Drive connection failed: ${reason}` : 'Google Drive connection failed.',
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('google_drive');
    params.delete('reason');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [searchParams, pathname, router, loadGoogleDriveStatus]);

  const handleGoogleDriveConnect = useCallback(async () => {
    if (!user) return;
    setGoogleDriveConnecting(true);
    setGoogleDriveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/auth', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: pathname }),
      });
      const data = (await res.json()) as { success: boolean; authUrl?: string; error?: string };
      if (!res.ok || !data.success || !data.authUrl) {
        throw new Error(data.error || 'Failed to start Google OAuth.');
      }
      window.location.assign(data.authUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Google Drive.';
      setGoogleDriveError(message);
      setSaveMessage({ type: 'error', text: message });
      setGoogleDriveConnecting(false);
    }
  }, [pathname, user]);

  const handleGoogleDriveDisconnect = useCallback(async () => {
    if (!user) return;
    setGoogleDriveDisconnecting(true);
    setGoogleDriveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect Google Drive.');
      }
      setGoogleDriveStatus(null);
      setSaveMessage({ type: 'success', text: 'Google Drive disconnected.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect Google Drive.';
      setGoogleDriveError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setGoogleDriveDisconnecting(false);
    }
  }, [user]);

  const loadGoogleCalendarStatus = useCallback(async () => {
    if (!user) return;
    setGoogleCalendarLoading(true);
    setGoogleCalendarError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google-calendar/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as GoogleCalendarStatusResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load Google Calendar status.');
      }
      setGoogleCalendarStatus(data.connected ? (data.data || null) : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Google Calendar status.';
      setGoogleCalendarError(message);
      setGoogleCalendarStatus(null);
    } finally {
      setGoogleCalendarLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGoogleCalendarStatus();
  }, [loadGoogleCalendarStatus]);

  useEffect(() => {
    const status = searchParams.get('google_calendar');
    if (!status) return;

    if (status === 'success') {
      setSaveMessage({ type: 'success', text: 'Google Calendar connected successfully.' });
      loadGoogleCalendarStatus();
    } else if (status === 'error') {
      const reason = searchParams.get('reason');
      setSaveMessage({
        type: 'error',
        text: reason ? `Google Calendar connection failed: ${reason}` : 'Google Calendar connection failed.',
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('google_calendar');
    params.delete('reason');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [searchParams, pathname, router, loadGoogleCalendarStatus]);

  const handleGoogleCalendarConnect = useCallback(async () => {
    if (!user) return;
    setGoogleCalendarConnecting(true);
    setGoogleCalendarError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google-calendar/auth', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: pathname }),
      });
      const data = (await res.json()) as { success: boolean; authUrl?: string; error?: string };
      if (!res.ok || !data.success || !data.authUrl) {
        throw new Error(data.error || 'Failed to start Google Calendar OAuth.');
      }
      window.location.assign(data.authUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Google Calendar.';
      setGoogleCalendarError(message);
      setSaveMessage({ type: 'error', text: message });
      setGoogleCalendarConnecting(false);
    }
  }, [pathname, user]);

  const handleGoogleCalendarDisconnect = useCallback(async () => {
    if (!user) return;
    setGoogleCalendarDisconnecting(true);
    setGoogleCalendarError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect Google Calendar.');
      }
      setGoogleCalendarStatus(null);
      setSaveMessage({ type: 'success', text: 'Google Calendar disconnected.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect Google Calendar.';
      setGoogleCalendarError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setGoogleCalendarDisconnecting(false);
    }
  }, [user]);

  const handleImageUpload = useCallback(
    async (file: File, maxSize: number, field: 'photoBase64' | 'agencyLogoBase64' | 'businessCardBase64' | 'familyPhotoBase64' | 'carrierStripBase64') => {
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

  const handleSave = useCallback(async (mode: 'manual' | 'auto' = 'manual', snapshot = settingsSnapshot) => {
    if (!user) return;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    if (mode === 'manual') {
      setSaveMessage(null);
    } else {
      setAutoSaveStatus('saving');
    }
    try {
      const newPhone = (agentProfile.phoneNumber || '').trim();
      const agentRef = doc(db, 'agents', user.uid);
      const existingSnap = await getDoc(agentRef);
      const previousPhone = (existingSnap.data()?.phoneNumber as string) ?? '';
      const isFirstTimePhone = !previousPhone.trim() && !!newPhone;

      await setDoc(agentRef, {
        name: agentProfile.name || '',
        phoneNumber: agentProfile.phoneNumber || '',
        schedulingUrl: agentProfile.schedulingUrl || '',
        agencyName: agentProfile.agencyName || '',
        npn: (agentProfile.npn || '').trim(),
        agencyLogoBase64: agentProfile.agencyLogoBase64 || null,
        businessCardBase64: agentProfile.businessCardBase64 || null,
        photoBase64: agentProfile.photoBase64 || null,
        familyPhotoBase64: agentProfile.familyPhotoBase64 || null,
        carrierStripBase64: agentProfile.carrierStripBase64 || null,
        aiAssistantEnabled: agentProfile.aiAssistantEnabled ?? true,
        referralMessage: agentProfile.referralMessage || '',
        autoHolidayCards: agentProfile.autoHolidayCards ?? false,
        anniversaryMessageStyle: agentProfile.anniversaryMessageStyle || 'check_in',
        anniversaryMessageCustom: agentProfile.anniversaryMessageCustom || '',
        anniversaryMessageCustomTitle: agentProfile.anniversaryMessageCustomTitle || '',
        policyReviewAIEnabled: agentProfile.policyReviewAIEnabled ?? true,
        welcomeSmsTemplate: agentProfile.welcomeSmsTemplate || '',
        introTextTemplate: (agentProfile.introTextTemplate || '').slice(0, 1000),
        appointmentMode: agentProfile.appointmentMode === 'video' ? 'video' : 'phone',
        defaultMeetingLink: (agentProfile.defaultMeetingLink || '').trim(),
        autoCreateGoogleMeet: agentProfile.autoCreateGoogleMeet ?? true,
        resetRevealEnabled: agentProfile.resetRevealEnabled ?? false,
        reminderPushHoursBefore: (() => {
          const raw = Number(agentProfile.reminderPushHoursBefore ?? 1);
          if (!Number.isFinite(raw)) return 1;
          // 0 = disabled; otherwise clamp to 1..24.
          if (raw <= 0) return 0;
          return Math.min(24, Math.max(1, Math.round(raw)));
        })(),
        dialScript: (agentProfile.dialScript || '').slice(0, 8000),
        dialPersistence: (() => {
          const raw = Number(agentProfile.dialPersistence ?? 1);
          if (raw === 2 || raw === 3) return raw;
          return 1;
        })(),
        forwardInboundSms: agentProfile.forwardInboundSms ?? true,
        confirmationChannel: agentProfile.confirmationChannel === 'email' ? 'email' : 'text',
        // Default ON for Pro+; only the agent's explicit opt-out writes
        // false. The app link is still gated on a real intro video at
        // send time, so ON here never produces an empty prep page.
        includeAppAccessInConfirmations: agentProfile.includeAppAccessInConfirmations ?? true,
        // Lead-home section visibility. null = undefined = "show only if the
        // agent has a real video in that slot" (resolved in the mobile
        // manifest). An explicit true/false is the agent's override.
        showLeadFaqs: agentProfile.showLeadFaqs ?? null,
        showLeadCaseStudies: agentProfile.showLeadCaseStudies ?? null,
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

      // Phase 1 Track B — vCard regeneration. The endpoint is idempotent
      // and short-circuits on a matching source fingerprint, so it's
      // safe to call after every save. Fire-and-forget; failures must
      // not block the settings save UX.
      try {
        const token = await user.getIdToken();
        void fetch('/api/agent/vcard/regenerate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }).catch((vcardErr) => {
          console.error('[agent-vcard] regenerate request failed (non-blocking):', vcardErr);
        });
      } catch (tokenErr) {
        console.error('[agent-vcard] regenerate token mint failed (non-blocking):', tokenErr);
      }

      if (mode === 'manual') {
        captureEvent(ANALYTICS_EVENTS.SETTINGS_UPDATED, {
          setting_changed: activeTab,
        });
      }
      lastSavedSnapshotRef.current = snapshot;
      window.dispatchEvent(new CustomEvent('afl:settings-saved'));
      if (mode === 'manual') {
        setSaveMessage({ type: 'success', text: 'Settings saved successfully.' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setAutoSaveStatus('saved');
      }
    } catch (err) {
      console.error('Save error:', err);
      if (mode === 'manual') {
        captureEvent(ANALYTICS_EVENTS.ACTION_FAILED, {
          action: 'save_settings',
          surface: 'settings',
          reason: 'save_failed',
        });
        setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
      } else {
        setAutoSaveStatus('error');
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [activeTab, agentProfile, settingsSnapshot, user]);

  // Keep the flush closure current each render (latest handleSave + snapshot).
  flushPendingSaveRef.current = () => {
    if (settingsSnapshot !== lastSavedSnapshotRef.current) {
      void handleSave('auto', settingsSnapshot);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    if (!autosaveHydratedRef.current) {
      autosaveHydratedRef.current = true;
      lastSavedSnapshotRef.current = settingsSnapshot;
      setAutoSaveStatus('idle');
      return;
    }
    if (settingsSnapshot === lastSavedSnapshotRef.current) {
      if (autoSaveStatus !== 'saving') {
        setAutoSaveStatus('idle');
      }
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    setAutoSaveStatus('saving');
    const snapshotAtSchedule = settingsSnapshot;
    autoSaveTimerRef.current = window.setTimeout(() => {
      void handleSave('auto', snapshotAtSchedule);
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [autoSaveStatus, handleSave, loading, settingsSnapshot, user]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    // Flush a pending (debounced) autosave so leaving the page mid-edit —
    // e.g. uploading a photo then jumping straight to the deck — still saves.
    flushPendingSaveRef.current();
  }, []);

  // Deep link: the live-call dial-script popup links to
  // /dashboard/settings#dial-script ("Edit script in Settings"). The
  // dial-script card lives on the Leads & dialer tab, so once the profile
  // has loaded, switch to that tab and scroll the card into view.
  useEffect(() => {
    if (loading) return;
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#dial-script') return;
    setActiveTab('leads');
    const t = window.setTimeout(() => {
      document.getElementById('dial-script')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [loading]);

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

  const agentFirstName = agentProfile.name?.split(' ')[0] || 'Agent';
  // The phone is a live mirror of the CLIENT app, so it only shows where
  // what you're editing actually changes it — You, Appointments, Messages.
  // On Leads & dialer (lead-facing) and Account it's hidden, but its column
  // stays reserved so the layout never shifts. (Lead-home preview is next.)
  const showPhonePreview =
    activeTab === 'you' || activeTab === 'appointments' || activeTab === 'messages';
  // Leads & dialer is lead-facing, so its mirror is the lead-home (what a
  // booked lead sees), not the client card.
  const showLeadPreview = activeTab === 'leads';

  // One tab's content (subtitle + sections). Rendered for the active tab,
  // and also for the leaving tab during a belt transition so both can
  // slide at once.
  function renderTabBody(tab: Tab) {
    const meta = TABS.find((t) => t.key === tab);
    return (
      <>
        {meta && (
          <div className="mb-6 pb-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-[#111827] tracking-tight">{meta.label}</h2>
            <p className="text-sm text-[#4b5563] mt-1">{meta.subtitle}</p>
          </div>
        )}
        {tab === 'you' && (
          <div className="space-y-5">
            <ProfileTab
              clean
              agentProfile={agentProfile}
              updateField={updateField}
              user={user}
              setSaveMessage={setSaveMessage}
              onChangeEmail={() => { goToTab('account'); setShowEmailSection(true); }}
              setCropImageSrc={setCropImageSrc}
              setCrop={setCrop}
              setZoom={setZoom}
            />
            <BrandingTab
              agentProfile={agentProfile}
              updateField={updateField}
              handleImageUpload={handleImageUpload}
            />
          </div>
        )}
        {tab === 'appointments' && (
          <AppointmentsLeadsTab
            view="appointments"
            clean
            agentProfile={agentProfile}
            updateField={updateField}
            user={user}
            setAgentProfile={setAgentProfile}
            setSaveMessage={setSaveMessage}
            googleCalendarStatus={googleCalendarStatus}
          />
        )}
        {tab === 'leads' && (
          <div className="space-y-5">
            <MessagesTab
              view="dialer"
              agentProfile={agentProfile}
              updateField={updateField}
              user={user}
            />
            <AppointmentsLeadsTab
              view="leads"
              clean
              agentProfile={agentProfile}
              updateField={updateField}
              user={user}
              setAgentProfile={setAgentProfile}
              setSaveMessage={setSaveMessage}
              googleCalendarStatus={googleCalendarStatus}
            />
          </div>
        )}
        {tab === 'messages' && (
          <MessagesTab
            view="messages"
            clean
            agentProfile={agentProfile}
            updateField={updateField}
            user={user}
          />
        )}
        {tab === 'account' && (
          <AccountTab
            agentProfile={agentProfile}
            user={user}
            setAgentProfile={setAgentProfile}
            showEmailSection={showEmailSection}
            setShowEmailSection={setShowEmailSection}
            portalLoading={portalLoading}
            onManageSubscription={() => setShowCancelWarning(true)}
            googleDriveLoading={googleDriveLoading}
            googleDriveStatus={googleDriveStatus}
            googleDriveConnecting={googleDriveConnecting}
            googleDriveDisconnecting={googleDriveDisconnecting}
            googleDriveError={googleDriveError}
            onConnectDrive={handleGoogleDriveConnect}
            onDisconnectDrive={handleGoogleDriveDisconnect}
            googleCalendarLoading={googleCalendarLoading}
            googleCalendarStatus={googleCalendarStatus}
            googleCalendarConnecting={googleCalendarConnecting}
            googleCalendarDisconnecting={googleCalendarDisconnecting}
            googleCalendarError={googleCalendarError}
            onConnectCalendar={handleGoogleCalendarConnect}
            onDisconnectCalendar={handleGoogleCalendarDisconnect}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Floating autosave indicator. Pinned to viewport so the agent
          gets feedback wherever they're editing (the Save Settings bar
          + status text at the bottom of the page is too far away to
          notice while editing fields near the top). Hidden when idle. */}
      {autoSaveStatus !== 'idle' && (
        <div
          aria-live="polite"
          className="fixed top-24 right-6 z-40 pointer-events-none"
        >
          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-xs text-[#707070]">
              <svg className="animate-spin w-3.5 h-3.5 text-[#44bbaa]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Saving…</span>
            </div>
          )}
          {autoSaveStatus === 'saved' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#ECFDF5] border border-[#A7F3D0] rounded-full shadow-sm text-xs text-[#065F46]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>All changes saved</span>
            </div>
          )}
          {autoSaveStatus === 'error' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FEF2F2] border border-[#FECACA] rounded-full shadow-sm text-xs text-[#991B1B]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
              </svg>
              <span>Autosave failed — use Save Settings</span>
            </div>
          )}
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Settings</h1>
      </div>

      <div className="flex gap-6 items-start">

      {/* Locked left nav rail */}
      <nav className="hidden sm:block flex-none w-[196px] sticky top-6 space-y-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => goToTab(tab.key)}
            data-onboarding-target={tab.key === 'you' ? 'settings-tab-profile' : undefined}
            className={`block w-full text-left px-3.5 py-2.5 rounded-[10px] text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#005851] text-white'
                : 'text-[#6b7280] hover:bg-gray-100 hover:text-[#005851]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content column */}
      <div className="flex-1 min-w-0">
      <div className="settings-skin relative overflow-hidden">
        <div
          key={activeTab}
          className={belt ? (belt.dir === 'right' ? 'belt-enter-right' : 'belt-enter-left') : ''}
        >
          {renderTabBody(activeTab)}
        </div>
        {belt && (
          <div className="absolute inset-0" aria-hidden>
            <div className={belt.dir === 'right' ? 'belt-exit-left' : 'belt-exit-right'}>
              {renderTabBody(belt.from)}
            </div>
          </div>
        )}
      </div>

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
          data-onboarding-target="settings-save-button"
          onClick={() => {
            void handleSave('manual');
          }}
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
      <div className="mt-2 flex justify-end">
        {autoSaveStatus === 'saving' && (
          <p className="text-xs text-[#707070]">Autosaving...</p>
        )}
        {autoSaveStatus === 'saved' && (
          <p className="text-xs text-[#0D4D4D]">All changes saved</p>
        )}
        {autoSaveStatus === 'error' && (
          <p className="text-xs text-red-600">Autosave failed. Use Save Settings to retry.</p>
        )}
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
      {showLeadPreview && (
        <LeadHomePreview agentProfile={agentProfile} />
      )}
      {!showPhonePreview && !showLeadPreview && (
        <div className="hidden md:block w-[280px] shrink-0" aria-hidden />
      )}

      </div>
    </div>
  );
}
