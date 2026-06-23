'use client';

import { useRef } from 'react';
import type { AgentProfile } from '../DashboardContext';

type ImageField = 'photoBase64' | 'agencyLogoBase64' | 'businessCardBase64';

interface BrandingTabProps {
  agentProfile: AgentProfile;
  updateField: <K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) => void;
  handleImageUpload: (file: File, maxSize: number, field: ImageField) => void;
}

export default function BrandingTab({ agentProfile, updateField, handleImageUpload }: BrandingTabProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      {/* Agency Name */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Agency Name</h3>
        <input
          data-onboarding-target="settings-agency-input"
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
                data-onboarding-target="settings-logo-upload"
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
              data-onboarding-target="settings-logo-upload"
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
  );
}
