'use client';

import { useRef, useEffect, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import type { AgentProfile } from '../DashboardContext';
import { DEFAULT_DIAL_SCRIPT, SCRIPT_TOKEN_HINTS, SCRIPT_CONDITION_HINTS } from '../../../lib/dial-script';
import { DEFAULT_INTRO_TEXT, INTRO_TOKEN_HINTS, INTRO_CONDITION_HINTS } from '../../../lib/lead-intro-text';
import { canAccessLeads } from '../../../lib/tier-gating';

interface MessagesTabProps {
  agentProfile: AgentProfile;
  updateField: <K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) => void;
  user: User | null;
  /** 'dialer' = lead outreach (intro text + dial script) for the Leads
      tab; 'messages' = templates you send + the automations. */
  view: 'messages' | 'dialer';
}

function InsertChips({
  tokens,
  onInsert,
  variant = 'teal',
  label = 'Tap to insert:',
}: {
  tokens: Array<{ token: string; description?: string }>;
  onInsert: (token: string) => void;
  variant?: 'teal' | 'amber';
  label?: string;
}) {
  const styles =
    variant === 'amber'
      ? 'bg-[#fef8ec] text-[#92400e] hover:border-[#fcd34d] hover:bg-[#fdf1d8]'
      : 'bg-[#eef6f4] text-[#005851] hover:border-[#45bcaa] hover:bg-[#daf3f0]';
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-[11px] text-[#707070] mr-0.5">{label}</span>
      {tokens.map((t) => (
        <button
          key={t.token}
          type="button"
          title={t.description}
          onClick={() => onInsert(t.token)}
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-medium border border-transparent transition-colors cursor-pointer ${styles}`}
        >
          {t.token}
        </button>
      ))}
    </div>
  );
}

export default function MessagesTab({ agentProfile, updateField, user, view }: MessagesTabProps) {
  const introRef = useRef<HTMLTextAreaElement>(null);
  const dialRef = useRef<HTMLTextAreaElement>(null);
  const referralRef = useRef<HTMLTextAreaElement>(null);
  const welcomeRef = useRef<HTMLTextAreaElement>(null);
  const annivRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<{ el: HTMLTextAreaElement; pos: number } | null>(null);

  // After a chip inserts a token and the parent re-renders with the new
  // value, drop the caret right after the inserted token so the agent can
  // keep typing where they left off.
  useEffect(() => {
    const p = pendingCaret.current;
    if (p) {
      p.el.focus();
      p.el.setSelectionRange(p.pos, p.pos);
      pendingCaret.current = null;
    }
  });

  function insertToken<K extends keyof AgentProfile>(
    ref: RefObject<HTMLTextAreaElement | null>,
    field: K,
    current: string,
    token: string,
  ) {
    const el = ref.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (el) pendingCaret.current = { el, pos: start + token.length };
    updateField(field, next as AgentProfile[K]);
  }

  return (
    <div className="space-y-5">
      {view === 'dialer' && (
      <>
      <div className="pt-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#005851]">Lead outreach</h2>
        <p className="text-xs text-[#707070] mt-0.5">Texts and scripts for working new leads.</p>
      </div>

      {/* Lead Intro Text */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Lead Intro Text</h3>
        <div>
          <label className="block text-sm font-medium text-[#000000] mb-1.5">Message Template</label>
          <textarea
            ref={introRef}
            value={agentProfile.introTextTemplate || ''}
            onChange={(e) => updateField('introTextTemplate', e.target.value)}
            placeholder={DEFAULT_INTRO_TEXT}
            rows={5}
            className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-y"
          />
          <p className="text-xs text-[#707070] mt-1.5">
            The optional teed-up text you can fire off to a new lead before your first call &mdash; it sends from your own phone. Leave blank to use the default shown above.
          </p>
          <InsertChips
            tokens={INTRO_TOKEN_HINTS}
            onInsert={(t) => insertToken(introRef, 'introTextTemplate', agentProfile.introTextTemplate || '', t)}
          />
          {INTRO_CONDITION_HINTS.length > 0 && (
            <InsertChips
              tokens={INTRO_CONDITION_HINTS}
              variant="amber"
              label="Auto-switching blocks:"
              onInsert={(t) => insertToken(introRef, 'introTextTemplate', agentProfile.introTextTemplate || '', t)}
            />
          )}
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
            ref={dialRef}
            value={agentProfile.dialScript ?? ''}
            onChange={(e) => updateField('dialScript', e.target.value)}
            placeholder={DEFAULT_DIAL_SCRIPT}
            rows={10}
            className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed font-mono focus:outline-none focus:border-[#45bcaa]"
          />
          <p className="text-[11px] text-[#707070] mt-2">
            Leave empty to use the default. Tokens are case-insensitive.
          </p>
          <InsertChips
            tokens={SCRIPT_TOKEN_HINTS}
            onInsert={(t) => insertToken(dialRef, 'dialScript', agentProfile.dialScript ?? '', t)}
          />
          <InsertChips
            tokens={SCRIPT_CONDITION_HINTS}
            variant="amber"
            label="Auto-switching blocks:"
            onInsert={(t) => insertToken(dialRef, 'dialScript', agentProfile.dialScript ?? '', t)}
          />
        </div>
      )}

      </>
      )}

      {view === 'messages' && (
      <>
      <div className="pt-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#005851]">Messages you send</h2>
        <p className="text-xs text-[#707070] mt-0.5">Templates clients and referrals receive from you.</p>
      </div>

      {/* Referral Message */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Referral Message Template</h3>
        <textarea
          ref={referralRef}
          value={agentProfile.referralMessage || ''}
          onChange={(e) => updateField('referralMessage', e.target.value)}
          placeholder="Hey [referral], wanted to connect you with my insurance agent [agent]. They just got my family's finances protected and I thought they might be able to help you too. They'll probably reach out — super easy to talk to."
          rows={4}
          className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-none"
        />
        <InsertChips
          tokens={[
            { token: '[referral]', description: 'The person being referred' },
            { token: '[agent]', description: 'Your name' },
            { token: '[client]', description: 'The client sending it' },
          ]}
          onInsert={(t) => insertToken(referralRef, 'referralMessage', agentProfile.referralMessage || '', t)}
        />
        <p className="text-xs text-[#707070] mt-1.5">Unless you change it, this is the default message clients send when they refer someone. The placeholders are replaced with real names when sent.</p>
      </div>

      {/* Client Welcome Text */}
      <div className="bg-white rounded-[5px] border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4">Client Welcome Text</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1.5">Message Template</label>
            <textarea
              ref={welcomeRef}
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
            <InsertChips
              tokens={[
                { token: '{{firstName}}', description: 'Client first name' },
                { token: '{{code}}', description: 'Their app login code' },
                { token: '{{agentName}}', description: 'Your name' },
              ]}
              onInsert={(t) => insertToken(welcomeRef, 'welcomeSmsTemplate', agentProfile.welcomeSmsTemplate || '', t)}
            />
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
                ref={annivRef}
                value={agentProfile.anniversaryMessageCustom || ''}
                onChange={(e) => updateField('anniversaryMessageCustom', e.target.value)}
                placeholder={`Hi {{firstName}}, your {{policyLabel}} anniversary is coming up. I'd love to check in and make sure everything still fits. — {{agentName}}`}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-[5px] text-sm text-[#000000] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#44bbaa] focus:border-transparent resize-y"
              />
              <InsertChips
                tokens={[
                  { token: '{{firstName}}', description: 'Client first name' },
                  { token: '{{policyLabel}}', description: 'Policy description' },
                  { token: '{{agentName}}', description: 'Your name' },
                  { token: '{{schedulingNote}}', description: 'Scheduling link' },
                ]}
                onInsert={(t) => insertToken(annivRef, 'anniversaryMessageCustom', agentProfile.anniversaryMessageCustom || '', t)}
              />
              {agentProfile.anniversaryMessageStyle === 'custom' && !agentProfile.anniversaryMessageCustom?.trim() && (
                <p className="text-xs text-amber-600 mt-1">Please enter a message template before saving.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="pt-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#005851]">Runs automatically</h2>
        <p className="text-xs text-[#707070] mt-0.5">Things AFL does on its own — switch each on or off.</p>
      </div>

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
      </>
      )}
    </div>
  );
}
