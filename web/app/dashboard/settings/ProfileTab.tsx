'use client';

import { useRef } from 'react';
import type { User } from 'firebase/auth';
import type { AgentProfile } from '../DashboardContext';
import StateLicensesSection from '../../../components/StateLicensesSection';
import {
  formatPhoneNumber,
  readFileAsDataUrl,
  type SaveMessage,
} from './settingsHelpers';

interface ProfileTabProps {
  agentProfile: AgentProfile;
  updateField: <K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) => void;
  user: User | null;
  setSaveMessage: (m: SaveMessage) => void;
  /** Opens the Change Email section over on the Account tab. */
  onChangeEmail: () => void;
  /** Photo-crop modal lives in the parent shell; these open it. */
  setCropImageSrc: (src: string | null) => void;
  setCrop: (c: { x: number; y: number }) => void;
  setZoom: (z: number) => void;
}

export default function ProfileTab({
  agentProfile,
  updateField,
  user,
  setSaveMessage,
  onChangeEmail,
  setCropImageSrc,
  setCrop,
  setZoom,
}: ProfileTabProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);

  return (
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
              data-onboarding-target="settings-photo-upload"
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
              data-onboarding-target="settings-name-input"
              type="text"
              value={agentProfile.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
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
                onClick={onChangeEmail}
                className="px-3 py-2 text-xs font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors whitespace-nowrap"
              >
                Change
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">Phone Number</label>
            <input
              data-onboarding-target="settings-phone-input"
              type="tel"
              value={agentProfile.phoneNumber || ''}
              onChange={(e) => updateField('phoneNumber', formatPhoneNumber(e.target.value))}
              placeholder="(555) 123-4567"
              className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
            />
          </div>
          <div className="flex items-start justify-between gap-4 pt-2 border-t border-gray-100">
            <div className="flex-1">
              <p className="text-sm font-medium text-[#000000]">Forward AFL texts to my cell</p>
              <p className="text-xs text-[#707070] mt-1">
                When a client or beneficiary texts your AFL line out of the blue (not part of a referral, conservation, or policy review the AI is already handling), we&rsquo;ll text you a copy at the number above so you can reply directly from your phone.
              </p>
            </div>
            <button
              onClick={() => updateField('forwardInboundSms', !(agentProfile.forwardInboundSms ?? true))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                (agentProfile.forwardInboundSms ?? true) ? 'bg-[#44bbaa]' : 'bg-gray-300'
              }`}
              aria-label="Toggle AFL text forwarding"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                  (agentProfile.forwardInboundSms ?? true) ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* NPN — single national producer number, read aloud for ID
          verification on calls. Feeds the {agentnpn} dial-script token. */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-1">NPN</h3>
        <p className="text-[11px] text-[#707070] mb-3">
          Your National Producer Number. Auto-fills your dial script ({'{agentnpn}'}) so leads can verify you at the Dept. of Insurance.
        </p>
        <input
          type="text"
          inputMode="numeric"
          value={agentProfile.npn || ''}
          onChange={(e) => updateField('npn', e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 20775142"
          className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
        />
      </div>

      {/* State Licenses (Chunk 4d) — multi-state PDFs that the
          booking-confirmation flow attaches based on lead.state. */}
      <StateLicensesSection
        user={user}
        licenses={agentProfile.licenses}
        onChange={(next) => updateField('licenses', next)}
      />
    </div>
  );
}
