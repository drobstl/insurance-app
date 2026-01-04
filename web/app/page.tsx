'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);

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

  return (
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

      {/* Hero Section - Aggressive, Punchy */}
      <section className="relative bg-[#0D4D4D] pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#3DD6C3] rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Stop Buying Leads.{' '}
            <span className="text-[#3DD6C3]">Start Fortifying Your Book.</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
            Replace weak, shared leads with <span className="text-white font-semibold">warm, organic referrals</span>. Agent For Life helps you own the relationship, explode your retention rate, and <span className="text-[#fdcc02] font-semibold">kill chargebacks</span> before they happen.
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

      {/* The Big Four - Benefits Grid */}
      <section id="benefits" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Four Ways to <span className="text-[#3DD6C3]">Dominate</span> Insurance Sales
            </h2>
            <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
              Stop playing defense. Start building an untouchable book of business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Benefit 1 - Retention */}
            <div className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Explode Retention</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Build a wall around your clients. Stop the churn and <span className="text-[#0D4D4D] font-semibold">eliminate the sting of chargebacks</span>. When you're in their pocket, competitors can't touch you.
                  </p>
                </div>
              </div>
            </div>

            {/* Benefit 2 - Referrals */}
            <div className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Warm Referrals on Demand</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Turn every policy into a referral machine. <span className="text-[#0D4D4D] font-semibold">Stop cold-calling</span>—start closing people who actually want to talk to you.
                  </p>
                </div>
              </div>
            </div>

            {/* Benefit 3 - Leads */}
            <div className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Organic Leads That Close</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Generate high-intent inbound prospects from your own network—not a third-party list that's been sold five times over.
                  </p>
                </div>
              </div>
            </div>

            {/* Benefit 4 - Relationship */}
            <div className="bg-[#F8F9FA] rounded-2xl p-8 border-l-4 border-[#3DD6C3] hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#0D4D4D] mb-2">Own the Relationship</h3>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
                    Transition from "vendor" to <span className="text-[#0D4D4D] font-semibold">trusted advisor</span>. When you own the relationship, price shopping stops cold.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Hamster Wheel - Problem/Solution */}
      <section className="py-20 bg-[#0D4D4D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Escape the <span className="text-[#fdcc02]">Hamster Wheel</span>
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              You know the cycle. Buy leads → Close deals → Watch them walk → Repeat. Let's break it.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {/* The Old Way */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-red-500/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-red-400">The Old Way</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Buying shared leads at premium prices</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Weak relationships = constant price shopping</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Chargebacks eating your commissions</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Running just to stay in place</span>
                </li>
              </ul>
            </div>

            {/* The Agent For Life Way */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-[#3DD6C3]/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#3DD6C3]">The Agent For Life Way</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">High-trust clients who <span className="text-white font-semibold">stay for life</span></span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Self-sustaining referral loop</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg">Automated rewrites & renewals</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#3DD6C3] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/80 text-lg"><span className="text-white font-semibold">Growing</span> instead of just surviving</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Quick Version */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
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
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">Watch Retention Climb</h3>
              <p className="text-[#6B7280]">They call YOU. Referrals roll in. Chargebacks stop.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof - Compact */}
      <section className="py-16 bg-[#F8F9FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
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
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
              Less Than One <span className="text-[#3DD6C3]">Canceled Policy</span>
            </h2>
            <p className="text-xl text-[#6B7280]">
              How much does a chargeback cost you? This pays for itself with one saved client.
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
      <section id="roadmap" className="py-20 bg-[#0D4D4D] relative overflow-hidden">
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

          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { icon: '🔗', title: 'One-Tap Referrals', desc: 'Clients share you instantly' },
              { icon: '🤖', title: 'AI Doc Parsing', desc: 'Upload policies, we extract' },
              { icon: '🔔', title: 'Smart Renewal Alerts', desc: 'Never miss a renewal' },
              { icon: '📅', title: 'Auto Birthday Messages', desc: 'Stay top of mind' },
              { icon: '🔐', title: 'Face ID Login', desc: 'Bank-level security' },
            ].map((item, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#3DD6C3]/50 transition-all text-center">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="text-white font-bold mb-1">{item.title}</h3>
                <p className="text-white/60 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-[#F8F9FA]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-6">
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

      {/* Footer */}
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
  );
}
