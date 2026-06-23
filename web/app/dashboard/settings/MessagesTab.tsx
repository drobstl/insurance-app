'use client';

import type { User } from 'firebase/auth';
import type { AgentProfile } from '../DashboardContext';
import { DEFAULT_DIAL_SCRIPT, SCRIPT_TOKEN_HINTS, SCRIPT_CONDITION_HINTS } from '../../../lib/dial-script';
import { DEFAULT_INTRO_TEXT, INTRO_TOKEN_HINTS, INTRO_CONDITION_HINTS } from '../../../lib/lead-intro-text';
import { canAccessLeads } from '../../../lib/tier-gating';

interface MessagesTabProps {
  agentProfile: AgentProfile;
  updateField: <K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) => void;
  user: User | null;
}

export default function MessagesTab({ agentProfile, updateField, user }: MessagesTabProps) {
  return (
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

      {/* Lead Intro Text */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Lead Intro Text</h3>
        <div>
          <label className="block text-sm font-medium text-[#000000] mb-1.5">Message Template</label>
          <textarea
            value={agentProfile.introTextTemplate || ''}
            onChange={(e) => updateField('introTextTemplate', e.target.value)}
            placeholder={DEFAULT_INTRO_TEXT}
            rows={5}
            className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-y"
          />
          <p className="text-xs text-[#707070] mt-1.5">
            The optional teed-up text you can fire off to a new lead before your first call &mdash; it sends from your own phone. Leave blank to use the default shown above.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {INTRO_TOKEN_HINTS.map((h) => (
              <span
                key={h.token}
                title={h.description}
                className="inline-flex items-center px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851] text-xs font-medium"
              >
                {h.token}
              </span>
            ))}
          </div>
          {INTRO_CONDITION_HINTS.map((h) => (
            <p key={h.token} className="text-[11px] text-[#707070] mt-2 leading-snug">
              <span className="font-mono text-[#005851]">{h.token}</span> &mdash; {h.description}
            </p>
          ))}
        </div>
      </div>

      {/* Dial script — shown as an overlay on the lead detail page
          during a live call. Supports tokens like {agentfirstname},
          {leadname}, {leadage}, {tobaccouse}, {mortgageamount}.
          Lead-mode gated (Pro+ / admin) — see web/lib/tier-gating.ts.
          The id + scroll-mt-24 back the /dashboard/settings#dial-script
          deep link from the live-call dial-script popup. */}
      {canAccessLeads(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt) && (
        <div id="dial-script" className="scroll-mt-24 bg-white rounded-[5px] border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-1">Dial script</h3>
          <p className="text-[11px] text-[#707070] mb-3">
            Shown on the lead page while you&apos;re on a call. Personalized per lead via tokens.
          </p>
          <textarea
            value={agentProfile.dialScript ?? ''}
            onChange={(e) => updateField('dialScript', e.target.value)}
            placeholder={DEFAULT_DIAL_SCRIPT}
            rows={10}
            className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed font-mono focus:outline-none focus:border-[#45bcaa]"
          />
          <p className="text-[11px] text-[#707070] mt-2">
            Leave empty to use the default. Tokens are case-insensitive.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCRIPT_TOKEN_HINTS.map((t) => (
              <span
                key={t.token}
                title={t.description}
                className="inline-block px-2 py-0.5 text-[10px] font-mono rounded bg-[#daf3f0]/60 text-[#005851] border border-[#45bcaa]/30 cursor-help"
              >
                {t.token}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[#707070] mt-3 mb-1">
            Auto-switching blocks — show/hide based on the lead and your settings:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SCRIPT_CONDITION_HINTS.map((t) => (
              <span
                key={t.token}
                title={t.description}
                className="inline-block px-2 py-0.5 text-[10px] font-mono rounded bg-[#FEF3C7]/70 text-[#92400E] border border-[#FCD34D]/60 cursor-help"
              >
                {t.token}
              </span>
            ))}
          </div>
        </div>
      )}

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
              placeholder={"Hey {{firstName}}! {{agentName}} here — let's get you set up (takes a minute):\n\n1. Download the app: https://agentforlife.app/app\n2. Open it and enter your code: {{code}}\n3. Tap Allow on notifications so I can reach you with important updates\n4. Tap Activate, then Send — I'll text you right back\n\nThat's it! Your app's already personalized for you. 👍"}
              rows={8}
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
  );
}
