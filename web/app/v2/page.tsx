'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

export default function V2LandingPage() {
  const [bookSize, setBookSize] = useState(250000);
  const [bookSizeInput, setBookSizeInput] = useState('250,000');
  const [retentionRate, setRetentionRate] = useState(70);
  const [referralRate, setReferralRate] = useState(5);
  const [rewriteRate, setRewriteRate] = useState(10);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const smsRef = useRef<HTMLDivElement>(null);
  const smsTriggered = useRef(false);
  const [smsStep, setSmsStep] = useState(-1);
  const showFoundingBanner = true;

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.spotsRemaining === 'number') {
          setSpotsRemaining(data.spotsRemaining);
        }
      })
      .catch(() => {});
  }, []);

  const SMS_DELAYS = [
    600,  750,
    300,
    750,  750,  750,
    350,  350,  350,  350,  300,  300,  300,  300,
    1000,
  ];

  useEffect(() => {
    const el = smsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !smsTriggered.current) {
          smsTriggered.current = true;
          setSmsStep(0);
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (smsStep < 0 || smsStep >= SMS_DELAYS.length) return;
    const timer = setTimeout(() => setSmsStep(s => s + 1), SMS_DELAYS[smsStep]);
    return () => clearTimeout(timer);
  }, [smsStep]);

  const fade = (step: number, fast?: boolean) => ({
    opacity: smsStep >= step ? 1 : 0,
    transform: smsStep >= step ? 'translateY(0)' : 'translateY(6px)',
    transition: `all ${fast ? '150ms' : '400ms'} ease-out`,
  } as React.CSSProperties);

  const lostRevenue = bookSize * (1 - retentionRate / 100);
  const avgPolicyValue = 1200;
  const totalClients = Math.round(bookSize / avgPolicyValue);
  const potentialReferralRate = 25;
  const missedReferrals = Math.round(totalClients * ((potentialReferralRate - referralRate) / 100));
  const missedReferralRevenue = missedReferrals * avgPolicyValue;
  const potentialRewriteRate = 35;
  const missedRewrites = Math.round(totalClients * ((potentialRewriteRate - rewriteRate) / 100));
  const missedRewriteRevenue = missedRewrites * avgPolicyValue;
  const totalBleed = lostRevenue + missedReferralRevenue + missedRewriteRevenue;

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

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
      answer: "Agent For Life sends 7+ automated touchpoints per year per client — holiday cards for 5 major holidays, personalized birthday messages, and policy anniversary alerts — all as push notifications directly to their phone. Combine that with a branded app where they can view policies and contact you instantly, and you become irreplaceable instead of forgettable."
    },
    {
      question: "How do I get more referrals from existing clients?",
      answer: "Make it effortless. Your clients tap one button, pick a contact, and a warm personal introduction goes out via text — with your business card attached. Your AI-powered business line then picks up the conversation in that same text thread, gathers the referral's info, and books an appointment on your calendar. You just show up and close."
    },
    {
      question: "What is the AI business line?",
      answer: "Every agent gets a dedicated phone number powered by AI. When a referral replies to the group text, the AI responds as you — warm, conversational, and natural. It learns what coverage they need, answers basic questions, and shares your scheduling link to book a call. Calls to your business line forward straight to your personal phone. The referral thinks they're texting you directly."
    },
    {
      question: "How do insurance agents generate rewrites?",
      answer: "Agent For Life alerts you 30 days before every policy anniversary — the perfect time to review coverage and offer a rewrite. Your client gets a push notification that you may have found them a lower price for the same coverage, with a link to book on your calendar. Combined with automated touchpoints that keep you top-of-mind, clients call YOU when life changes happen instead of shopping around."
    },
    {
      question: "How do I stop insurance chargebacks and policy cancellations?",
      answer: "Chargebacks happen when relationships go cold. With 7+ automated touchpoints per year, push notifications, and instant access through their app, your clients feel taken care of. When they feel connected to you, they don't shop around or let policies lapse. And if a policy does lapse or get canceled, Conservation Alerts kick in — forward the carrier notice, and AI reaches out to your client within hours with personalized messages to save the policy before a chargeback hits."
    },
    {
      question: "How hard is it to get started?",
      answer: "You can be up and running in 10 minutes. Import your existing clients via CSV spreadsheet or upload PDF insurance applications — our AI extracts client info, policy details, and beneficiaries automatically. Your AI business line is provisioned instantly when you sign up. Share your branded app code with clients and you're live."
    },
    {
      question: "What exactly is Agent For Life?",
      answer: "It's a complete client relationship system: a branded mobile app for your clients, a web dashboard for you to manage clients and policies, automated holiday/birthday/anniversary touchpoints, one-tap referrals with an AI-powered business line that books appointments for you, anniversary rewrite alerts that turn policy renewals into booked appointments, conservation alerts that rescue at-risk policies with AI-powered outreach, CSV import, PDF application parsing, and push notifications — starting at just $25/month (and free for our first 50 founding members)."
    },
    {
      question: "What carriers does it work with?",
      answer: "All of them. Agent For Life is carrier-agnostic. You add policy details in the dashboard (or upload a PDF and AI does it). This works for independent agents regardless of which carriers you're appointed with."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Floating Founding Member Badge */}
      {showFoundingBanner && (
        <div className="fixed right-3 sm:right-5 top-1/3 z-[55]">
          <div className="absolute -inset-2 rounded-full animate-[borderGlow_2.5s_ease-in-out_infinite] bg-[#3DD6C3]/0 border-2 border-[#3DD6C3]/0" />
          <Link
            href="/founding-member"
            className="block relative w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-full bg-[#a158ff] border-[3px] border-[#001961] shadow-2xl shadow-[#a158ff]/40 hover:scale-105 transition-all duration-300"
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <span className="text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-wide">🚀 50 Spots</span>
              <span className="text-white font-extrabold text-sm sm:text-base leading-tight mt-0.5">
                Founding<br />Member
              </span>
              <span className="text-white/70 text-[10px] sm:text-[11px] mt-0.5 font-medium">Lifetime Free</span>
              <span className="text-[#001961] font-bold text-[11px] sm:text-xs mt-1 underline underline-offset-2">
                Apply Now →
              </span>
            </div>
          </Link>
        </div>
      )}

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

      {/* Founding Member Banner */}
      {showFoundingBanner && (
        <div className="fixed top-14 sm:top-16 md:top-20 left-0 right-0 z-50 bg-[#a158ff]">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-center py-2 text-sm sm:text-base font-medium">
            <span className="text-center text-white">
              🚀 Founding Member Program — Now Open. 50 spots. Lifetime free access.{' '}
              <Link href="/founding-member" className="text-[#001961] font-bold underline underline-offset-2 hover:text-[#001961]/80 transition-colors">
                Apply Now →
              </Link>
            </span>
          </div>
        </div>
      )}

      <main>
        {/* ============================================ */}
        {/* HERO */}
        {/* ============================================ */}
        <section className={`relative bg-[#0D4D4D] pb-24 md:pb-32 overflow-hidden ${showFoundingBanner ? 'pt-[10.5rem] md:pt-[13rem]' : 'pt-32 md:pt-40'}`}>
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-20"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15"></div>
          </div>
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}></div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0D4D4D] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D4D4D]"></span>
              </span>
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">The Insurance Revenue Multiplier</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-8">
              <span className="text-[#fdcc02]">Annihilate Chargebacks</span>.<br />
              <span className="text-[#3DD6C3]">Explode Your Referrals</span>.<br />
              Triple Your Income from the Leads You Already Won.
            </h1>
            
            <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
              Stop the &quot;one-and-done&quot; cycle. Agent For Life <span className="text-white font-semibold">fortifies your client relationships</span> with automated touchpoints, one-tap referrals, and your own AI-powered business line — <span className="text-[#fdcc02] font-bold">starting at just $25/month</span>.
            </p>
            
            <Link href="/founding-member" className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105 border-2 border-[#fdcc02] hover:border-white/20">
              Apply for Free Access
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            
            <p className="text-white/40 mt-4 text-sm">No contracts • Cancel anytime • Results in days</p>
          </div>

          <div className="absolute -bottom-1 left-0 right-0">
            <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-[60px] md:h-[120px]">
              <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 40C840 50 960 70 1080 75C1200 80 1320 70 1380 65L1440 60V120H0Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ============================================ */}
        {/* 4 WAYS YOU'RE BLEEDING MONEY                */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white -mt-1">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-4xl md:text-5xl font-extrabold text-[#0D4D4D] mb-4">
                You&apos;re Losing Money in <span className="text-red-500">Four Places</span>.
              </h2>
              <p className="text-xl text-[#6B7280]">
                Nobody&apos;s built anything to fix it — <span className="text-[#0D4D4D] font-bold">until now</span>.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">1</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Referrals Are Stuck in the 1990s</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">You still ask clients to &quot;call your friend and let them know I&apos;ll be reaching out.&quot; By the time you call, it&apos;s a semi-warm lead at best.</p>
              </div>

              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">2</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Clients Call the 800 Number, Not You</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">The relationship is too weak. When your client gets cold feet, they call the carrier directly and cancel. You eat the chargeback.</p>
              </div>

              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">3</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Rewrites Are Sitting on the Table</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">Every policy anniversary is a lay-down sale, but there&apos;s zero systems to flag it, get the client interested, and get them on your calendar.</p>
              </div>

              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">4</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Conservation Alerts Die in Your Inbox</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">The carrier sends a lapse or cancellation notice and it sits in your inbox. By the time you get to it — if you get to it — the client is already gone.</p>
              </div>
            </div>

            <div className="text-center mt-10">
              <p className="text-xl text-[#0D4D4D] font-bold">
                AgentForLife fixes all four. <span className="text-[#6B7280] font-normal">Keep scrolling.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* CHURN CALCULATOR */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
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

            <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl">
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

              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-6 md:p-8 border-2 border-red-200 mb-8">
                {bookSize > 0 ? (
                  <>
                    <p className="text-center text-[#6B7280] mb-2 font-medium">You&apos;re leaving on the table</p>
                    <p className="text-center">
                      <span className="text-5xl md:text-6xl font-black text-red-500">
                        ${formatNumber(totalBleed)}
                      </span>
                    </p>
                    <p className="text-center text-red-400 font-semibold mt-2">/year in missed opportunity</p>
                    
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

              <p className="text-sm text-[#6B7280] mb-4 text-center">
                Agent For Life sends automated holiday cards, birthday messages, and anniversary alerts — keeping you top-of-mind without lifting a finger.
              </p>

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
        {/* YOUR APP + HOW IT WORKS */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                Your App. Your Brand.{' '}
                <span className="text-[#3DD6C3]">Their Phone.</span>
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                Stop being a forgotten name buried under 500 contacts. Give every client YOUR branded app—with your photo, your contact info, and their policies at their fingertips. Up and running in <span className="text-[#fdcc02] font-semibold">10 minutes</span>.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="relative flex justify-center order-2 lg:order-1">
                <div className="relative">
                  <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                    <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
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
                  <p className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white/60 text-sm whitespace-nowrap">
                    What your clients see
                  </p>
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <div className="space-y-8">
                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">1</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Sign Up & Brand Your App</h3>
                      <p className="text-white/70">Add your photo, contact info, and agency branding. Takes 5 minutes.</p>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">2</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Add Your Clients</h3>
                      <p className="text-white/70">Import your entire book via CSV or upload a PDF application — AI extracts the data for you. Each client gets a unique code for your app.</p>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#3DD6C3] rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-[#3DD6C3]/30">3</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Share the App</h3>
                      <p className="text-white/70">Hand off the code. They download YOUR branded app. When they refer someone, a warm intro and your business card go out in one tap.</p>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-[#fdcc02] rounded-2xl flex items-center justify-center text-2xl font-bold text-[#0D4D4D] shadow-lg shadow-[#fdcc02]/30">4</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Watch the Multiplier Effect</h3>
                      <p className="text-white/70">Automated holiday cards, birthday messages, and anniversary alerts keep you top-of-mind. Your AI business line handles referral conversations and books appointments. <span className="text-[#fdcc02] font-semibold">You just show up and close.</span></p>
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
        {/* THE REFERRAL PIPELINE — solves Problem 1     */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-20 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15"></div>
          </div>
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-red-400/80 text-sm font-medium uppercase tracking-wide mb-3">The old way: &quot;Tell your friend I&apos;ll call.&quot;</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">The Referral Pipeline</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                From <span className="text-[#3DD6C3]">One Tap</span> to <span className="text-[#fdcc02]">Booked Appointment</span>
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                Your clients already trust you. Now they can share that trust — and your AI handles the rest. Hot lead, zero phone tag.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 md:gap-4">
              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10 relative">
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">1</div>
                <h3 className="text-xl font-bold text-white mb-3">One Tap, One Contact</h3>
                <p className="text-white/70 leading-relaxed">
                  Your client taps the referral button in their app and picks a friend or family member from their contacts. That&apos;s all they do.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10 relative">
                <div className="w-12 h-12 bg-[#3DD6C3] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">2</div>
                <h3 className="text-xl font-bold text-white mb-3">Warm Intro + Your Card</h3>
                <p className="text-white/70 leading-relaxed">
                  A personal text goes out from your client — a warm introduction about you, with <span className="text-white font-semibold">your business card attached</span>. Not a cold link. A trusted recommendation.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-[#fdcc02]/30 relative">
                <div className="absolute top-4 right-4">
                  <span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-[10px] font-bold rounded-full uppercase">AI Powered</span>
                </div>
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">3</div>
                <h3 className="text-xl font-bold text-white mb-3">AI Books the Appointment</h3>
                <p className="text-white/70 leading-relaxed">
                  When the referral replies, your <span className="text-white font-semibold">AI business line</span> picks up the conversation — texting as you. It gathers their info and books them on your calendar. <span className="text-[#fdcc02] font-semibold">You just show up and close.</span>
                </p>
              </div>
            </div>

            {/* SMS Preview */}
            <div className="mt-16" ref={smsRef}>
              <p className="text-white/40 text-xs text-center mb-8 uppercase tracking-[0.2em] font-medium">What the referral sees</p>

              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-start">
                {/* PHONE 1: Group Chat */}
                <div>
                  <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-white/10">
                    <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-white/40 text-[10px] font-medium">9:41 AM</span>
                      <div className="flex gap-0.5">
                        <div className="w-1 h-2 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-2.5 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-3 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-3.5 bg-white/30 rounded-sm"></div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">Sarah, Daniel, Mike</p>
                          <p className="text-white/30 text-[10px]">Group Message</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-4 py-4 space-y-3 rounded-b-[1.6rem] min-h-[180px]">
                      <div className="flex justify-start" style={fade(0)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white/40 text-[10px] mb-0.5 font-medium">Sarah</p>
                          <p className="text-white text-[13px] leading-relaxed">Hey Mike, I just got helped by Daniel getting protection for my family. He was great and I thought he might be able to help you too!</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(1)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-[#3DD6C3] text-[10px] mb-0.5 font-medium">Daniel</p>
                          <p className="text-white text-[13px] leading-relaxed">Hey Mike! Sarah, thank you for connecting us. Mike, great to meet you — I&apos;ll shoot you a text.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-white/30 text-xs mt-3 font-medium">Group text — warm intro from your client</p>
                </div>

                {/* AI Handoff (mobile) */}
                <div className="md:hidden flex flex-col items-center py-2" style={fade(2)}>
                  <div className="w-px h-4 bg-gradient-to-b from-white/10 to-[#3DD6C3]/40"></div>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full">
                    <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-[#3DD6C3] text-xs font-bold uppercase tracking-wide">AI takes over in minutes</span>
                  </div>
                  <div className="w-px h-4 bg-gradient-to-b from-[#3DD6C3]/40 to-white/10"></div>
                </div>

                {/* PHONE 2: 1-on-1 */}
                <div>
                  <div className="hidden md:flex items-center justify-center gap-2 mb-3" style={fade(2)}>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#3DD6C3]/30"></div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full">
                      <svg className="w-3 h-3 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-[#3DD6C3] text-[10px] font-bold uppercase tracking-wider">AI takes over in minutes</span>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#3DD6C3]/30"></div>
                  </div>

                  <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20">
                    <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-white/40 text-[10px] font-medium">9:44 AM</span>
                      <div className="flex gap-0.5">
                        <div className="w-1 h-2 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-2.5 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-3 bg-white/40 rounded-sm"></div>
                        <div className="w-1 h-3.5 bg-white/30 rounded-sm"></div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center">
                          <span className="text-[#3DD6C3] text-xs font-bold">D</span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">Daniel</p>
                          <p className="text-white/30 text-[10px]">Your AI Business Line</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-4 py-4 space-y-2.5 rounded-b-[1.6rem]">
                      <div className="flex justify-end" style={fade(2)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white text-[13px] leading-relaxed">Hey Mike, this is Daniel. Sarah mentioned she connected us — I helped her family get some protection in place and she thought I might be able to help you too. Would you be open to a couple quick questions to see if it makes sense for us to chat?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(3)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white text-[13px]">yeah sure</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(4)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white text-[13px] leading-relaxed">Appreciate that. What would be most important to you when it comes to protecting your family financially?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(5)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white text-[13px] leading-relaxed">mostly making sure my wife and kids are taken care of if something happens to me</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(6, true)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px] leading-relaxed">Do you have any coverage in place right now?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(7, true)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px]">just what I get through work</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(8, true)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px] leading-relaxed">Got it. Do you own or rent your home?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(9, true)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px]">own — mortgage is around $280k</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(10, true)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px] leading-relaxed">How old are your kids?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(11, true)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px]">4 and 7</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(12, true)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px] leading-relaxed">And would you say you&apos;re in pretty good health overall?</p>
                        </div>
                      </div>
                      <div className="flex justify-start" style={fade(13, true)}>
                        <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]">
                          <p className="text-white text-[12px]">yeah no major issues</p>
                        </div>
                      </div>
                      <div className="flex justify-end" style={fade(14)}>
                        <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                          <p className="text-white text-[13px] leading-relaxed">Really appreciate you sharing all that, Mike. Based on what you&apos;ve told me, I think a quick 15-min call would be worth it so I can show you a couple options. Here&apos;s my calendar — pick whatever time works best:</p>
                          <p className="text-[#3DD6C3] text-[13px] mt-1.5 underline">calendly.com/daniel</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-white/30 text-xs mt-3 font-medium">1-on-1 — AI qualifies &amp; books the appointment</p>
                </div>
              </div>

              {/* Bottom callout */}
              <div className="max-w-2xl mx-auto mt-10" style={fade(14)}>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">The referral thinks they&apos;re texting you</p>
                    <p className="text-white/50 text-sm leading-relaxed">Your AI business line responds in your voice — warm, personal, and natural. It qualifies the lead, gathers their info, and books the appointment on your calendar. You just show up and close.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Referral Drip Callout */}
            <div className="mt-12 bg-white/5 rounded-2xl p-8 md:p-10 border border-white/10 text-center max-w-3xl mx-auto">
              <p className="text-white/40 text-sm uppercase tracking-[0.15em] font-medium mb-3">And if they don&apos;t reply?</p>
              <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
                Your AI <span className="text-[#3DD6C3]">doesn&apos;t give up.</span>
              </h3>
              <p className="text-white/70 max-w-xl mx-auto mb-6">
                If the referral goes quiet, your AI automatically follows up — each message more direct than the last. You don&apos;t lift a finger.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <span className="px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm font-medium">Day 2 · Gentle nudge</span>
                <span className="px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm font-medium">Day 5 · New angle</span>
                <span className="px-4 py-2 bg-[#fdcc02]/20 border border-[#fdcc02]/30 rounded-full text-[#fdcc02] text-sm font-medium">Day 8 · Direct ask</span>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* AUTOMATED TOUCHPOINTS — solves Problem 2     */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-red-400/80 text-sm font-medium uppercase tracking-wide mb-3">The old way: clients call the 800 number and cancel.</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Stay Top of Mind. <span className="text-[#3DD6C3]">Automatically.</span>
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                <span className="text-[#0D4D4D] font-bold">7+ personalized touchpoints per year</span>, per client — completely automatic. When doubts come, they call <em>you</em> — not the carrier.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-[#F8F9FA] rounded-2xl p-6 text-center border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">🎄🎆❤️🎇🦃</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Holiday Cards</h3>
                <p className="text-[#6B7280] text-sm">Automated greetings for 5 major holidays — New Year&apos;s, Valentine&apos;s Day, 4th of July, Thanksgiving, Christmas.</p>
              </div>
              <div className="bg-[#F8F9FA] rounded-2xl p-6 text-center border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">🎂</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Birthday Messages</h3>
                <p className="text-[#6B7280] text-sm">Personalized birthday greetings sent automatically to every client. Never forget again.</p>
              </div>
              <div className="bg-[#F8F9FA] rounded-2xl p-6 text-center border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">📋</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Anniversary Alerts</h3>
                <p className="text-[#6B7280] text-sm">Get alerted 30 days before every policy anniversary — the perfect time to review and offer a rewrite.</p>
              </div>
              <div className="bg-[#F8F9FA] rounded-2xl p-6 text-center border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">📱</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Push Notifications</h3>
                <p className="text-[#6B7280] text-sm">Send messages directly to your clients&apos; phones. Custom notifications, reminders, and announcements.</p>
              </div>
            </div>

            <div className="text-center mt-10">
              <p className="text-[#6B7280] text-lg">
                Other agents send one email a year. <span className="text-[#0D4D4D] font-bold">You&apos;ll have 7+ touchpoints — on autopilot.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ANNIVERSARY REWRITES — solves Problem 3      */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-red-400/80 text-sm font-medium uppercase tracking-wide mb-3">The old way: zero systems to catch rewrite opportunities.</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D] rounded-full mb-6">
                <span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">Anniversary Rewrites</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Every Anniversary Is a <span className="text-[#3DD6C3]">Booked Appointment</span>.
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                30 days before the one-year mark, your client hears from you — not the carrier. The rewrite comes to you, not the other way around.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">You Get the Heads-Up</h3>
                    <p className="text-[#6B7280] leading-relaxed">30 days before a policy anniversary, you get an email digest with every upcoming renewal. No spreadsheets. No manual tracking.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">Your Client Gets a Notification</h3>
                    <p className="text-[#6B7280] leading-relaxed">A personalized push notification goes to their phone — letting them know you may have found a lower price for the same coverage, with a link to book on your calendar.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">They Book Themselves</h3>
                    <p className="text-[#6B7280] leading-relaxed">The client taps through to your scheduling link and picks a time. The rewrite conversation starts with <em>them</em> reaching out to <em>you</em>.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-lg">
                <div className="text-center mb-6">
                  <p className="text-sm text-[#6B7280] font-medium uppercase tracking-wide mb-2">You choose the tone</p>
                  <div className="inline-flex rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-5 py-3 bg-[#0D4D4D] text-white text-sm font-semibold">
                      Lower Price Alert
                    </div>
                    <div className="px-5 py-3 bg-white text-[#6B7280] text-sm font-medium">
                      Warm Check-In
                    </div>
                  </div>
                </div>
                <div className="bg-[#F8F9FA] rounded-2xl p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#3DD6C3] text-xs font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p>
                      <p className="text-[#6B7280] text-xs">Your Agent</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-100">
                    <p className="text-[#0D4D4D] text-sm leading-relaxed">
                      &quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? It&apos;ll take 10 minutes — tap below to grab a time on my calendar.&quot;
                    </p>
                  </div>
                  <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Book with Daniel
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* CONSERVATION ALERTS — solves Problem 4       */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#fdcc02] rounded-full blur-[150px] opacity-10"></div>
            <div className="absolute top-10 right-20 w-72 h-72 bg-[#3DD6C3] rounded-full blur-[120px] opacity-10"></div>
          </div>
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-red-400/80 text-sm font-medium uppercase tracking-wide mb-3">The old way: the carrier notice sits in your inbox until it&apos;s too late.</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Conservation Alerts</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                Forward an Email. <span className="text-[#fdcc02]">Save a Commission.</span>
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                When a carrier notifies you that a policy has lapsed or been canceled, just forward the email. <span className="text-white font-semibold">AI handles everything else.</span>
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 md:gap-4">
              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10 relative">
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">1</div>
                <h3 className="text-xl font-bold text-white mb-3">Forward the Alert</h3>
                <p className="text-white/70 leading-relaxed">
                  Get a conservation opportunity from your carrier? Forward the email to <span className="text-[#fdcc02] font-semibold">AI@conserve.agentforlife.app</span> or paste the text into your dashboard. That&apos;s all you do.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10 relative">
                <div className="w-12 h-12 bg-[#3DD6C3] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">2</div>
                <h3 className="text-xl font-bold text-white mb-3">AI Extracts & Matches</h3>
                <p className="text-white/70 leading-relaxed">
                  AI pulls the client name, policy number, carrier, and reason — then <span className="text-white font-semibold">auto-matches it to your existing records</span> and flags whether the policy is under 1 year old (chargeback risk).
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-[#fdcc02]/30 relative">
                <div className="absolute top-4 right-4">
                  <span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-[10px] font-bold rounded-full uppercase">AI Powered</span>
                </div>
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">3</div>
                <h3 className="text-xl font-bold text-white mb-3">Client Gets Reached</h3>
                <p className="text-white/70 leading-relaxed">
                  Within 2 hours, at-risk clients get a <span className="text-white font-semibold">personalized push notification and text</span> from you — not a form letter. AI follows up on Day 2, 5, and 7 with different angles. <span className="text-[#fdcc02] font-semibold">You just watch the dashboard.</span>
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 bg-[#fdcc02]/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h4 className="text-white font-bold mb-1">Protect Your Commissions</h4>
                <p className="text-white/50 text-sm leading-relaxed">Chargebacks on policies under 1 year cost you real money. Catch them before it&apos;s too late.</p>
              </div>

              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="text-white font-bold mb-1">Smart Prioritization</h4>
                <p className="text-white/50 text-sm leading-relaxed">AI knows which alerts are chargeback risks and acts on those first. Older policies get tracked; newer ones get rescued.</p>
              </div>

              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 bg-[#fdcc02]/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h4 className="text-white font-bold mb-1">AI-Powered Outreach</h4>
                <p className="text-white/50 text-sm leading-relaxed">Personalized messages that sound like you, not a form letter. Each follow-up takes a different angle.</p>
              </div>

              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h4 className="text-white font-bold mb-1">Automatic Follow-Ups</h4>
                <p className="text-white/50 text-sm leading-relaxed">Day 2, 5, and 7 drip sequence keeps working while you sell. Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard.</p>
              </div>
            </div>

            <div className="text-center mt-12">
              <p className="text-white/60 text-lg">
                Other agents lose clients they never knew were leaving. <span className="text-white font-bold">You&apos;ll know within hours — and AI will already be working to save them.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ONBOARD YOUR BOOK */}
        {/* ============================================ */}
        <section className="py-16 md:py-20 bg-[#F8F9FA]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                  Already Have Clients?<br />
                  <span className="text-[#3DD6C3]">Import in Minutes.</span>
                </h2>
                <p className="text-lg text-[#6B7280] mb-6">
                  Don&apos;t worry about entering 200 clients one by one. We&apos;ve got you.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#3DD6C3] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[#0D4D4D] font-semibold">CSV Import</p>
                      <p className="text-[#6B7280] text-sm">Upload a spreadsheet, preview the data, click import. Your entire book is loaded in minutes.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#3DD6C3] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[#0D4D4D] font-semibold">AI Application Parsing</p>
                      <p className="text-[#6B7280] text-sm">Upload an insurance application PDF and AI extracts the client info, policy details, and beneficiaries automatically.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-48 h-48 md:w-56 md:h-56 bg-[#0D4D4D] rounded-3xl flex items-center justify-center">
                  <svg className="w-20 h-20 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ROI COMPARISON */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                The Math is <span className="text-[#3DD6C3]">Undeniable</span>
              </h2>
              <p className="text-xl text-[#6B7280]">
                One saved policy. One referral. That&apos;s all it takes.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 items-center">
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

              <div className="flex flex-col items-center justify-center py-8">
                <div className="text-4xl font-black text-[#6B7280]">vs</div>
              </div>

              <div className="bg-[#D1FAE5] rounded-3xl p-8 border-2 border-[#3DD6C3] text-center">
                <div className="w-16 h-16 bg-[#3DD6C3] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-[#0D4D4D] font-semibold text-sm uppercase tracking-wide mb-2">Agent For Life</p>
                <p className="text-4xl md:text-5xl font-black text-[#0D4D4D] mb-2">$300</p>
                <p className="text-[#3DD6C3] text-sm font-medium">$25/month × 12 months</p>
              </div>
            </div>

            <div className="mt-12 bg-[#0D4D4D] rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
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
                  Save <span className="text-[#3DD6C3]">ONE</span> Policy = <span className="text-[#fdcc02]">4x Return</span>
                </h3>
                
                <p className="text-xl text-white/80 max-w-2xl mx-auto mb-6">
                  One saved client or one referral pays for an <span className="text-white font-semibold">entire year</span> of Agent For Life—<span className="text-[#fdcc02] font-semibold">and then some</span>. Everything after that is pure profit.
                </p>

                <div className="flex flex-wrap justify-center gap-6 text-white/70">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 saved policy = 4x ROI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 referral = 4x ROI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>1 rewrite = 4x ROI</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* PRICING */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] mb-6">
                Stop Renting Leads.<br />
                <span className="text-[#3DD6C3]">Start Owning Relationships.</span>
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                Early adopters get the best price — <span className="font-semibold">locked in for life</span>. The earlier you join, the less you&apos;ll ever pay.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <div className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-6 text-center shadow-lg shadow-[#a158ff]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-[#a158ff] text-white text-xs font-bold rounded-full whitespace-nowrap">NOW OPEN</span>
                </div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Founding Members</p>
                <p className="text-4xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-sm text-[#a158ff] font-semibold mb-3">For Life</p>
                <p className="text-xs text-[#6B7280] mb-2">50 spots total</p>
                {spotsRemaining !== null && (
                  <p className="text-xs text-[#a158ff] font-bold mb-3">
                    {spotsRemaining > 0 ? `${spotsRemaining} spots left` : 'FULL'}
                  </p>
                )}
                {spotsRemaining === null || spotsRemaining > 0 ? (
                  <Link href="/founding-member" className="block w-full py-3 bg-[#a158ff] hover:bg-[#8a3ee8] text-white text-sm font-bold rounded-xl transition-colors">
                    Apply Now
                  </Link>
                ) : (
                  <div className="w-full py-3 bg-gray-200 text-[#6B7280] text-sm font-bold rounded-xl">
                    Filled
                  </div>
                )}
              </div>

              <div className="relative bg-white rounded-2xl border-2 border-[#3DD6C3] p-6 text-center shadow-lg shadow-[#3DD6C3]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-[#3DD6C3] text-[#0D4D4D] text-xs font-bold rounded-full whitespace-nowrap">UP NEXT</span>
                </div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Charter Members</p>
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-4xl font-black text-[#0D4D4D]">$25</span>
                  <span className="text-sm text-[#6B7280]">/mo</span>
                </div>
                <p className="text-sm text-[#3DD6C3] font-semibold mb-3">Locked in for life</p>
                <p className="text-xs text-[#6B7280] mb-4">50 spots • or $250/year</p>
                <div className="w-full py-3 bg-[#0D4D4D]/10 text-[#0D4D4D] text-sm font-bold rounded-xl">
                  Opens Soon
                </div>
              </div>

              <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Inner Circle</p>
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-4xl font-black text-[#0D4D4D]">$35</span>
                  <span className="text-sm text-[#6B7280]">/mo</span>
                </div>
                <p className="text-sm text-[#6B7280] font-semibold mb-3">Locked in for life</p>
                <p className="text-xs text-[#6B7280] mb-4">50 spots • or $350/year</p>
                <div className="w-full py-3 bg-gray-100 text-[#6B7280] text-sm font-medium rounded-xl">
                  After $25 tier fills
                </div>
              </div>

              <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Standard Price</p>
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-4xl font-black text-[#0D4D4D]">$49</span>
                  <span className="text-sm text-[#6B7280]">/mo</span>
                </div>
                <p className="text-sm text-[#6B7280] font-semibold mb-3">Regular pricing</p>
                <p className="text-xs text-[#6B7280] mb-4">Unlimited • or $490/year</p>
                <div className="w-full py-3 bg-gray-100 text-[#6B7280] text-sm font-medium rounded-xl">
                  After $35 tier fills
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[#6B7280] mb-6">
                <span className="text-[#0D4D4D] font-bold">Right now:</span> We&apos;re filling the first 50 Founding Member spots — <span className="text-[#a158ff] font-bold">free for life</span>.
              </p>
              <Link href="/founding-member" className="inline-flex items-center gap-3 px-12 py-6 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-2xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105">
                Apply for Founding Member
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <p className="text-[#6B7280] text-sm mt-4">
                No contracts • Lock in your price for life • Cancel anytime
              </p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* FAQ */}
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
