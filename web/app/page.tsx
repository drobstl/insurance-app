'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [bookSize, setBookSize] = useState(250000);
  const [bookSizeInput, setBookSizeInput] = useState('250,000');
  const [retentionRate, setRetentionRate] = useState(70);
  const [referralRate, setReferralRate] = useState(5);
  const [rewriteRate, setRewriteRate] = useState(10);

  // Calculator logic
  const lostRevenue = bookSize * (1 - retentionRate / 100);
  const perPercentValue = bookSize * 0.01;
  
  // Average policy value assumption ($1,200/year)
  const avgPolicyValue = 1200;
  const totalClients = Math.round(bookSize / avgPolicyValue);
  
  // Missed referrals: industry average is 20-30% with good systems, most agents get 5%
  const potentialReferralRate = 25; // What's possible with the system
  const missedReferrals = Math.round(totalClients * ((potentialReferralRate - referralRate) / 100));
  const missedReferralRevenue = missedReferrals * avgPolicyValue;
  
  // Missed rewrites: industry average with good follow-up is 30-40%, most agents get 10%
  const potentialRewriteRate = 35; // What's possible with the system
  const missedRewrites = Math.round(totalClients * ((potentialRewriteRate - rewriteRate) / 100));
  const missedRewriteRevenue = missedRewrites * avgPolicyValue;
  
  // Total missed opportunity
  const totalMissedOpportunity = lostRevenue + missedReferralRevenue + missedRewriteRevenue;

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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
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
      <header>
        <nav 
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-[#0D4D4D] shadow-lg' : 'bg-transparent'}`}
          role="navigation"
          aria-label="Main navigation"
        >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-[70px] h-[70px] object-contain bg-[#005851] rounded-xl" />
              <span className="text-xl font-bold text-white">AgentForLife</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('benefits')} className="text-white/80 hover:text-white transition-colors">Why It Works</button>
              <button onClick={() => scrollToSection('pricing')} className="text-white/80 hover:text-white transition-colors">Pricing</button>
              <button onClick={() => scrollToSection('roadmap')} className="text-white/80 hover:text-white transition-colors">Roadmap</button>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-white/80 hover:text-white transition-colors hidden sm:block">
                Login
              </Link>
              <Link href="/signup" className="px-5 py-2.5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white font-semibold rounded-full transition-colors">
                Get the System
              </Link>
            </div>
          </div>
        </div>
      </nav>
      </header>

      <main>
      {/* Hero Section */}
      <section className="relative bg-[#0D4D4D] pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#3DD6C3] rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Build a Book That Pays For Life—{' '}
            <span className="text-[#3DD6C3]">And Turns Every Sale Into Three More.</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
            You're getting <span className="text-[#fdcc02] font-semibold">25% of the income</span> you should be earning. Agent For Life helps you own the relationship, explode your retention rate, and <span className="text-[#fdcc02] font-semibold">kill chargebacks</span> before they happen—while automating referrals and <span className="text-white font-semibold">rewrites</span> that turn one sale into three.
          </p>
          
          {/* Primary CTA */}
          <Link href="/signup" className="inline-flex items-center gap-3 px-10 py-5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-xl font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/40 hover:shadow-[#3DD6C3]/60 hover:scale-105">
            Get the System
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-white/50 mt-4 text-sm">$9.99/month • Cancel anytime • Results in days</p>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 100L60 85C120 70 240 40 360 30C480 20 600 30 720 40C840 50 960 60 1080 60C1200 60 1320 50 1380 45L1440 40V100H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* The Efficiency Gap - Pull Quote Section */}
      <section className="py-16 md:py-20 bg-[#3DD6C3]" aria-labelledby="efficiency-gap-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 id="efficiency-gap-heading" className="sr-only">The Efficiency Gap</h2>
          <blockquote className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#0D4D4D] leading-relaxed">
            <p>
              "If you're only getting <span className="bg-[#0D4D4D] text-white px-2 py-1 rounded">one sale per lead</span>, you're leaving <span className="bg-[#0D4D4D] text-white px-2 py-1 rounded">75% on the table</span>. Stop the 'one-and-done' cycle and start building an asset that compounds: 1 client + 2 referrals + 1 rewrite = <span className="bg-[#0D4D4D] text-white px-2 py-1 rounded">3x your income per lead</span>."
            </p>
          </blockquote>
        </div>
      </section>

      {/* Churn Calculator Section */}
      <section className="py-20 bg-white" aria-labelledby="calculator-heading">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 id="calculator-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              How Much Are You <span className="text-red-500">Leaving on the Table?</span>
            </h2>
            <p className="text-lg text-[#6B7280]">
              Calculate your missed revenue from churn, lost referrals, and missed rewrites.
            </p>
          </div>

          {/* Calculator Card */}
          <div className="bg-[#F8F9FA] rounded-2xl p-8 md:p-10 shadow-lg border border-gray-200" role="form" aria-label="Client retention cost calculator">
            {/* Annual Book Size Input */}
            <div className="mb-8">
              <label 
                htmlFor="bookSize" 
                className="block text-lg font-semibold text-[#0D4D4D] mb-3"
              >
                Annual Book Size ($)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-xl font-medium">$</span>
                <input
                  type="text"
                  id="bookSize"
                  value={bookSizeInput}
                  onChange={handleBookSizeChange}
                  placeholder="Enter your annual book size"
                  className="w-full pl-10 pr-4 py-4 text-xl font-medium text-[#0D4D4D] bg-white border-2 border-gray-200 rounded-xl focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/20 transition-all"
                  aria-label="Annual book size in dollars"
                  min="0"
                />
              </div>
            </div>

            {/* Retention Rate Slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label 
                  htmlFor="retentionRate" 
                  className="text-base font-semibold text-[#0D4D4D]"
                >
                  Current Retention Rate
                </label>
                <span className="text-xl font-bold text-[#3DD6C3]">{retentionRate}%</span>
              </div>
              <input
                type="range"
                id="retentionRate"
                min="40"
                max="95"
                value={retentionRate}
                onChange={(e) => setRetentionRate(parseInt(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                aria-label="Current retention rate percentage"
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
                <label 
                  htmlFor="referralRate" 
                  className="text-base font-semibold text-[#0D4D4D]"
                >
                  Current Referral Rate
                </label>
                <span className="text-xl font-bold text-[#fdcc02]">{referralRate}%</span>
              </div>
              <input
                type="range"
                id="referralRate"
                min="0"
                max="25"
                value={referralRate}
                onChange={(e) => setReferralRate(parseInt(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                aria-label="Current referral rate percentage"
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
                <label 
                  htmlFor="rewriteRate" 
                  className="text-base font-semibold text-[#0D4D4D]"
                >
                  Current Rewrite Rate
                </label>
                <span className="text-xl font-bold text-[#0D4D4D]">{rewriteRate}%</span>
              </div>
              <input
                type="range"
                id="rewriteRate"
                min="0"
                max="35"
                value={rewriteRate}
                onChange={(e) => setRewriteRate(parseInt(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
                aria-label="Current rewrite rate percentage"
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
            <div className="bg-white rounded-xl p-6 md:p-8 border-2 border-red-100 mb-8">
              {bookSize > 0 ? (
                <>
                  <p className="text-center mb-2">
                    <span className="text-base text-[#6B7280]">You're leaving on the table</span>
                  </p>
                  <p className="text-center mb-4">
                    <span className="text-4xl md:text-5xl font-extrabold text-red-500 transition-all duration-300">
                      ${formatNumber(totalMissedOpportunity)}
                    </span>
                    <span className="text-lg text-red-400 block mt-1">/year</span>
                  </p>
                  
                  {/* Breakdown */}
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-[#6B7280]">Lost to churn ({100 - retentionRate}%)</span>
                      <span className="font-semibold text-red-500">-${formatNumber(lostRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-[#6B7280]">Missed referrals ({missedReferrals} clients)</span>
                      <span className="font-semibold text-[#fdcc02]">-${formatNumber(missedReferralRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-[#6B7280]">Missed rewrites ({missedRewrites} opportunities)</span>
                      <span className="font-semibold text-[#0D4D4D]">-${formatNumber(missedRewriteRevenue)}</span>
                    </div>
                  </div>
                  
                  <div className="bg-[#D1FAE5] rounded-lg p-4 border border-[#3DD6C3]">
                    <p className="text-center text-[#0D4D4D] text-sm">
                      <span className="font-bold">Agent For Life</span> helps you capture this revenue with <span className="font-bold text-[#3DD6C3]">one-tap referrals</span>, automated follow-ups, and staying top-of-mind.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-center text-[#6B7280] py-4">
                  Enter your annual book size to see your potential losses.
                </p>
              )}
            </div>

            {/* CTA Button */}
            <Link 
              href="/signup" 
              className="block w-full py-4 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-xl font-bold rounded-xl transition-all text-center shadow-lg shadow-[#3DD6C3]/30 hover:shadow-[#3DD6C3]/50 hover:scale-[1.02] active:scale-[0.98]"
            >
              Stop the Leak – Get the System
            </Link>
          </div>
        </div>
      </section>

      {/* The Big Four - Benefits Grid */}
      <section id="benefits" className="py-20 bg-white" aria-labelledby="benefits-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 id="benefits-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Four Ways to <span className="text-[#3DD6C3]">Dominate</span> Insurance Sales
            </h2>
            <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
              Stop playing defense. Start building an untouchable book of business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Benefit 1 - Fortify Retention & Kill Chargebacks */}
            <article className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Fortify Retention & Kill Chargebacks</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Build a wall around your clients. When you're in their pocket—literally—competitors can't touch you. Your app makes you the first call, not the carrier. <span className="text-[#0D4D4D] font-semibold">Price shopping stops. Chargebacks become rare exceptions</span> instead of a monthly gut punch.
                  </p>
                </div>
              </div>
            </article>

            {/* Benefit 2 - Automate Rewrites & Renewals */}
            <article className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Automate Rewrites & Renewals</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Life changes fast—marriages, new homes, kids, job changes. Your app keeps you top-of-mind when those moments happen. Instead of losing touch, you're the <span className="text-[#0D4D4D] font-semibold">first call when they need to update coverage</span>. Rewrites aren't a sales push—they're natural conversations that happen because you stayed accessible.
                  </p>
                </div>
              </div>
            </article>

            {/* Benefit 3 - Turn Every Client Into a Referral Machine */}
            <article className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#fdcc02] hover:shadow-lg transition-shadow relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">NOW LIVE</span>
              </div>
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#fdcc02] rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-7 h-7 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">One-Tap Referrals</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    <span className="text-[#0D4D4D] font-semibold">Stop cold-calling strangers.</span> Clients tap "Refer" → pick a contact → your business card and a pre-written message are ready to send. You're automatically added to the text thread so you can follow up instantly. <span className="text-[#0D4D4D] font-semibold">Turn happy clients into your best lead source</span>—effortlessly.
                  </p>
                </div>
              </div>
            </article>

            {/* Benefit 4 - Own the Relationship */}
            <article className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Own the Relationship</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Transition from "vendor" to <span className="text-[#0D4D4D] font-semibold">trusted advisor</span>. When you own the relationship, price shopping stops cold. You're not just their insurance agent—you're their insurance agent <span className="text-[#0D4D4D] font-semibold">for life</span>.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* See It In Action - Phone Mockup */}
      <section className="py-20 bg-[#0D4D4D] overflow-hidden" aria-labelledby="app-demo-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div className="text-center lg:text-left">
              <h2 id="app-demo-heading" className="text-3xl md:text-4xl font-extrabold text-white mb-6">
                Your App. Your Brand.{' '}
                <span className="text-[#3DD6C3]">Their Phone.</span>
              </h2>
              <p className="text-xl text-white/80 mb-8 leading-relaxed">
                Every client gets YOUR app—with your photo, your contact info, and their policies at their fingertips. 
                When they need insurance help, <span className="text-[#fdcc02] font-semibold">you're the first call</span>, not the carrier.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="w-8 h-8 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-lg">One-tap call and email</span>
                </li>
                <li className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="w-8 h-8 bg-[#fdcc02]/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-lg"><span className="text-[#fdcc02] font-semibold">One-tap referrals</span> with your business card</span>
                </li>
                <li className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="w-8 h-8 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-lg">All policies in one place</span>
                </li>
                <li className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="w-8 h-8 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-lg">Your face, your branding</span>
                </li>
              </ul>
              <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/30">
                Get the System
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>

            {/* Phone Mockup */}
            <div className="relative flex justify-center lg:justify-end" role="img" aria-label="Insurance agent branded mobile app interface showing agent profile, contact options, and policy viewing features">
              <div className="relative">
                {/* Phone Frame */}
                <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]" aria-hidden="true">
                  <div className="w-full h-full bg-[#F8F9FA] rounded-[2.5rem] overflow-hidden relative">
                    {/* Phone Screen Content */}
                    <div className="bg-[#0D4D4D] pt-12 pb-6 px-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-white/60 text-sm">← Back</span>
                        <span className="text-white/60 text-sm">Sign Out</span>
                      </div>
                      <div className="text-center">
                        <div className="w-20 h-20 bg-[#3DD6C3] rounded-full mx-auto mb-3 flex items-center justify-center">
                          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        </div>
                        <h3 className="text-white font-bold text-lg">Your Name Here</h3>
                        <p className="text-white/70 text-sm">Your Insurance Agent</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[#0D4D4D] rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <span className="text-[#2D3748] font-medium text-sm">Call Agent</span>
                        </div>
                      </div>
                      <div className="bg-[#D1FAE5] rounded-xl p-3 shadow-sm border-2 border-[#3DD6C3]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[#3DD6C3] rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <span className="text-[#0D4D4D] font-bold text-sm">Refer Agent ✨</span>
                        </div>
                      </div>
                      <div className="bg-[#0099FF] rounded-xl p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="text-white font-bold text-sm">View Policies</span>
                        </div>
                      </div>
                    </div>
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
          </div>
        </div>
      </section>

      {/* The Hamster Wheel - Problem/Solution */}
      <section className="py-20 bg-[#F8F9FA]" aria-labelledby="hamster-wheel-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 id="hamster-wheel-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Escape the <span className="text-[#fdcc02]">Hamster Wheel</span>
            </h2>
            <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
              You know the cycle. Buy leads → Close deals → Watch them walk → Repeat. Let's break it.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {/* The Old Way - with red tint overlay */}
            <div className="relative bg-white rounded-2xl p-8 border-2 border-red-300 shadow-sm overflow-hidden">
              {/* Subtle red overlay */}
              <div className="absolute inset-0 bg-red-50/50 pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-red-600">The Old Way</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Buying shared leads at premium prices</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg font-semibold">1 sale per lead = 25% of potential income</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Weak relationships = constant price shopping</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Chargebacks eating your commissions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Clients disappear when life changes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Running just to stay in place</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* The Agent For Life Way - with green highlight */}
            <div className="relative bg-white rounded-2xl p-8 border-2 border-[#3DD6C3] shadow-sm overflow-hidden">
              {/* Subtle green overlay */}
              <div className="absolute inset-0 bg-[#D1FAE5]/30 pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-[#D1FAE5] rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D]">The Agent For Life Way</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg font-semibold text-[#0D4D4D]">3+ sales per lead <span className="text-[#6B7280] font-normal">(client + referrals + rewrites)</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">High-trust clients who <span className="text-[#0D4D4D] font-semibold">stay for life</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#fdcc02] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg"><span className="text-[#0D4D4D] font-semibold">One-tap referrals</span> with your business card</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg"><span className="text-[#0D4D4D] font-semibold">Automated rewrites</span> when life changes happen</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg">Chargebacks become rare exceptions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#2D3748] text-lg"><span className="text-[#0D4D4D] font-semibold">Growing</span> instead of just surviving</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Quick Version */}
      <section className="py-20 bg-white" aria-labelledby="how-it-works-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Up and Running in <span className="text-[#3DD6C3]">10 Minutes</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-[#3DD6C3]">1</div>
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Sign Up</h3>
              <p className="text-[#6B7280]">Add your photo, contact info, and agency branding.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-[#3DD6C3]">2</div>
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Add Clients</h3>
              <p className="text-[#6B7280]">Import your book. Each client gets a unique code.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-[#3DD6C3]">3</div>
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Share the App</h3>
              <p className="text-[#6B7280]">Hand off the code. They download your branded app.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-[#3DD6C3]">4</div>
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Watch the Multiplier Effect</h3>
              <p className="text-[#6B7280]">They call YOU first. Referrals roll in. Life changes trigger rewrites, not lapses. Chargebacks stop.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof - Compact */}
      <section className="py-16 bg-[#F8F9FA]" aria-labelledby="testimonials-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="testimonials-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Agents Are <span className="text-[#3DD6C3]">Winning</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-[#2D3748] text-lg mb-4 italic">
                "Retention up 23%. Clients reach out to ME now instead of calling the carrier."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold text-sm">SM</div>
                <div>
                  <p className="font-semibold text-[#0D4D4D] text-sm">Sarah M.</p>
                  <p className="text-xs text-[#6B7280]">8 years in the game</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-[#2D3748] text-lg mb-4 italic">
                "Older clients love it. No more digging through papers. They feel taken care of."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold text-sm">JT</div>
                <div>
                  <p className="font-semibold text-[#0D4D4D] text-sm">James T.</p>
                  <p className="text-xs text-[#6B7280]">Agency Owner, 15 years</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-[#2D3748] text-lg mb-4 italic">
                "Stopped answering 'what's my coverage?' calls. I spend more time actually selling."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold text-sm">LR</div>
                <div>
                  <p className="font-semibold text-[#0D4D4D] text-sm">Lisa R.</p>
                  <p className="text-xs text-[#6B7280]">Life Insurance Specialist</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white" aria-labelledby="pricing-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="pricing-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Less Than One <span className="text-[#3DD6C3]">Canceled Policy</span>
            </h2>
            <p className="text-xl text-[#6B7280]">
              How much does a chargeback cost you? This pays for itself with one saved client, one referral policy, or one rewrite.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-[#0D4D4D] rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid md:grid-cols-2">
                {/* Monthly */}
                <div className="p-8 border-b md:border-b-0 md:border-r border-white/10">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-white/70 mb-4">Monthly</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-bold text-white">$9.99</span>
                      <span className="text-white/50 text-lg">/mo</span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {['Unlimited clients', 'Unlimited policies', 'Your branded app', 'Priority support'].map((item, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-white/80">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="block w-full py-3.5 bg-white/10 hover:bg-white/20 text-white text-lg font-semibold rounded-xl transition-colors text-center border border-white/20">
                    Get Started
                  </Link>
                </div>

                {/* Annual */}
                <div className="p-8 bg-[#3DD6C3]/10 relative">
                  <div className="absolute top-4 right-4">
                    <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">SAVE 17%</span>
                  </div>
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-[#3DD6C3] mb-4">Annual</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-bold text-white">$100</span>
                      <span className="text-white/50 text-lg">/yr</span>
                    </div>
                    <p className="text-[#3DD6C3] mt-2 text-sm font-medium">That's $8.33/mo</p>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {['Everything in Monthly', '2 months FREE', 'Lock in your rate', 'Best value'].map((item, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-white/80">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="block w-full py-3.5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg font-semibold rounded-xl transition-colors text-center shadow-lg">
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
            <p className="text-center text-[#6B7280] text-sm mt-6">
              Promo code? Enter it at checkout.
            </p>
          </div>
        </div>
      </section>

      {/* Coming Soon / Roadmap */}
      <section id="roadmap" className="py-20 bg-[#0D4D4D] relative overflow-hidden" aria-labelledby="roadmap-heading">
        <div className="absolute right-0 top-0 w-[300px] h-[200px] opacity-20" aria-hidden="true">
          <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`, backgroundSize: '24px 24px' }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
              <svg className="w-5 h-5 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">On The Roadmap</span>
            </div>
            <h2 id="roadmap-heading" className="text-3xl md:text-4xl font-extrabold text-white mb-4">
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

      {/* Final CTA */}
      <section className="py-20 bg-[#F8F9FA]" aria-labelledby="final-cta-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 id="final-cta-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-6">
            Stop Renting Leads.<br />
            <span className="text-[#3DD6C3]">Start Owning Relationships.</span>
          </h2>
          <p className="text-xl text-[#6B7280] mb-10 max-w-2xl mx-auto">
            The agents who thrive don't chase—they attract. Get the system that makes clients stick.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-3 px-10 py-5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-xl font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/40 hover:shadow-[#3DD6C3]/60 hover:scale-105">
            Get the System
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-[#6B7280] mt-4">
            $9.99/month • No contracts • Cancel anytime
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-white" aria-labelledby="faq-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="faq-heading" className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Common <span className="text-[#3DD6C3]">Questions</span>
            </h2>
          </div>

          <div className="space-y-4" role="list">
            {faqItems.map((item, index) => (
              <article 
                key={index} 
                className="border border-gray-200 rounded-xl overflow-hidden bg-[#F8F9FA] hover:border-[#3DD6C3]/50 transition-colors"
                role="listitem"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 min-h-[56px]"
                  aria-expanded={openFaq === index}
                  aria-controls={`faq-answer-${index}`}
                >
                  <span className="text-lg font-semibold text-[#0D4D4D]">{item.question}</span>
                  <svg 
                    className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === index ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div 
                  id={`faq-answer-${index}`}
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-96' : 'max-h-0'}`}
                  role="region"
                  aria-labelledby={`faq-question-${index}`}
                >
                  <div className="px-6 pb-5 pt-0">
                    <p className="text-[#6B7280] text-base leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* FAQ Schema Markup for SEO */}
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
      <footer className="bg-[#0D4D4D] py-12" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-10 h-10 object-contain bg-[#005851] rounded-lg" />
              <span className="text-xl font-bold text-white">AgentForLife</span>
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
