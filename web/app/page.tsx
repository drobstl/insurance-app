'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Churn Calculator State
  const [bookSize, setBookSize] = useState('500000');
  const [retentionRate, setRetentionRate] = useState('85');
  const [lostRevenue, setLostRevenue] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate lost revenue
  useEffect(() => {
    const book = parseFloat(bookSize) || 0;
    const retention = parseFloat(retentionRate) || 0;
    const lost = book * (1 - retention / 100);
    setLostRevenue(Math.round(lost));
  }, [bookSize, retentionRate]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  // FAQ Data for JSON-LD
  const faqData = [
    {
      question: "How can insurance agents improve client retention?",
      answer: "The key to improving insurance retention is staying top-of-mind and making yourself indispensable. Agent For Life puts your branded app directly on your client's phone, so when they need insurance help, you're the first call—not the carrier. This dramatically reduces price shopping and policy cancellations."
    },
    {
      question: "How do independent insurance agents get more referrals?",
      answer: "Referrals come from strong relationships and easy opportunities to share. With Agent For Life, every client has your contact info at their fingertips. When friends or family ask about insurance, sharing your info is one tap away. Our upcoming one-tap referral feature will make this even easier."
    },
    {
      question: "How do I stop insurance chargebacks and policy cancellations?",
      answer: "Chargebacks happen when clients don't feel connected to their agent. They price shop, find a slightly cheaper rate, and cancel. Agent For Life fortifies the relationship by keeping you visible and accessible. Clients who feel taken care of don't shop around—they stay."
    },
    {
      question: "How does Agent For Life work with my current lead buying strategy?",
      answer: "Agent For Life doesn't replace lead buying—it maximizes your investment in every lead. Instead of getting one sale per lead, you build relationships that generate referrals and renewals. Think of it as turning every cold lead into a warm network that keeps producing."
    }
  ];

  return (
    <>
      {/* JSON-LD FAQ Schema */}
      <Script id="faq-schema" type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqData.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": faq.answer
            }
          }))
        })
      }} />

      <div className="min-h-screen bg-white">
        {/* Navigation */}
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-[#0D4D4D] shadow-lg' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 md:h-20">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-[#3DD6C3] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="7" r="3" />
                    <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                    <circle cx="4" cy="10" r="2" opacity="0.7" />
                    <circle cx="20" cy="10" r="2" opacity="0.7" />
                    <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-white">AgentForLife</span>
              </div>
              <div className="hidden md:flex items-center gap-8">
                <button onClick={() => scrollToSection('calculator')} className="text-white/80 hover:text-white transition-colors">Calculator</button>
                <button onClick={() => scrollToSection('benefits')} className="text-white/80 hover:text-white transition-colors">Benefits</button>
                <button onClick={() => scrollToSection('pricing')} className="text-white/80 hover:text-white transition-colors">Pricing</button>
                <button onClick={() => scrollToSection('faq')} className="text-white/80 hover:text-white transition-colors">FAQ</button>
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

        {/* ===================== */}
        {/* HERO SECTION */}
        {/* ===================== */}
        <section className="relative bg-[#0D4D4D] pt-28 pb-24 md:pt-36 md:pb-32 overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-72 h-72 bg-[#3DD6C3] rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-3xl"></div>
          </div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              Build a Book That Pays For Life—
              <span className="text-[#3DD6C3]">And Turns Every Sale Into Three More.</span>
          </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
              Stop the churn and start the cycle. Agent For Life <span className="text-white font-semibold">fortifies your client relationships</span> to explode retention, eliminate chargebacks, and automate a <span className="text-[#fdcc02] font-semibold">self-scaling referral loop</span>.
            </p>
            
            <Link href="/signup" className="inline-flex items-center gap-3 px-8 py-4 sm:px-10 sm:py-5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg sm:text-xl font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/40 hover:shadow-[#3DD6C3]/60 hover:scale-105">
              Get the System
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <p className="text-white/50 mt-4 text-sm">$9.99/month • Cancel anytime • Results in days</p>
          </div>

          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 100L60 85C120 70 240 40 360 30C480 20 600 30 720 40C840 50 960 60 1080 60C1200 60 1320 50 1380 45L1440 40V100H0Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ===================== */}
        {/* THE EFFICIENCY GAP - TRUTH BOMB */}
        {/* ===================== */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative bg-[#F8F9FA] rounded-3xl p-8 md:p-12 border-l-4 border-[#fdcc02]">
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <blockquote className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0D4D4D] leading-snug">
                "If you're only getting <span className="text-[#fdcc02]">one sale per lead</span>, you're running in place instead of exploding your growth. Stop the 'one-and-done' cycle and <span className="text-[#3DD6C3]">start building an asset</span>."
              </blockquote>
              <p className="mt-6 text-[#6B7280] text-lg">— The Efficiency Gap that's costing agents thousands every year</p>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* CHURN CALCULATOR */}
        {/* ===================== */}
        <section id="calculator" className="py-20 bg-[#0D4D4D]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                The <span className="text-[#fdcc02]">Retention Leak</span> Calculator
              </h2>
              <p className="text-xl text-white/70">
                How much is weak retention costing you every year?
          </p>
        </div>

            <div className="bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-2xl">
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {/* Book Size Input */}
                <div>
                  <label htmlFor="bookSize" className="block text-sm font-semibold text-[#0D4D4D] mb-2 uppercase tracking-wide">
                    Annual Book Size (Premium)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-lg">$</span>
                    <input
                      id="bookSize"
                      type="number"
                      value={bookSize}
                      onChange={(e) => setBookSize(e.target.value)}
                      className="w-full pl-8 pr-4 py-4 text-xl font-semibold text-[#0D4D4D] border-2 border-gray-200 rounded-xl focus:border-[#3DD6C3] focus:outline-none transition-colors"
                      placeholder="500000"
                    />
                  </div>
                </div>

                {/* Retention Rate Input */}
                <div>
                  <label htmlFor="retentionRate" className="block text-sm font-semibold text-[#0D4D4D] mb-2 uppercase tracking-wide">
                    Current Retention Rate
                  </label>
                  <div className="relative">
                    <input
                      id="retentionRate"
                      type="number"
                      min="0"
                      max="100"
                      value={retentionRate}
                      onChange={(e) => setRetentionRate(e.target.value)}
                      className="w-full px-4 pr-10 py-4 text-xl font-semibold text-[#0D4D4D] border-2 border-gray-200 rounded-xl focus:border-[#3DD6C3] focus:outline-none transition-colors"
                      placeholder="85"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-lg">%</span>
                  </div>
                </div>
              </div>

              {/* Result */}
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 md:p-8 text-center">
                <p className="text-red-600 text-sm font-semibold uppercase tracking-wide mb-2">You Are Losing</p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-red-600 mb-2">
                  {formatCurrency(lostRevenue)}
                </p>
                <p className="text-red-500 text-lg">every year to weak retention</p>
              </div>

              {/* CTA */}
              <div className="mt-8 text-center">
                <Link href="/signup" className="inline-flex items-center gap-3 px-8 py-4 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/30">
                  Stop the Leak
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <p className="text-[#6B7280] text-sm mt-3">Even a 5% improvement pays for Agent For Life 10x over</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* THE HAMSTER WHEEL COMPARISON */}
        {/* ===================== */}
        <section className="py-20 bg-[#F8F9FA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Escape the <span className="text-[#fdcc02]">Lead-Buying Hamster Wheel</span>
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                There are two ways to build a book. Only one builds wealth.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-10">
              {/* The Old Way - Dimmed/Red */}
              <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-red-200 shadow-sm opacity-90">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-red-600">The Lead-Buying Hamster Wheel</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    { text: 'Cold calling strangers who don\'t want to talk', bold: 'Cold calling' },
                    { text: 'One sale per lead—then they\'re gone', bold: 'One sale per lead' },
                    { text: 'High chargebacks eating your commissions', bold: 'High chargebacks' },
                    { text: 'Price-shopping clients with zero loyalty', bold: 'Price-shopping' },
                    { text: 'Running just to stay in place', bold: 'Running in place' }
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[#6B7280] text-base md:text-lg">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* The Agent For Life Way - Bright/Green */}
              <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#3DD6C3] shadow-lg ring-2 ring-[#3DD6C3]/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-[#D1FAE5] rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-[#0D4D4D]">The Agent For Life System</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    { text: 'Automated referrals from happy clients', bold: 'Automated referrals' },
                    { text: '3+ sales per lead through warm networks', bold: '3+ sales per lead' },
                    { text: 'Fortified retention—chargebacks plummet', bold: 'Fortified retention' },
                    { text: '"Un-shopable" relationships with loyal clients', bold: 'Un-shopable' },
                    { text: 'Compounding growth that builds real wealth', bold: 'Compounding growth' }
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[#2D3748] text-base md:text-lg font-medium">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* THE BIG FOUR - BENEFITS GRID */}
        {/* ===================== */}
        <section id="benefits" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                The <span className="text-[#3DD6C3]">Big Four</span>: Maximize & Protect
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                Four pillars of a book that pays for life
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Fortify Retention */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 md:w-7 md:h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold text-[#0D4D4D] mb-2">Fortify Retention</h3>
                    <p className="text-[#6B7280] text-base md:text-lg leading-relaxed">
                      Build a wall around your clients and <span className="text-[#0D4D4D] font-semibold">kill chargebacks</span>. When you're in their pocket, competitors can't touch you.
                    </p>
                  </div>
                </div>
              </div>

              {/* Multiply Referrals */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 md:w-7 md:h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold text-[#0D4D4D] mb-2">Multiply Referrals</h3>
                    <p className="text-[#6B7280] text-base md:text-lg leading-relaxed">
                      Turn every policy into a <span className="text-[#0D4D4D] font-semibold">referral machine</span>. Happy clients share you—effortlessly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Organic Lead Growth */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 md:w-7 md:h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold text-[#0D4D4D] mb-2">Organic Lead Growth</h3>
                    <p className="text-[#6B7280] text-base md:text-lg leading-relaxed">
                      Inbound prospects from your own network—not third-party lists that've been sold five times over.
                    </p>
                  </div>
                </div>
              </div>

              {/* Own the Relationship */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 md:w-7 md:h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold text-[#0D4D4D] mb-2">Own the Relationship</h3>
                    <p className="text-[#6B7280] text-base md:text-lg leading-relaxed">
                      Move from "vendor" to <span className="text-[#0D4D4D] font-semibold">trusted advisor</span>. When you own the relationship, price shopping stops cold.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* TRUST BAR - CARRIER LOGOS */}
        {/* ===================== */}
        <section className="py-16 bg-[#F8F9FA] border-y border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm font-semibold text-[#6B7280] uppercase tracking-wider mb-8">
              Built for Top-Producing Independent Agents Working With
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 lg:gap-16">
              {/* Mutual of Omaha */}
              <div className="flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
                <div className="h-12 flex items-center">
                  <span className="text-xl font-bold text-[#0D4D4D]">Mutual of Omaha</span>
                </div>
              </div>
              {/* Americo */}
              <div className="flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
                <div className="h-12 flex items-center">
                  <span className="text-xl font-bold text-[#0D4D4D]">Americo</span>
                </div>
              </div>
              {/* American-Amicable */}
              <div className="flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
                <div className="h-12 flex items-center">
                  <span className="text-lg font-bold text-[#0D4D4D]">American-Amicable</span>
                </div>
              </div>
              {/* F&G */}
              <div className="flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
                <div className="h-12 flex items-center">
                  <span className="text-xl font-bold text-[#0D4D4D]">F&G</span>
                </div>
              </div>
              {/* Foresters */}
              <div className="flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
                <div className="h-12 flex items-center">
                  <span className="text-xl font-bold text-[#0D4D4D]">Foresters</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* HOW IT WORKS */}
        {/* ===================== */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Up and Running in <span className="text-[#3DD6C3]">10 Minutes</span>
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              <div className="text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl md:text-2xl font-bold text-[#3DD6C3]">1</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Sign Up</h3>
                <p className="text-[#6B7280]">Add your photo, contact info, and agency branding.</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl md:text-2xl font-bold text-[#3DD6C3]">2</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Import Clients</h3>
                <p className="text-[#6B7280]">Upload your book via CSV. Each client gets a unique code.</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl md:text-2xl font-bold text-[#3DD6C3]">3</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Share the App</h3>
                <p className="text-[#6B7280]">Hand off the code. They download your branded app.</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl md:text-2xl font-bold text-[#3DD6C3]">4</div>
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Watch It Compound</h3>
                <p className="text-[#6B7280]">Retention climbs. Referrals roll in. Chargebacks stop.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* PRICING SECTION */}
        {/* ===================== */}
        <section id="pricing" className="py-20 bg-[#0D4D4D]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                Less Than One <span className="text-[#3DD6C3]">Canceled Policy</span>
              </h2>
              <p className="text-xl text-white/70">
                One saved client pays for a full year. Everything after that is profit.
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
                <div className="grid md:grid-cols-2">
                  {/* Monthly */}
                  <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-gray-200">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-[#6B7280] mb-4">Monthly</h3>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl md:text-5xl font-bold text-[#0D4D4D]">$9.99</span>
                        <span className="text-[#6B7280] text-lg">/mo</span>
                      </div>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {['Unlimited clients', 'Unlimited policies', 'Your branded app', 'CSV import', 'Priority support'].map((item, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-[#2D3748]">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup" className="block w-full py-3.5 bg-[#F8F9FA] hover:bg-gray-200 text-[#0D4D4D] text-lg font-semibold rounded-xl transition-colors text-center border border-gray-200">
                      Get Started
                    </Link>
                  </div>

                  {/* Annual */}
                  <div className="p-6 md:p-8 bg-[#3DD6C3]/10 relative">
                    <div className="absolute top-4 right-4">
                      <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">SAVE 17%</span>
                    </div>
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-[#0D4D4D] mb-4">Annual</h3>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl md:text-5xl font-bold text-[#0D4D4D]">$100</span>
                        <span className="text-[#6B7280] text-lg">/yr</span>
                      </div>
                      <p className="text-[#3DD6C3] mt-2 text-sm font-semibold">That's $8.33/mo</p>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {['Everything in Monthly', '2 months FREE', 'Lock in your rate', 'Best value', 'Serious agents only'].map((item, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-[#0D4D4D] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-[#2D3748] font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup" className="block w-full py-3.5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg font-semibold rounded-xl transition-colors text-center shadow-lg">
                      Get Started
                    </Link>
                  </div>
                </div>
              </div>
              <p className="text-center text-white/50 text-sm mt-6">
                Promo code? Enter it at checkout.
              </p>
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* HIGH-AUTHORITY FAQ (SEO) */}
        {/* ===================== */}
        <section id="faq" className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Insurance Agent <span className="text-[#3DD6C3]">Success FAQ</span>
              </h2>
              <p className="text-xl text-[#6B7280]">
                Deep answers to the questions that matter
              </p>
            </div>

            <div className="space-y-6">
              {faqData.map((faq, index) => (
                <div key={index} className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8">
                  <h3 className="text-lg md:text-xl font-bold text-[#0D4D4D] mb-4">
                    {faq.question}
                  </h3>
                  <p className="text-[#6B7280] leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== */}
        {/* FINAL CTA */}
        {/* ===================== */}
        <section className="py-20 bg-[#F8F9FA]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-6">
              Stop Renting Leads.<br />
              <span className="text-[#3DD6C3]">Start Building Wealth.</span>
            </h2>
            <p className="text-xl text-[#6B7280] mb-10 max-w-2xl mx-auto">
              The agents who thrive don't chase—they attract. Get the system that makes clients stick, refer, and compound your growth.
            </p>
            <Link href="/signup" className="inline-flex items-center gap-3 px-8 py-4 sm:px-10 sm:py-5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg sm:text-xl font-bold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/40 hover:shadow-[#3DD6C3]/60 hover:scale-105">
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

        {/* ===================== */}
        {/* FOOTER */}
        {/* ===================== */}
        <footer className="bg-[#0D4D4D] py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-[#3DD6C3] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="7" r="3" />
                    <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                    <circle cx="4" cy="10" r="2" opacity="0.7" />
                    <circle cx="20" cy="10" r="2" opacity="0.7" />
                    <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
                  </svg>
                </div>
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
    </>
  );
}
