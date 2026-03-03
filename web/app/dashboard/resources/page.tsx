'use client';

import { useState } from 'react';
import Link from 'next/link';
import LoomVideoModal from '../../../components/LoomVideoModal';

const FAQ_ITEMS = [
  {
    question: 'How do I add a client?',
    answer: 'Go to Clients and click "Add Client" (or import a CSV). Each client gets a unique code. Use the Share button to text them the app download link.',
    link: { href: '/dashboard/clients', label: 'Go to Clients' },
  },
  {
    question: 'How do I turn on the referral AI?',
    answer: 'Go to Settings, then the Referral & AI tab. Upload your business card and add a scheduling link first, then flip the toggle.',
    link: { href: '/dashboard/settings', label: 'Go to Settings' },
  },
  {
    question: 'How do I handle a lapse or at-risk policy?',
    answer: 'Go to Retention and paste the lapse notice. Or forward the carrier email to ai@savepolicy.agentforlife.app. We\u2019ll match it to a client and track outreach.',
    link: { href: '/dashboard/conservation', label: 'Go to Retention' },
  },
  {
    question: 'Where do referrals from my app show up?',
    answer: 'On the Referrals page. If the AI assistant is on, it texts the referral automatically and qualifies them.',
    link: { href: '/dashboard/referrals', label: 'Go to Referrals' },
  },
  {
    question: 'How do I change my photo or branding?',
    answer: 'Settings \u2192 Profile tab (photo, phone, scheduling link) and Branding tab (agency logo, business card).',
    link: { href: '/dashboard/settings', label: 'Go to Settings' },
  },
  {
    question: 'What are Rewrites?',
    answer: 'When a client\u2019s policy hits its 1-year anniversary, AI can text them to explore better rates. Managed on the Rewrites page; toggle on/off in Settings.',
    link: { href: '/dashboard/policy-reviews', label: 'Go to Rewrites' },
  },
];

export default function ResourcesPage() {
  const [showTutorialVideo, setShowTutorialVideo] = useState(false);
  const [showWorkflowVideo, setShowWorkflowVideo] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Resources</h1>
        <p className="text-[#707070] text-sm mt-1">Downloadable tools and scripts to help you succeed.</p>
      </div>

      {/* How do I...? */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0] mb-6">
        <div className="px-4 py-3 border-b border-[#d0d0d0]">
          <h2 className="text-sm font-semibold text-[#000000]">How do I&hellip;?</h2>
        </div>
        <div className="divide-y divide-[#d0d0d0]">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex items-center justify-between w-full px-4 py-3 hover:bg-[#f8f8f8] transition-colors text-left"
              >
                <span className="text-sm font-medium text-[#000000]">{item.question}</span>
                <svg
                  className={`w-4 h-4 text-[#707070] shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="px-4 pb-3">
                  <p className="text-sm text-[#707070] leading-relaxed">{item.answer}</p>
                  <Link
                    href={item.link.href}
                    className="inline-block mt-2 text-xs font-medium text-[#005851] hover:text-[#003d38] hover:underline"
                  >
                    {item.link.label} &rarr;
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Video Tutorials */}
      <div className="bg-white rounded-[5px] border border-[#d0d0d0] mb-6">
        <div className="px-4 py-3 border-b border-[#d0d0d0]">
          <h2 className="text-sm font-semibold text-[#000000]">Video Tutorials</h2>
        </div>
        <div className="divide-y divide-[#d0d0d0]">
          <button
            onClick={() => setShowTutorialVideo(true)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-[#f8f8f8] transition-colors w-full text-left"
          >
            <div className="w-10 h-10 rounded-[5px] bg-gradient-to-br from-[#005851] to-[#0A3D3D] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#45bcaa]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#000000]">Getting Started Tutorial</h3>
              <p className="text-[#707070] text-xs">Quick walkthrough to set up your dashboard</p>
            </div>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-xs flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Watch
            </span>
          </button>
          <button
            onClick={() => setShowWorkflowVideo(true)}
            className="flex items-center gap-4 px-4 py-3 hover:bg-[#f8f8f8] transition-colors w-full text-left"
          >
            <div className="w-10 h-10 rounded-[5px] bg-gradient-to-br from-[#005851] to-[#0A3D3D] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#000000]">How Does This Fit My Workflow?</h3>
              <p className="text-[#707070] text-xs">See how AgentForLife fits into your daily routine</p>
            </div>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-xs flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Watch
            </span>
          </button>
        </div>
      </div>

      {/* Downloads */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden hover:shadow-lg transition-shadow">
          <div className="bg-gradient-to-br from-[#005851] to-[#0A3D3D] p-4 flex items-center justify-center">
            <video className="w-full rounded-[4px]" controls preload="metadata" poster="">
              <source src="/app-preview.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="p-5">
            <h3 className="text-lg font-semibold text-[#000000] mb-1">App Preview</h3>
            <p className="text-[#707070] text-sm mb-4">Watch a walkthrough of the AgentForLife mobile app to see key features and how to get the most out of it.</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#707070] bg-[#f1f1f1] px-2 py-1 rounded-[5px]">Video</span>
              <a href="/app-preview.mp4" download className="flex items-center gap-2 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden hover:shadow-lg transition-shadow">
          <div className="bg-gradient-to-br from-[#005851] to-[#0A3D3D] p-6 flex items-center justify-center">
            <svg className="w-16 h-16 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="p-5">
            <h3 className="text-lg font-semibold text-[#000000] mb-1">Product Introduction Script</h3>
            <p className="text-[#707070] text-sm mb-4">A ready-to-use script to help you introduce our products to your clients with confidence.</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#707070] bg-[#f1f1f1] px-2 py-1 rounded-[5px]">PDF</span>
              <a href="/product-introduction-script.pdf" download className="flex items-center gap-2 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </div>

      <LoomVideoModal isOpen={showTutorialVideo} onClose={() => setShowTutorialVideo(false)} />
      <LoomVideoModal isOpen={showWorkflowVideo} onClose={() => setShowWorkflowVideo(false)} videoUrl="https://www.loom.com/embed/88422effb7ca4cdc8ae88646490fed00" />
    </div>
  );
}
