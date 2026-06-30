'use client';

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import { Upload as TusUpload } from 'tus-js-client';
import type { AgentProfile } from '../DashboardContext';
import { canAccessLeads } from '../../../lib/tier-gating';
import RecordVideoModal from './RecordVideoModal';
import {
  MAX_LEAD_VIDEO_BYTES,
  detectSchedulingPlatform,
  type LeadVideoItem,
  type GoogleCalendarStatusResponse,
  type SaveMessage,
} from './settingsHelpers';
import { ToggleRow, IconTrendingUp } from './SettingsRow';

/**
 * "Record" button + its webcam modal. Manages only its own open state;
 * the recorded File is handed straight to onRecorded, which routes it
 * through the same uploadLeadVideo path a picked file uses.
 */
function RecordButton({
  onRecorded,
  heading,
  filenameBase,
  disabled,
  label = 'Record a video now',
}: {
  onRecorded: (file: File) => void;
  heading: string;
  filenameBase: string;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[5px] border border-[#005851] text-[#005851] hover:bg-[#005851]/5 disabled:opacity-50 disabled:cursor-default whitespace-nowrap"
      >
        <span className="h-2 w-2 rounded-full bg-red-500" />
        {label}
      </button>
      <RecordVideoModal
        open={open}
        onClose={() => setOpen(false)}
        onRecorded={onRecorded}
        heading={heading}
        filenameBase={filenameBase}
      />
    </>
  );
}

/**
 * Reusable upload list for FAQ + case-study video slots. Renders one
 * row per existing item with a title input + preview/remove, plus a
 * "+ Add" row for a new upload (title field + file picker).
 */
function LeadVideoList({
  kind,
  label,
  items,
  busyKey,
  addingProgress,
  onUpload,
  onDelete,
  shownToLeads,
  onShownChange,
  platformDefaultNote,
}: {
  kind: 'faq' | 'caseStudy';
  label: string;
  items: LeadVideoItem[];
  busyKey: string | null;
  addingProgress: number | null;
  onUpload: (file: File, slotId: string, title: string) => void;
  onDelete: (slotId: string) => void;
  /** Whether this whole section currently appears on the lead-home. */
  shownToLeads: boolean;
  onShownChange: (checked: boolean) => void;
  /** Shown when the section is on with no uploads — explains the platform
   *  default that leads see in that case (e.g. the age-aware FAQ video). */
  platformDefaultNote?: string;
}) {
  const [newTitle, setNewTitle] = useState('');
  const handleNewFile = useCallback((file: File) => {
    const slotId = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = newTitle.trim() || 'Untitled video';
    onUpload(file, slotId, title);
    setNewTitle('');
  }, [kind, newTitle, onUpload]);

  return (
    <div className="mb-5 pb-5 border-b border-[#ececec] last:border-b-0 last:pb-0 last:mb-0">
      <h4 className="text-xs font-semibold text-[#374151] mb-2">{label}</h4>

      {/* Per-section visibility. A section is hidden from leads until the
          agent has a real video here (or explicitly turns it on), so day-1
          agents never show "Coming soon" placeholders. */}
      <label className="flex items-start gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={shownToLeads}
          onChange={(e) => onShownChange(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[11px] text-[#374151] leading-snug">
          Show this section on your leads&apos; home page
          <span className="block text-[10px] text-[#9aa0a6] mt-0.5">
            {shownToLeads
              ? (items.length === 0 && platformDefaultNote ? platformDefaultNote : 'Your leads will see it.')
              : items.length > 0
              ? 'Hidden from your leads, even though you have videos here.'
              : 'Hidden — add a video above and it appears automatically, or check this to include it now.'}
          </span>
        </span>
      </label>

      {items.length === 0 && (
        <p className="text-[11px] text-[#707070] mb-2">No videos uploaded yet.</p>
      )}
      <ul className="space-y-2 mb-3">
        {items.map((item) => {
          const itemBusy = busyKey === `${kind}:${item.id}`;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#374151] truncate">{item.title || '(no title)'}</p>
                {(item.iframeUrl || item.url) && (
                  <a
                    href={item.iframeUrl || item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[#44bbaa] hover:text-[#005751] font-semibold"
                  >
                    Preview →
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={itemBusy}
                className="text-[11px] text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
              >
                {itemBusy ? 'Working…' : 'Remove'}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={kind === 'faq' ? 'e.g. Is this a sales pitch?' : 'e.g. How a real client handled this'}
          className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-xs focus:outline-none focus:border-[#45bcaa]"
        />
        <label className={addingProgress !== null ? 'pointer-events-none' : ''}>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            disabled={addingProgress !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                handleNewFile(f);
                e.currentTarget.value = '';
              }
            }}
          />
          <span className={`inline-block px-3 py-2 text-xs font-semibold rounded-[5px] cursor-pointer whitespace-nowrap ${
            addingProgress !== null
              ? 'bg-gray-200 text-gray-500 cursor-default'
              : 'bg-[#005851] hover:bg-[#004440] text-white'
          }`}>
            {addingProgress !== null ? `Uploading… ${addingProgress}%` : 'Upload a saved video'}
          </span>
        </label>
        <span className="text-xs text-[#707070]">or</span>
        <RecordButton
          disabled={addingProgress !== null}
          heading={kind === 'faq' ? 'Record an FAQ video' : 'Record a case-study video'}
          filenameBase={kind}
          onRecorded={handleNewFile}
        />
      </div>
    </div>
  );
}

interface AppointmentsLeadsTabProps {
  agentProfile: AgentProfile;
  updateField: <K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) => void;
  user: User | null;
  setAgentProfile: Dispatch<SetStateAction<AgentProfile>>;
  setSaveMessage: (m: SaveMessage) => void;
  /** Read-only — drives the "requires Google Calendar" hint on auto-Meet. */
  googleCalendarStatus: GoogleCalendarStatusResponse['data'] | null;
  /** Which half of the old combined tab to render: appointment defaults,
      or the Pro-gated dialer + lead-home surfaces. */
  view: 'appointments' | 'leads';
  /** Best-in-class restyle (settings-v2): clean rows for toggles. */
  clean?: boolean;
}

export default function AppointmentsLeadsTab({
  agentProfile,
  updateField,
  user,
  setAgentProfile,
  setSaveMessage,
  googleCalendarStatus,
  view,
  clean,
}: AppointmentsLeadsTabProps) {
  const schedulingPlatform = agentProfile.schedulingUrl
    ? detectSchedulingPlatform(agentProfile.schedulingUrl)
    : null;
  // ── Lead-home video uploads (Bunny.net Stream + TUS) ──
  const [leadVideoBusy, setLeadVideoBusy] = useState<string | null>(null);
  const [leadVideoProgress, setLeadVideoProgress] = useState<Record<string, number>>({});
  const [leadVideoError, setLeadVideoError] = useState<string | null>(null);
  // Local-only state for the intro title input. We initialize from
  // the saved title (if any) and let the agent edit before uploading.
  // The string lives here rather than on agentProfile so typing
  // doesn't trigger Firestore writes on every keystroke.
  const [introTitleDraft, setIntroTitleDraft] = useState<string>('');

  // Resolve the intro card title once, shared by the Upload and Record
  // paths: the agent's draft, else the saved title, else the default.
  const introTitle = useCallback(
    () =>
      introTitleDraft.trim() ||
      agentProfile.leadContent?.intro?.title ||
      'Welcome — what to do next',
    [introTitleDraft, agentProfile.leadContent?.intro?.title],
  );

  const uploadLeadVideo = useCallback(async (params: {
    file: File;
    slot: 'intro' | 'faq' | 'caseStudy';
    slotId?: string;
    title?: string;
  }) => {
    if (!user) return;
    if (params.file.size > MAX_LEAD_VIDEO_BYTES) {
      const sizeMb = (params.file.size / 1024 / 1024).toFixed(0);
      const msg = `That video is ${sizeMb} MB — max is 1 GB per video. Pick a smaller file.`;
      setLeadVideoError(msg);
      setSaveMessage({ type: 'error', text: msg });
      return;
    }
    const busyKey = params.slot === 'intro' ? 'intro' : `${params.slot}:${params.slotId}`;
    setLeadVideoBusy(busyKey);
    setLeadVideoProgress((prev) => ({ ...prev, [busyKey]: 0 }));
    setLeadVideoError(null);
    try {
      const token = await user.getIdToken();
      const title = params.title || 'Intro';

      // Step 1: provision Bunny.net upload endpoint. Sending the file size
      // lets the server reject oversized files before minting the upload
      // URL (the browser already capped above, but a malicious client
      // could skip the browser cap).
      const provRes = await fetch('/api/lead-content/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot: params.slot, slotId: params.slotId, title, size: params.file.size }),
      });
      const provData = await provRes.json().catch(() => ({}));
      if (!provRes.ok) throw new Error(provData?.error || `Could not start upload (${provRes.status})`);
      const { videoId, uploadUrl, headers: uploadHeaders } = provData as {
        videoId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      };

      // Step 2: stream the file straight to Bunny via TUS (resumable, bypasses Vercel).
      await new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(params.file, {
          endpoint: uploadUrl,
          headers: uploadHeaders,
          metadata: { filetype: params.file.type, title },
          chunkSize: 50 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          onProgress: (sent, total) => {
            setLeadVideoProgress((prev) => ({
              ...prev,
              [busyKey]: Math.min(99, Math.round((sent / total) * 100)),
            }));
          },
          onSuccess: () => resolve(),
          onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
        });
        upload.start();
      });
      setLeadVideoProgress((prev) => ({ ...prev, [busyKey]: 100 }));

      // Step 3: persist the new entry on Firestore.
      const commitRes = await fetch('/api/lead-content/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot: params.slot, slotId: params.slotId, title, videoId }),
      });
      const commitData = await commitRes.json().catch(() => ({}));
      if (!commitRes.ok) throw new Error(commitData?.error || `Could not save video (${commitRes.status})`);

      // Patch agentProfile.leadContent in-place so the UI updates immediately.
      setAgentProfile((prev) => {
        const next = { ...prev };
        const lc = { ...(next.leadContent || {}) };
        if (params.slot === 'intro') {
          lc.intro = commitData.entry;
        } else {
          const arrKey = params.slot === 'faq' ? 'faqs' : 'caseStudies';
          const current = (lc[arrKey] as LeadVideoItem[] | undefined) || [];
          const arr: LeadVideoItem[] = [...current];
          const idx = arr.findIndex((e) => e.id === params.slotId);
          if (idx >= 0) arr[idx] = commitData.entry as LeadVideoItem;
          else arr.push(commitData.entry as LeadVideoItem);
          lc[arrKey] = arr;
        }
        next.leadContent = lc;
        return next;
      });
      setSaveMessage({ type: 'success', text: 'Video uploaded.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setLeadVideoError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setLeadVideoBusy(null);
      setLeadVideoProgress((prev) => {
        const next = { ...prev };
        delete next[busyKey];
        return next;
      });
    }
  }, [user, setAgentProfile, setSaveMessage]);

  const deleteLeadVideo = useCallback(async (slot: 'intro' | 'faq' | 'caseStudy', slotId?: string) => {
    if (!user) return;
    const busyKey = slot === 'intro' ? 'intro' : `${slot}:${slotId}`;
    setLeadVideoBusy(busyKey);
    setLeadVideoError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/lead-content/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot, slotId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`);
      setAgentProfile((prev) => {
        const next = { ...prev };
        const lc = { ...(next.leadContent || {}) };
        if (slot === 'intro') {
          delete lc.intro;
        } else {
          const arrKey = slot === 'faq' ? 'faqs' : 'caseStudies';
          const arr: LeadVideoItem[] = ((lc[arrKey] as LeadVideoItem[] | undefined) || [])
            .filter((e) => e.id !== slotId);
          lc[arrKey] = arr;
        }
        next.leadContent = lc;
        return next;
      });
      setSaveMessage({ type: 'success', text: 'Video removed.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setLeadVideoError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setLeadVideoBusy(null);
    }
  }, [user, setAgentProfile, setSaveMessage]);

  return (
    <div className="space-y-5">
      {view === 'appointments' && (
      <>
      {/* Scheduling link — moved here from the You tab; it's how clients book you. */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Scheduling link</h3>
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

      {/* Appointment defaults — phone vs video, default meeting link, auto-Meet */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Appointments</h3>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#374151] mb-2">
            Most of your appointments are:
          </label>
          <div className="inline-flex gap-1 rounded-[8px] bg-[#eef0ee] p-1">
            <button
              type="button"
              onClick={() => updateField('appointmentMode', 'phone')}
              className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors ${
                (agentProfile.appointmentMode || 'phone') === 'phone'
                  ? 'bg-white text-[#005851] shadow-sm'
                  : 'text-[#707070] hover:text-[#005851]'
              }`}
            >
              Phone
            </button>
            <button
              type="button"
              onClick={() => updateField('appointmentMode', 'video')}
              className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors ${
                agentProfile.appointmentMode === 'video'
                  ? 'bg-white text-[#005851] shadow-sm'
                  : 'text-[#707070] hover:text-[#005851]'
              }`}
            >
              Video
            </button>
          </div>
          <p className="text-[11px] text-[#707070] mt-1.5">
            Sets the default when you book — you can override per appointment.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#374151] mb-2">
            Send booking confirmations by:
          </label>
          <div className="inline-flex gap-1 rounded-[8px] bg-[#eef0ee] p-1">
            <button
              type="button"
              onClick={() => updateField('confirmationChannel', 'text')}
              className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors ${
                (agentProfile.confirmationChannel || 'text') === 'text'
                  ? 'bg-white text-[#005851] shadow-sm'
                  : 'text-[#707070] hover:text-[#005851]'
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => updateField('confirmationChannel', 'email')}
              className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors ${
                agentProfile.confirmationChannel === 'email'
                  ? 'bg-white text-[#005851] shadow-sm'
                  : 'text-[#707070] hover:text-[#005851]'
              }`}
            >
              Email
            </button>
          </div>
          <p className="text-[11px] text-[#707070] mt-1.5">
            Your default when you send a confirmation — switchable per send. Email goes out from AgentForLife with your name, and replies come back to your inbox.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#374151] mb-1">
            Auto push-reminder timing
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={24}
              value={agentProfile.reminderPushHoursBefore ?? 1}
              onChange={(e) => {
                const v = e.target.value === '' ? 1 : Number(e.target.value);
                updateField('reminderPushHoursBefore', Number.isFinite(v) ? v : 1);
              }}
              className="w-20 px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
            />
            <span className="text-sm text-[#374151]">hours before the appointment</span>
          </div>
          <p className="text-[11px] text-[#707070] mt-1">
            If the lead has downloaded your app, AFL will auto-push a reminder this far before the appointment. Set to 0 to disable.
          </p>
        </div>

        {agentProfile.appointmentMode === 'video' && (
          <>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#374151] mb-1">
                Default meeting link
              </label>
              <input
                type="url"
                value={agentProfile.defaultMeetingLink || ''}
                onChange={(e) => updateField('defaultMeetingLink', e.target.value)}
                placeholder="https://zoom.us/j/123… or https://meet.google.com/abc-xyz"
                className="w-full px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
              />
              <p className="text-[11px] text-[#707070] mt-1">
                Your Zoom personal room or permanent Meet room. Used unless &quot;auto-create Google Meet&quot; is on.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agentProfile.autoCreateGoogleMeet ?? true}
                onChange={(e) => updateField('autoCreateGoogleMeet', e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-[#374151] leading-snug">
                Auto-create a unique Google Meet link for every video appointment
                <span className="block text-[11px] text-[#707070] mt-0.5">
                  On by default whenever Google Calendar is connected. Turn it off to
                  use your one fixed meeting link above instead.
                </span>
                {!googleCalendarStatus && (
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                    Requires Google Calendar connection (in Account).
                  </span>
                )}
              </span>
            </label>

            {/* State plainly which link actually goes out, so "the link
                changes every meeting" reads as intended, not as a bug. */}
            <p className="text-[11px] text-[#374151] mt-2 bg-[#f8f8f8] border border-[#ececec] rounded px-2 py-1.5">
              <span className="font-semibold">In effect now: </span>
              {(agentProfile.autoCreateGoogleMeet ?? true) && googleCalendarStatus
                ? 'each video booking creates its own fresh Google Meet link, and that unique link is what the confirmation sends.'
                : (agentProfile.autoCreateGoogleMeet ?? true) && !googleCalendarStatus
                ? 'auto-Meet is on, but Google Calendar isn’t connected — so bookings fall back to the default link above. Connect Google in Account to use fresh Meet links.'
                : 'every video booking sends the one default meeting link above.'}
            </p>
          </>
        )}
      </div>

      {/* Advanced Market Sits — the in-app reveal that re-engages existing clients */}
      {clean ? (
      <div className="bg-white rounded-xl border border-[#ededed] overflow-hidden">
        <ToggleRow
          icon={<IconTrendingUp />}
          title="Advanced Market Sits"
          description="Turn your existing clients into second appointments — a personal in-app nudge built from their own numbers. No new lead, no cold call."
          on={!!agentProfile.resetRevealEnabled}
          onToggle={() => updateField('resetRevealEnabled', !agentProfile.resetRevealEnabled)}
        />
        <div className="p-5 flex flex-col sm:flex-row gap-6">
          {/* What your client sees — a faithful slice of the real in-app
              reveal (mobile/components/ResetReveal.tsx), shown in a phone. */}
          <div className="mx-auto sm:mx-0 shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af] mb-2 text-center">What your client sees</p>
            <div className="w-[188px] bg-[#1a1a1a] rounded-[2rem] p-2 shadow-xl border-4 border-[#2a2a2a]">
              <div className="rounded-[1.5rem] overflow-hidden" style={{ background: 'linear-gradient(160deg, #0D4D4D, #072E2C)' }}>
                <div className="px-3.5 pt-4 pb-4 min-h-[362px] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-1">
                      <span className="h-1 w-4 rounded-full bg-[#3DD6C3]" />
                      <span className="h-1 w-1.5 rounded-full bg-white/25" />
                      <span className="h-1 w-1.5 rounded-full bg-white/25" />
                      <span className="h-1 w-1.5 rounded-full bg-white/25" />
                      <span className="h-1 w-1.5 rounded-full bg-white/25" />
                      <span className="h-1 w-1.5 rounded-full bg-white/25" />
                    </div>
                    <span className="text-white/40 text-[11px]">✕</span>
                  </div>
                  <p className="text-white text-[14px] font-bold leading-snug">When the market crashes, your savings don&rsquo;t.</p>
                  <svg viewBox="0 0 160 70" className="w-full mt-3" fill="none" aria-hidden="true">
                    <polyline points="6,54 38,38 74,64 110,52 154,48" stroke="rgba(255,255,255,0.34)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="6,58 38,42 74,38 110,36 154,12" stroke="#3DD6C3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="154" cy="12" r="3.5" fill="#3DD6C3" />
                    <text x="152" y="9" textAnchor="end" fill="#3DD6C3" fontSize="7">your money</text>
                    <text x="152" y="63" textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="7">the market</text>
                  </svg>
                  <p className="text-[#9FE1CB] text-[11px] mt-2 leading-snug">It holds through the dips, then keeps climbing.</p>
                  <div className="flex-1" />
                  <div className="rounded-full bg-[#3DD6C3] py-2 text-center mt-3">
                    <span className="text-[#04342C] text-[11px] font-bold">See if my family qualifies</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className="w-5 h-5 rounded-full bg-[#3DD6C3]/25 border border-[#3DD6C3] flex items-center justify-center text-[#3DD6C3] text-[9px] font-bold">{agentProfile.name?.charAt(0)?.toUpperCase() || 'A'}</div>
                    <span className="text-white/70 text-[9px]">from your agent, {agentProfile.name?.split(' ')[0] || 'your agent'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* How it works + caveat — flows beside the phone, no separate box */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[#005851] uppercase tracking-wide mb-2">How it works</p>
            <ol className="list-decimal pl-4 text-[13px] text-[#374151] leading-relaxed space-y-1.5">
              <li>Flip it on (this switch).</li>
              <li>AFL matches each client to the right path &mdash; debt &rarr; debt-free life, savings &rarr; market protection, plus three more.</li>
              <li>Steer any client to a specific path from their profile, in one tap.</li>
              <li>When they tap &ldquo;See if my family qualifies,&rdquo; it books a sit on your calendar.</li>
            </ol>
            <p className="text-[12px] text-[#9aa0a6] leading-relaxed mt-4">
              Off by default. Visuals stay concept-only &mdash; no projected dollar amounts; your licensed specialist runs the real numbers. Track booked sits on your Activity page.
            </p>
          </div>
        </div>
      </div>
      ) : (
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Advanced Market Sits</h3>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-[#000000]">
              {agentProfile.resetRevealEnabled ? 'On — your clients can see it' : 'Off'}
            </p>
            <p className="text-[13px] text-[#4b5563] mt-1 leading-relaxed">
              Your book is full of second appointments you&rsquo;re not setting. Flip this on and your existing clients get a personal nudge in their app &mdash; built from their own mortgage and savings &mdash; inviting them back for an advanced-market conversation. No new lead, no cold call: the cheapest appointment you&rsquo;ll ever book, from people who already trust you. Most agents sell a client once and move on &mdash; you keep selling the same relationship.
            </p>
          </div>
          <button
            onClick={() => updateField('resetRevealEnabled', !agentProfile.resetRevealEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
              agentProfile.resetRevealEnabled ? 'bg-[#44bbaa]' : 'bg-gray-300'
            }`}
            aria-label="Toggle Advanced Market Sits"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                agentProfile.resetRevealEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-4 bg-[#f7faf9] rounded-[5px] p-3">
          <p className="text-[11px] font-semibold text-[#005851] uppercase tracking-wide mb-1.5">How it works</p>
          <ol className="list-decimal pl-4 text-xs text-[#0D4D4D] leading-relaxed space-y-1">
            <li>Flip it on (this switch).</li>
            <li>
              AFL matches each client to the right door automatically &mdash; debt &rarr; debt-free life, savings &rarr;
              market protection, plus three more.
            </li>
            <li>Steer any client to a specific door from their profile, in one tap.</li>
            <li>When they tap &ldquo;See if I qualify,&rdquo; it books a sit on your scheduling calendar.</li>
          </ol>
        </div>
        <p className="text-[11px] text-[#9aa0a6] leading-relaxed mt-2">
          Off by default. The visuals stay concept-only &mdash; no projected dollar amounts; your licensed specialist
          presents the real numbers. Track booked sits on your Activity page.
        </p>
      </div>
      )}
      </>
      )}

      {view === 'leads' && (
      <>
      {/* Lead-mode-gated settings: Dial persistence + Lead-home videos.
          Both control surfaces that only exist when the agent can
          actually access Leads — gated by the global flag + admin-only
          mode + tier (Pro+). See web/lib/tier-gating.ts. The Dial script
          (same gate) lives alongside these on the Leads tab. Hides entirely
          otherwise; reappears the moment any axis of the gate opens (env
          flip, admin grant, tier upgrade). */}
      {canAccessLeads(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt) && <>
        {/* Dial persistence — how many attempts on a lead before the
            call queue auto-advances. Transient outcomes (no answer,
            voicemail) count toward the threshold; terminal outcomes
            (booked, do_not_call, not_interested, wrong_number,
            callback_requested) always advance regardless. */}
        <div className="bg-white rounded-[5px] border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-1">Dial persistence</h3>
          <p className="text-[11px] text-[#707070] mb-3">
            Most booked appointments come on the 2nd or 3rd dial, not the 1st &mdash; this sets how hard the queue works each lead before it moves on. Counts no-answer and voicemail; booked / wrong-number / not-interested / do-not-call / callback always advance immediately.
          </p>
          <div className="inline-flex gap-1 rounded-[8px] bg-[#eef0ee] p-1">
            {([
              { v: 1, label: 'Single', sub: '1 attempt' },
              { v: 2, label: 'Double', sub: '2 attempts' },
              { v: 3, label: 'Triple', sub: '3 attempts' },
            ] as const).map((opt, idx) => {
              const active = (agentProfile.dialPersistence ?? 1) === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => updateField('dialPersistence', opt.v)}
                  className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors text-left ${
                    active
                      ? 'bg-white text-[#005851] shadow-sm'
                      : 'text-[#707070] hover:text-[#005851]'
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className={`text-[10px] font-normal ${active ? 'text-[#005851]/70' : 'text-[#707070]'}`}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Call from your computer — links to the standalone, setup-aware
            guide (Apple Continuity / Microsoft Phone Link). Web-only, no
            app-store work; opens in a new tab so the agent keeps their
            place in the dashboard. */}
        <div className="bg-white rounded-[5px] border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-1">Call from your computer</h3>
          <p className="text-[11px] text-[#707070] mb-3">
            Dial straight from your keyboard &mdash; but the call rings out through your own phone and number, so leads see a number they recognize and more calls get answered. No juggling two devices. One quick setup; we&apos;ll show the exact steps for your device.
          </p>
          <a
            href="/call-from-computer"
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-[#005851] hover:bg-[#004440] text-white text-xs font-semibold rounded-[5px] px-3 py-2"
          >
            Set it up &rarr;
          </a>
        </div>

        {/* Lead-home videos (Chunk 3). Per-agent overrides for the
            intro / FAQ / case-study slots rendered in the mobile
            lead-home screen. */}
        <div className="bg-white rounded-[5px] border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-1">Pre-sell your leads</h3>
          <p className="text-[13px] text-[#4b5563] mb-4 leading-relaxed">
            This is selling in 2026, not 1996. Every lead you book gets a private home inside your AgentForLife app &mdash; your intro, real client stories, and a quick intake &mdash; and how they use it tells you who&rsquo;s worth your time. A lead who downloads it is going to show up; one who finishes the intake is ready to buy. So your hours go to the leads that pay, not the ghosts &mdash; an edge no one else in the industry is handing you. Leads log in with just their phone number. Turn it on with an intro video below; leave it empty and that screen stays blank.
          </p>

          {/* Intro slot */}
          <div className="mb-5 pb-5 border-b border-[#ececec]">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-[#374151]">Intro video</h4>
              {agentProfile.leadContent?.intro?.url && (
                <button
                  type="button"
                  onClick={() => deleteLeadVideo('intro')}
                  disabled={leadVideoBusy === 'intro'}
                  className="text-[11px] text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            {agentProfile.leadContent?.intro?.url ? (
              <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/40 px-3 py-2 mb-3">
                <p className="text-sm font-medium text-[#005851]">
                  {agentProfile.leadContent.intro.title || 'Uploaded'}
                </p>
                <a
                  href={agentProfile.leadContent.intro.iframeUrl || agentProfile.leadContent.intro.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#44bbaa] hover:text-[#005751] font-semibold"
                >
                  Preview →
                </a>
              </div>
            ) : (
              <p className="text-[11px] text-[#707070] mb-2">Not uploaded yet.</p>
            )}
            {/* Title input — shown to the agent so the intro card on
                the lead-home isn't stuck on the platform default
                ("Welcome — what to do next"). Empty input falls back
                to that default on upload. Pre-fills from whatever's
                saved so the agent can edit-then-replace. */}
            <label className="block text-[11px] font-semibold text-[#374151] mb-1">
              Card title <span className="text-[#707070] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={introTitleDraft || agentProfile.leadContent?.intro?.title || ''}
              onChange={(e) => setIntroTitleDraft(e.target.value)}
              placeholder="Welcome — what to do next"
              maxLength={120}
              className="w-full px-3 py-2 text-sm border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa] mb-2"
            />
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <label className="inline-block">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void uploadLeadVideo({ file: f, slot: 'intro', title: introTitle() });
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <span className={`inline-block px-3 py-2 text-xs font-semibold rounded-[5px] cursor-pointer whitespace-nowrap ${
                  leadVideoBusy === 'intro'
                    ? 'bg-gray-200 text-gray-500 cursor-default'
                    : 'bg-[#005851] hover:bg-[#004440] text-white'
                }`}>
                  {leadVideoBusy === 'intro'
                    ? `Uploading… ${leadVideoProgress.intro ?? 0}%`
                    : (agentProfile.leadContent?.intro?.url ? 'Replace saved video' : 'Upload a saved video')}
                </span>
              </label>
              <span className="text-xs text-[#707070]">or</span>
              <RecordButton
                disabled={leadVideoBusy === 'intro'}
                heading="Record your intro video"
                filenameBase="intro"
                onRecorded={(file) => void uploadLeadVideo({ file, slot: 'intro', title: introTitle() })}
              />
            </div>

            {/* App-link toggle (gated on a real intro video). Default
                ON for Pro+, but locked until the agent records an intro
                so booked leads never land on an empty prep page. When
                on, booking confirmations carry the app-download link +
                the lead's login code. */}
            {(() => {
              const hasIntro = Boolean(agentProfile.leadContent?.intro?.url?.trim());
              return (
                <div className="mt-4 pt-4 border-t border-[#ececec]">
                  <label className={`flex items-start gap-2 ${hasIntro ? 'cursor-pointer' : 'cursor-default'}`}>
                    <input
                      type="checkbox"
                      disabled={!hasIntro}
                      checked={hasIntro && agentProfile.includeAppAccessInConfirmations !== false}
                      onChange={(e) => updateField('includeAppAccessInConfirmations', e.target.checked)}
                      className="mt-0.5 disabled:opacity-40"
                    />
                    <span className="text-sm text-[#374151] leading-snug">
                      Include AgentForLife app link automatically when sending booking confirmations
                      <span className={`block text-[11px] mt-0.5 ${hasIntro ? 'text-[#707070]' : 'text-amber-700'}`}>
                        {hasIntro
                          ? 'Booked leads get a one-tap link to your branded prep page — your intro video plus a couple of quick questions — before you ever meet.'
                          : 'Record your intro video first (above) so leads see a warm welcome, not an empty page. This unlocks the moment your intro is uploaded.'}
                      </span>
                    </span>
                  </label>
                </div>
              );
            })()}
          </div>

          {/* FAQs. Now ON by default: there's a real, age-aware platform
              default (a younger-lead "do I need this now?" video) that serves
              automatically unless the agent opts out or uploads their own.
              Mirrors the manifest's resolveFaqs(). */}
          <LeadVideoList
            kind="faq"
            label="FAQ videos"
            items={agentProfile.leadContent?.faqs || []}
            busyKey={leadVideoBusy}
            addingProgress={leadVideoBusy?.startsWith('faq:') ? (leadVideoProgress[leadVideoBusy] ?? 0) : null}
            onUpload={(file, slotId, title) => uploadLeadVideo({ file, slot: 'faq', slotId, title })}
            onDelete={(slotId) => deleteLeadVideo('faq', slotId)}
            shownToLeads={agentProfile.showLeadFaqs !== false}
            onShownChange={(checked) => updateField('showLeadFaqs', checked)}
            platformDefaultNote="Younger leads automatically see our default FAQ video (“do I need this now?”). Upload your own to replace it, or uncheck to hide."
          />

          {/* Case studies */}
          <LeadVideoList
            kind="caseStudy"
            label="Case-study videos"
            items={agentProfile.leadContent?.caseStudies || []}
            busyKey={leadVideoBusy}
            addingProgress={leadVideoBusy?.startsWith('caseStudy:') ? (leadVideoProgress[leadVideoBusy] ?? 0) : null}
            onUpload={(file, slotId, title) => uploadLeadVideo({ file, slot: 'caseStudy', slotId, title })}
            onDelete={(slotId) => deleteLeadVideo('caseStudy', slotId)}
            shownToLeads={
              agentProfile.showLeadCaseStudies !== false &&
              ((agentProfile.leadContent?.caseStudies?.length ?? 0) > 0 || agentProfile.showLeadCaseStudies === true)
            }
            onShownChange={(checked) => updateField('showLeadCaseStudies', checked)}
          />

          {leadVideoError && (
            <p className="text-xs text-red-600 mt-3">{leadVideoError}</p>
          )}
          <p className="text-[10px] text-[#707070] mt-3">
            Record straight from your webcam, or upload a .mp4, .mov, or .webm (up to 1 GB). Either way it streams to Bunny.net for transcoding and smooth playback on the lead-home screen.
          </p>
        </div>
      </>}
      </>
      )}
    </div>
  );
}
