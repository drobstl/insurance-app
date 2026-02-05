'use client';

import Link from 'next/link';
import { useState, useRef } from 'react';

export default function TestLandingPage() {
  const [bookSize, setBookSize] = useState(250000);
  const [bookSizeInput, setBookSizeInput] = useState('250,000');
  const [retentionRate, setRetentionRate] = useState(70);
  const [referralRate, setReferralRate] = useState(5);
  const [rewriteRate, setRewriteRate] = useState(10);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Calculator logic
  const lostRevenue = bookSize * (1 - retentionRate / 100);
  
  // Average policy value assumption ($1,200/year)
  const avgPolicyValue = 1200;
  const totalClients = Math.round(bookSize / avgPolicyValue);
  
  // Missed referrals: industry average is 20-30% with good systems, most agents get 5%
  const potentialReferralRate = 25;
  const missedReferrals = Math.round(totalClients * ((potentialReferralRate - referralRate) / 100));
  const missedReferralRevenue = missedReferrals * avgPolicyValue;
  
  // Missed rewrites: industry average with good follow-up is 30-40%, most agents get 10%
  const potentialRewriteRate = 35;
  const missedRewrites = Math.round(totalClients * ((potentialRewriteRate - rewriteRate) / 100));
  const missedRewriteRevenue = missedRewrites * avgPolicyValue;
  
  // Total missed opportunity
  const totalBleed = lostRevenue + missedReferralRevenue + missedRewriteRevenue;

  // Format number with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  // Handle book size input change
  const handleBookSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const numValue = parseInt(rawValue) || 0;
    setBookSize(numValue);
    setBookSizeInput(numValue > 0 ? formatNumber(numValue) : '');
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqItems = [
    {
      question: "How can insurance agents improve client retention?",
      answer: "Focus on three things: consistent touchpoints, easy access to information, and personalized service. Agent For Life handles all three by putting you directly in your client's phone with a branded app. They can view policies, contact you instantly, and receive timely updates—making you irreplaceable instead of forgettable."
    },
    {
      question: "How do I get more referrals from existing clients?",
      answer: "Make referring you effortless. Agent For Life includes One-Tap Referrals—clients can refer you to friends and family with a single tap, complete with your business card attached. They pick a contact, and a pre-written message with your info is ready to send. You're automatically included in the text thread so you can follow up immediately."
    },
    {
      question: "How do insurance agents generate rewrites and keep clients updating coverage?",
      answer: "Stay accessible when life changes happen. Marriages, new homes, job changes—these are rewrite opportunities, not lapses. Agent For Life keeps you top-of-mind so clients call YOU when they need to update coverage, not a competitor or the carrier. Rewrites become natural conversations instead of cold outreach."
    },
    {
      question: "How do I stop insurance chargebacks and policy cancellations?",
      answer: "Chargebacks happen when relationships are weak. Agent For Life strengthens the agent-client bond by keeping you accessible and visible. When clients feel taken care of and can reach you easily, they don't shop around or let policies lapse. Many agents see chargeback reductions within the first 90 days."
    },
    {
      question: "Does Agent For Life replace my current lead generation?",
      answer: "No—it multiplies the value of every lead you already buy or generate. Instead of getting one sale and moving on, you turn each client into a retention win, a referral source, AND a rewrite opportunity. Think of it as turning every lead into 3x the revenue: initial sale + referrals + future rewrites."
    },
    {
      question: "What exactly is Agent For Life?",
      answer: "It's a white-label mobile app system. You get a web dashboard where you manage clients and policies. Each client gets a unique code to download YOUR branded app (with your photo, name, and contact info). The app shows their policies and gives them one-tap access to you. You own the relationship."
    },
    {
      question: "What carriers does it work with?",
      answer: "All of them. Agent For Life doesn't integrate with carriers—it's carrier-agnostic. You manually add policy details for your clients in the dashboard. This works for independent agents regardless of which carriers you're appointed with."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0D4D4D] shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 md:h-20">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-[50px] h-[28px] sm:w-[70px] sm:h-[40px] md:w-[80px] md:h-[45px] object-contain flex-shrink-0" />
              <span className="text-base sm:text-lg md:text-xl text-white brand-title truncate">AgentForLife</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Link href="/login" className="text-white/80 hover:text-white transition-colors text-sm sm:text-base">
                Login
              </Link>
              <Link href="/signup" className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm sm:text-base font-semibold rounded-full transition-colors whitespace-nowrap">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ============================================ */}
        {/* 1. HERO SECTION - The Power Punch */}
        {/* ============================================ */}
        <section className="relative bg-[#0D4D4D] pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-20"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15"></div>
          </div>
          
          {/* Grid Pattern Overlay */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}></div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0D4D4D] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D4D4D]"></span>
              </span>
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">The Insurance Revenue Multiplier</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-8">
              <span className="text-[#fdcc02]">Kill Chargebacks</span>.<br />
              <span className="text-[#3DD6C3]">Explode Your Referrals</span>.<br />
              Triple Your Income from the Leads You Already Won.
            </h1>
            
            <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
              Stop the "one-and-done" cycle. Agent For Life <span className="text-white font-semibold">fortifies your client relationships</span> to automate retention, eliminate chargebacks, and superpower your book of business for just <span className="text-[#fdcc02] font-bold">$10 a month</span>.
            </p>
            
            {/* Primary CTA */}
            <Link href="/signup" className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105 border-2 border-[#fdcc02] hover:border-white/20">
              Get the System — $10/mo
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            
            <p className="text-white/40 mt-4 text-sm">No contracts • Cancel anytime • Results in days</p>
          </div>

          {/* Wave Divider */}
          <div className="absolute -bottom-1 left-0 right-0">
            <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-[60px] md:h-[120px]">
              <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 40C840 50 960 70 1080 75C1200 80 1320 70 1380 65L1440 60V120H0Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ============================================ */}
        {/* 2. THE "EFFICIENCY GAP" - Truth Bomb Section */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white -mt-1">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-4xl md:text-5xl font-extrabold text-[#0D4D4D] mb-8">
                Stop Running in Place.
              </h2>
              <div className="bg-[#F8F9FA] rounded-3xl p-8 md:p-12 border-l-4 border-[#fdcc02] shadow-xl">
                <p className="text-xl md:text-2xl text-[#2D3748] leading-relaxed">
                  "If you're only getting <span className="bg-[#fdcc02] text-[#0D4D4D] px-2 py-1 rounded font-bold">one sale per lead</span>, you're not building a business—you're just <span className="text-red-500 font-semibold">chasing a paycheck</span>. You could triple your lead spend to hit your goals, costing you <span className="font-bold">thousands more per week</span>. Or, you can superpower your existing book for the price of <span className="text-[#0D4D4D] font-bold">two cups of coffee</span>."
                </p>
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <p className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D]">
                    There are <span className="text-[#3DD6C3]">three sales</span> in every lead you buy.
                  </p>
                  <p className="text-xl text-[#6B7280] mt-2 font-medium">How many are you getting now?</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 3. THE INTERACTIVE CHURN CALCULATOR */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-500 rounded-full blur-[150px]"></div>
          </div>

          <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-full mb-6">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-red-400 font-semibold text-sm uppercase tracking-wide">The Leaky Bucket</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                How Much Are You <span className="text-red-400">Bleeding</span> Every Year?
              </h2>
              <p className="text-lg text-white/70">
                Calculate what weak retention is costing you right now.
              </p>
            </div>

            {/* Calculator Card */}
            <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl">
              {/* Annual Book Size Input */}
              <div className="mb-8">
                <label htmlFor="bookSize" className="block text-lg font-bold text-[#0D4D4D] mb-3">
                  Annual Book Size
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-xl font-medium">$</span>
                  <input
                    type="text"
                    id="bookSize"
                    value={bookSizeInput}
                    onChange={handleBookSizeChange}
                    placeholder="250,000"
                    className="w-full pl-10 pr-4 py-4 text-2xl font-bold text-[#0D4D4D] bg-[#F8F9FA] border-2 border-gray-200 rounded-xl focus:border-[#3DD6C3] focus:outline-none focus:ring-4 focus:ring-[#3DD6C3]/20 transition-all"
                  />
                </div>
              </div>

              {/* Retention Rate Slider */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label htmlFor="retentionRate" className="text-base font-bold text-[#0D4D4D]">
                    Current Retention Rate
                  </label>
                  <span className="text-xl font-extrabold text-[#3DD6C3]">{retentionRate}%</span>
                </div>
                <input
                  type="range"
                  id="retentionRate"
                  min="40"
                  max="95"
                  value={retentionRate}
                  onChange={(e) => setRetentionRate(parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, #3DD6C3 0%, #3DD6C3 ${((retentionRate - 40) / 55) * 100}%, #E5E7EB ${((retentionRate - 40) / 55) * 100}%, #E5E7EB 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-[#6B7280] mt-1">
                  <span>40%</span>
                  <span>95%</span>
                </div>
              </div>

              {/* Referral Rate Slider */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label htmlFor="referralRate" className="text-base font-bold text-[#0D4D4D]">
                    Current Referral Rate
                  </label>
                  <span className="text-xl font-extrabold text-[#fdcc02]">{referralRate}%</span>
                </div>
                <input
                  type="range"
                  id="referralRate"
                  min="0"
                  max="25"
                  value={referralRate}
                  onChange={(e) => setReferralRate(parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, #fdcc02 0%, #fdcc02 ${(referralRate / 25) * 100}%, #E5E7EB ${(referralRate / 25) * 100}%, #E5E7EB 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-[#6B7280] mt-1">
                  <span>0%</span>
                  <span>25% (possible)</span>
                </div>
              </div>

              {/* Rewrite Rate Slider */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label htmlFor="rewriteRate" className="text-base font-bold text-[#0D4D4D]">
                    Current Rewrite Rate
                  </label>
                  <span className="text-xl font-extrabold text-[#0D4D4D]">{rewriteRate}%</span>
                </div>
                <input
                  type="range"
                  id="rewriteRate"
                  min="0"
                  max="35"
                  value={rewriteRate}
                  onChange={(e) => setRewriteRate(parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, #0D4D4D 0%, #0D4D4D ${(rewriteRate / 35) * 100}%, #E5E7EB ${(rewriteRate / 35) * 100}%, #E5E7EB 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-[#6B7280] mt-1">
                  <span>0%</span>
                  <span>35% (possible)</span>
                </div>
              </div>

              {/* Results Display */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-6 md:p-8 border-2 border-red-200 mb-8">
                {bookSize > 0 ? (
                  <>
                    <p className="text-center text-[#6B7280] mb-2 font-medium">You're leaving on the table</p>
                    <p className="text-center">
                      <span className="text-5xl md:text-6xl font-black text-red-500">
                        ${formatNumber(totalBleed)}
                      </span>
                    </p>
                    <p className="text-center text-red-400 font-semibold mt-2">/year in missed opportunity</p>
                    
                    {/* Breakdown */}
                    <div className="mt-6 pt-6 border-t border-red-200 space-y-3 text-sm">
                      <div className="flex justify-between items-center py-2 border-b border-red-100">
                        <span className="text-[#6B7280]">Lost to churn ({100 - retentionRate}%)</span>
                        <span className="font-semibold text-red-500">-${formatNumber(lostRevenue)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-red-100">
                        <span className="text-[#6B7280]">Missed referrals ({missedReferrals} clients)</span>
                        <span className="font-semibold text-[#fdcc02]">-${formatNumber(missedReferralRevenue)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-[#6B7280]">Missed rewrites ({missedRewrites} opportunities)</span>
                        <span className="font-semibold text-[#0D4D4D]">-${formatNumber(missedRewriteRevenue)}</span>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-4 bg-[#D1FAE5] rounded-lg p-4 border border-[#3DD6C3]">
                      <p className="text-center text-[#0D4D4D] text-sm">
                        <span className="font-bold text-[#3DD6C3]">Agent For Life</span> helps you capture this revenue with <span className="font-bold">one-tap referrals</span>, automated follow-ups, and staying top-of-mind.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[#6B7280] py-4">
                    Enter your annual book size to see your losses.
                  </p>
                )}
              </div>

              {/* CTA Button */}
              <Link 
                href="/signup" 
                className="block w-full py-5 bg-red-500 hover:bg-red-600 text-white text-xl font-bold rounded-xl transition-all text-center shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-[1.02] active:scale-[0.98]"
              >
                Stop the Bleeding →
              </Link>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 4. THE "BE MORE" BRANDING SECTION */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Text Content */}
              <div>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-8">
                  Don't Be a Number in Their Contacts.<br />
                  <span className="text-[#3DD6C3]">Be Their Agent For Life.</span>
                </h2>
                <div className="space-y-6 text-lg text-[#2D3748]">
                  <p>
                    You make a great connection and protect a client. Then what? A week later, you're just another name they can't remember. A phone number buried under 500 other contacts.
                  </p>
                  <p className="text-2xl font-bold text-[#0D4D4D] py-4 border-l-4 border-[#3DD6C3] pl-6 bg-[#F8F9FA] rounded-r-xl">
                    BE MORE.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[#3DD6C3] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span>Be an <strong>easy information hub</strong> on their phone.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[#3DD6C3] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span>Be the <strong>first call</strong> when they get cold feet.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[#3DD6C3] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span>Be the person they <strong>refer with a push of a button</strong>.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Visual Comparison */}
              <div className="relative">
                <div className="grid grid-cols-2 gap-6">
                  {/* Boring Contact */}
                  <div className="relative pt-2">
                    <div className="absolute -top-1 left-4 px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full z-10">FORGETTABLE</div>
                    <div className="bg-gray-100 rounded-2xl p-6 border-2 border-gray-200 opacity-60 mt-2">
                      <div className="w-16 h-16 bg-gray-300 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                      <p className="text-center text-gray-400 font-medium">John Smith</p>
                      <p className="text-center text-gray-300 text-sm">Insurance Agent</p>
                      <p className="text-center text-gray-300 text-xs mt-2">555-0123</p>
                    </div>
                  </div>

                  {/* Your Branded App */}
                  <div className="relative">
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-[#3DD6C3] text-white text-xs font-bold rounded-full z-10">UNFORGETTABLE</div>
                    <div className="bg-[#0D4D4D] rounded-2xl p-6 border-2 border-[#3DD6C3] shadow-xl shadow-[#3DD6C3]/20 transform hover:scale-105 transition-transform">
                      <div className="w-16 h-16 bg-[#3DD6C3] rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                        <img src="/logo.png" alt="Your App" className="w-12 h-8 object-contain" />
                      </div>
                      <p className="text-center text-white font-bold">Your Name</p>
                      <p className="text-center text-[#3DD6C3] text-sm font-medium">Agent For Life</p>
                      <div className="mt-4 space-y-2">
                        <div className="bg-white/10 rounded-lg py-2 px-3 text-white/80 text-xs text-center">📞 Call</div>
                        <div className="bg-[#3DD6C3]/20 rounded-lg py-2 px-3 text-[#3DD6C3] text-xs text-center font-semibold">🔗 Refer</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 5. THE COMPARISON - Hamster Wheel vs Asset */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                The Hamster Wheel vs. <span className="text-[#3DD6C3]">The Asset</span>
              </h2>
              <p className="text-xl text-[#6B7280]">
                Which business are you building?
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
              {/* The Old Way */}
              <div className="relative bg-white rounded-3xl p-8 md:p-10 border-2 border-red-200 shadow-lg overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-50/80 to-transparent pointer-events-none"></div>
                <div className="relative">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-extrabold text-red-600">The Old Way</h3>
                  </div>
                  <ul className="space-y-5">
                    {[
                      '1 sale per lead = 25% of potential income',
                      'Weak relationships = constant price shopping',
                      'Fighting chargebacks every month',
                      '"One-and-done" sales that don\'t compound',
                      'Running just to stay in place'
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-[#2D3748] text-lg">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* The Agent For Life Way */}
              <div className="relative bg-white rounded-3xl p-8 md:p-10 border-2 border-[#3DD6C3] shadow-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#D1FAE5]/50 to-transparent pointer-events-none"></div>
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-[#3DD6C3] text-white text-xs font-bold rounded-full">$10/MONTH</span>
                </div>
                <div className="relative">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-14 h-14 bg-[#D1FAE5] rounded-2xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-extrabold text-[#0D4D4D]">The Agent For Life Way</h3>
                  </div>
                  <ul className="space-y-5">
                    {[
                      { text: '$10/month to leverage your existing book', highlight: false },
                      { text: '3 sales per lead (client + referrals + rewrites)', highlight: false },
                      { text: 'Fortified "un-shopable" relationships', highlight: false },
                      { text: 'One-tap referrals with your business card', highlight: true },
                      { text: 'Growing your book instead of chasing it', highlight: false }
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <svg className={`w-6 h-6 flex-shrink-0 mt-0.5 ${item.highlight ? 'text-[#fdcc02]' : 'text-[#3DD6C3]'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-[#2D3748] text-lg font-medium ${item.highlight ? 'text-[#0D4D4D] font-bold' : ''}`}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 6. THE "BIG THREE" FEATURES */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                The <span className="text-[#3DD6C3]">Triple Threat</span> System
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                Three ways to multiply every lead you've ever closed.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Retention */}
              <div className="group bg-[#F8F9FA] rounded-3xl p-8 border-2 border-transparent hover:border-[#3DD6C3] transition-all hover:shadow-xl">
                <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-4">Explode Retention</h3>
                <p className="text-[#6B7280] text-lg leading-relaxed">
                  Build a <span className="text-[#0D4D4D] font-semibold">wall around your book</span>. Identify at-risk clients and kill chargebacks before they hit your bank account. When you're in their pocket, competitors can't touch you.
                </p>
              </div>

              {/* Referrals */}
              <div className="group bg-[#F8F9FA] rounded-3xl p-8 border-2 border-[#fdcc02] hover:shadow-xl transition-all relative overflow-hidden">
                <div className="absolute top-4 right-4">
                  <span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">NOW LIVE</span>
                </div>
                <div className="w-16 h-16 bg-[#fdcc02] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-4">Multiply Referrals</h3>
                <p className="text-[#6B7280] text-lg leading-relaxed">
                  Turn every policy into a <span className="text-[#0D4D4D] font-semibold">referral machine</span>. One-tap referrals replace weak, shared leads with warm prospects from your own network. Stop cold calling strangers.
                </p>
              </div>

              {/* Rewrites */}
              <div className="group bg-[#F8F9FA] rounded-3xl p-8 border-2 border-transparent hover:border-[#3DD6C3] transition-all hover:shadow-xl relative">
                <div className="absolute top-4 right-4">
                  <span className="px-2 py-1 bg-[#0D4D4D] text-white text-xs font-bold rounded-full">COMING SOON</span>
                </div>
                <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-4">Automate Rewrites</h3>
                <p className="text-[#6B7280] text-lg leading-relaxed">
                  Be there a year later with <span className="text-[#0D4D4D] font-semibold">push notifications</span> the moment you've found a better program for them. Life changes become opportunities, not lapses.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* YOUR APP + HOW IT WORKS - Combined Section */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                Your App. Your Brand.{' '}
                <span className="text-[#3DD6C3]">Their Phone.</span>
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                Up and running in <span className="text-[#fdcc02] font-semibold">10 minutes</span>. Every client gets YOUR app—with your photo, your contact info, and their policies at their fingertips.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Phone Mockup with Video */}
              <div className="relative flex justify-center order-2 lg:order-1">
                <div className="relative">
                  {/* Phone Frame */}
                  <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                    <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
                      {/* Video */}
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        autoPlay={true}
                        muted={true}
                        loop={true}
                        playsInline={true}
                        poster="/app-preview-poster.jpeg"
                      >
                        <source src="/app-preview.webm" type="video/webm" />
                        <source src="/app-preview.mp4" type="video/mp4" />
                      </video>
                    </div>
                  </div>
                  {/* Floating Elements */}
                  <div className="absolute -top-4 -right-8 bg-white rounded-xl p-3 shadow-xl hidden sm:block">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-gray-700">Policy Active</span>
                    </div>
                  </div>
                  <div className="absolute -bottom-4 -left-8 bg-white rounded-xl p-3 shadow-xl hidden sm:block">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-[#0D4D4D] rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-gray-700">Bank-Level Security</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* How It Works Steps */}
              <div className="order-1 lg:order-2">
                <div className="space-y-8">
                  {/* Step 1 */}
                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">1</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Sign Up & Brand Your App</h3>
                      <p className="text-white/70">Add your photo, contact info, and agency branding. Takes 5 minutes.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">2</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Add Your Clients</h3>
                      <p className="text-white/70">Import your book. Each client gets a unique code to access their policies.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">3</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Share the App</h3>
                      <p className="text-white/70">Hand off the code. They download YOUR branded app from the App Store.</p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#fdcc02] rounded-2xl flex items-center justify-center text-2xl font-bold text-[#0D4D4D] shadow-lg shadow-[#fdcc02]/30">4</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Watch the Multiplier Effect</h3>
                      <p className="text-white/70">They call YOU first. Referrals roll in. Life changes trigger rewrites, not lapses. <span className="text-[#fdcc02] font-semibold">Chargebacks stop.</span></p>
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full transition-all shadow-lg shadow-[#fdcc02]/30">
                    Get the System
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ROI COMPARISON - 10x Return */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                The Math is <span className="text-[#3DD6C3]">Undeniable</span>
              </h2>
              <p className="text-xl text-[#6B7280]">
                One saved policy. One referral. That's all it takes.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 items-center">
              {/* Cost of Lost Policy */}
              <div className="bg-red-50 rounded-3xl p-8 border-2 border-red-200 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-600 font-semibold text-sm uppercase tracking-wide mb-2">1 Canceled Policy</p>
                <p className="text-4xl md:text-5xl font-black text-red-500 mb-2">$1,200</p>
                <p className="text-red-400 text-sm">Average annual policy value lost</p>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center justify-center py-8">
                <div className="text-4xl font-black text-[#6B7280]">vs</div>
              </div>

              {/* Cost of Agent For Life */}
              <div className="bg-[#D1FAE5] rounded-3xl p-8 border-2 border-[#3DD6C3] text-center">
                <div className="w-16 h-16 bg-[#3DD6C3] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-[#0D4D4D] font-semibold text-sm uppercase tracking-wide mb-2">Agent For Life</p>
                <p className="text-4xl md:text-5xl font-black text-[#0D4D4D] mb-2">$120</p>
                <p className="text-[#3DD6C3] text-sm font-medium">$10/month × 12 months</p>
              </div>
            </div>

            {/* 10x ROI Callout */}
            <div className="mt-12 bg-[#0D4D4D] rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-1/4 w-64 h-64 bg-[#3DD6C3] rounded-full blur-[100px]"></div>
                <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#fdcc02] rounded-full blur-[100px]"></div>
              </div>
              
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                  <svg className="w-5 h-5 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Instant ROI</span>
                </div>
                
                <h3 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4">
                  Save <span className="text-[#3DD6C3]">ONE</span> Policy = <span className="text-[#fdcc02]">10x Return</span>
                </h3>
                
                <p className="text-xl text-white/80 max-w-2xl mx-auto mb-6">
                  One saved client or one referral pays for an <span className="text-white font-semibold">entire year</span> of Agent For Life—<span className="text-[#fdcc02] font-semibold">and then some</span>. Everything after that is pure profit.
                </p>

                <div className="flex flex-wrap justify-center gap-6 text-white/70">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 saved policy = 10x ROI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 referral = 10x ROI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 rewrite = 10x ROI</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* PRICING CTA */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] mb-6">
              Stop Renting Leads.<br />
              <span className="text-[#3DD6C3]">Start Owning Relationships.</span>
            </h2>
            <p className="text-xl text-[#6B7280] mb-10 max-w-2xl mx-auto">
              For less than the cost of <span className="font-semibold">two cups of coffee</span>, turn every client into a retention win, a referral source, and a rewrite opportunity.
            </p>
            
            {/* Price Display */}
            <div className="inline-flex items-baseline gap-2 mb-4">
              <span className="text-6xl md:text-7xl font-black text-[#0D4D4D]">$10</span>
              <span className="text-2xl text-[#6B7280] font-medium">/month</span>
            </div>
            
            {/* Annual Option */}
            <p className="text-[#6B7280] mb-8">
              or <span className="text-[#0D4D4D] font-semibold">$100/year</span> <span className="text-[#3DD6C3] font-medium">(save 17%)</span>
            </p>
            
            <div className="mb-10">
              <Link href="/signup" className="inline-flex items-center gap-3 px-12 py-6 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-2xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105">
                Get the System Now
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
            
            <p className="text-[#6B7280]">
              No contracts • No setup fees • Cancel anytime
            </p>
          </div>
        </section>

        {/* ============================================ */}
        {/* ROADMAP - What's Coming */}
        {/* ============================================ */}
        <section className="py-20 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute right-0 top-0 w-[300px] h-[200px] opacity-20">
            <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`, backgroundSize: '24px 24px' }}></div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                <svg className="w-5 h-5 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">On The Roadmap</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                More <span className="text-[#3DD6C3]">Firepower</span> Coming
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* AI Doc Parsing */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#3DD6C3]/50 transition-all text-center group">
                <div className="w-14 h-14 rounded-xl bg-[#3DD6C3]/20 flex items-center justify-center mb-3 mx-auto group-hover:bg-[#3DD6C3]/30 transition-colors">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-bold mb-1">AI Doc Parsing</h3>
                <p className="text-white/60 text-sm">Upload policies, we extract</p>
              </div>

              {/* Smart Renewal Alerts */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#3DD6C3]/50 transition-all text-center group">
                <div className="w-14 h-14 rounded-xl bg-[#3DD6C3]/20 flex items-center justify-center mb-3 mx-auto group-hover:bg-[#3DD6C3]/30 transition-colors">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h3 className="text-white font-bold mb-1">Smart Renewal Alerts</h3>
                <p className="text-white/60 text-sm">Never miss a renewal</p>
              </div>

              {/* Auto Birthday Messages */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#3DD6C3]/50 transition-all text-center group">
                <div className="w-14 h-14 rounded-xl bg-[#3DD6C3]/20 flex items-center justify-center mb-3 mx-auto group-hover:bg-[#3DD6C3]/30 transition-colors">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-bold mb-1">Auto Birthday Messages</h3>
                <p className="text-white/60 text-sm">Stay top of mind</p>
              </div>

              {/* Face ID Login */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#3DD6C3]/50 transition-all text-center group">
                <div className="w-14 h-14 rounded-xl bg-[#3DD6C3]/20 flex items-center justify-center mb-3 mx-auto group-hover:bg-[#3DD6C3]/30 transition-colors">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                </div>
                <h3 className="text-white font-bold mb-1">Face ID Login</h3>
                <p className="text-white/60 text-sm">Bank-level security</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 8. HIGH-AUTHORITY FAQ */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Frequently Asked <span className="text-[#3DD6C3]">Questions</span>
              </h2>
            </div>

            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div 
                  key={index} 
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
                    aria-expanded={openFaq === index}
                  >
                    <span className="text-lg font-semibold text-[#0D4D4D]">{item.question}</span>
                    <svg 
                      className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === index ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === index ? 'max-h-96' : 'max-h-0'}`}>
                    <div className="px-6 pb-5">
                      <p className="text-[#6B7280] leading-relaxed">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ Schema for SEO */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": faqItems.map(item => ({
                  "@type": "Question",
                  "name": item.question,
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": item.answer
                  }
                }))
              })
            }}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0D4D4D] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-12 h-7 object-contain" />
              <span className="text-xl text-white brand-title">AgentForLife</span>
            </div>

            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">Login</Link>
              <a href="mailto:support@agentforlife.app" className="text-white/70 hover:text-white transition-colors">Contact</a>
              <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="text-white/70 hover:text-white transition-colors">Terms</Link>
            </nav>

            <p className="text-white/50 text-sm">
              © 2026 AgentForLife
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
