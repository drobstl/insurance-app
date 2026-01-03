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
                {/* Logo: Person with connection nodes - representing agent-client relationships */}
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  {/* Central person */}
                  <circle cx="12" cy="7" r="3" />
                  <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                  {/* Connection nodes */}
                  <circle cx="4" cy="10" r="2" opacity="0.7" />
                  <circle cx="20" cy="10" r="2" opacity="0.7" />
                  {/* Connection lines */}
                  <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white">AgentForLife</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('features')} className="text-white/80 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-white/80 hover:text-white transition-colors">Pricing</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-white/80 hover:text-white transition-colors">How It Works</button>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-white/80 hover:text-white transition-colors hidden sm:block">
                Login
              </Link>
              <Link href="/signup" className="px-5 py-2.5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white font-semibold rounded-full transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-[#0D4D4D] pt-24 pb-20 md:pt-32 md:pb-32 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#3DD6C3] rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Don't be another number in their contacts.{' '}
                <span className="text-[#3DD6C3]">Be their Agent For Life.</span>
          </h1>
              <p className="text-xl md:text-2xl text-white/80 mb-8 max-w-2xl">
                A white-label app right on your client's phone, made to foster direct, deepened client relationships.
              </p>
              
              {/* Key Benefits */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-4 mb-10">
                <div className="flex items-center gap-2 px-5 py-3 bg-white/10 rounded-full border border-white/20">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-white font-medium">Increase retention</span>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 bg-white/10 rounded-full border border-white/20">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-white font-medium">Deepen the relationship</span>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-4">
                <Link href="/signup" className="px-8 py-4 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-lg font-semibold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/30 hover:shadow-[#3DD6C3]/50 flex items-center justify-center gap-2">
                  Get Started
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <button onClick={() => scrollToSection('features')} className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white text-lg font-semibold rounded-full transition-all border border-white/30 flex items-center justify-center gap-2">
                  See How It Works
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Phone Mockup */}
            <div className="relative hidden lg:flex justify-center">
              <div className="relative">
                {/* Phone Frame */}
                <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                  <div className="w-full h-full bg-[#F8F9FA] rounded-[2.5rem] overflow-hidden relative">
                    {/* Phone Screen Content */}
                    <div className="bg-[#0D4D4D] pt-12 pb-6 px-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-white/60 text-sm">← Back</span>
                        <span className="text-white/60 text-sm">Sign Out</span>
                      </div>
                      <div className="text-center">
                        <div className="w-20 h-20 bg-[#3DD6C3] rounded-full mx-auto mb-3 flex items-center justify-center text-white text-2xl font-bold">
                          DR
                        </div>
                        <h3 className="text-white font-bold text-lg">Daniel Roberts</h3>
                        <p className="text-white/70 text-sm">Your Insurance Agent</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <span className="text-[#2D3748] font-medium">Call Daniel</span>
                        </div>
                      </div>
                      <div className="bg-[#fdcc02] rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="text-[#0D4D4D] font-bold">View My Policies</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Floating Elements */}
                <div className="absolute -top-4 -right-8 bg-white rounded-xl p-3 shadow-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">Policy Active</span>
                  </div>
                </div>
                <div className="absolute -bottom-4 -left-8 bg-white rounded-xl p-3 shadow-xl">
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

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            {/* Powerful Quote */}
            <div className="bg-[#0D4D4D] rounded-2xl p-8 mb-12 shadow-xl">
              <p className="text-2xl md:text-3xl text-white font-medium italic leading-relaxed">
                "At the end of an appointment, if your clients don't have this app on their phone, <span className="text-[#3DD6C3] font-bold not-italic">are you really even their agent?</span>"
              </p>
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-6">
              Position yourself as more than just a contact in their phone
            </h2>
            <p className="text-xl text-[#6B7280] mb-8">
              With AgentForLife, you get a <span className="text-[#0D4D4D] font-semibold">personalized mobile app</span> that puts YOUR identity directly in your clients' hands—your logo, your photo, your phone number, your email. 
              It's not our app with your name on it—it's <span className="text-[#3DD6C3] font-semibold">YOUR app</span>, built to strengthen the relationships that drive your business.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#D1FAE5] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-lg font-medium text-[#2D3748]">Client Retention</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#D1FAE5] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-lg font-medium text-[#2D3748]">Deeper Relationships</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#D1FAE5] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-lg font-medium text-[#2D3748]">Complete Trust</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-[#F8F9FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-4">
              Everything You Need to Stay Connected
            </h2>
            <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
              Powerful features designed to strengthen your client relationships
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Your Personal Mobile App</h3>
              <p className="text-[#6B7280] text-lg">
                Your logo, your photo, your contact info. Clients see YOU—your name, your face, your direct line. It's their app with your identity.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Always Accessible</h3>
              <p className="text-[#6B7280] text-lg">
                Your contact info, photo, and agency details right at their fingertips. Click-to-call and email built in.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Complete Policy Management</h3>
              <p className="text-[#6B7280] text-lg">
                Clients view all their policy details, coverage amounts, and renewal dates in one organized place.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Unlimited Clients & Policies</h3>
              <p className="text-[#6B7280] text-lg">
                Manage your entire book of business with no limits. Add as many clients and policies as you need.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Bank-Level Security</h3>
              <p className="text-[#6B7280] text-lg">
                All client data is encrypted and securely stored. Your clients' information is protected at all times.
              </p>
            </div>

            {/* Feature 6 - Coming Soon */}
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border border-gray-100 relative overflow-hidden">
              <div className="absolute top-4 right-4 px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">
                COMING SOON
              </div>
              <div className="w-14 h-14 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Smart Notifications</h3>
              <p className="text-[#6B7280] text-lg">
                Push notifications to clients for policy renewals and rewrite opportunities. Never miss a touchpoint.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
              Four simple steps to transform your client relationships
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#3DD6C3]">
                1
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Sign Up & Customize</h3>
              <p className="text-[#6B7280]">
                Create your account and customize your agent profile with your photo, contact info, and branding.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#3DD6C3]">
                2
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Add Your Clients</h3>
              <p className="text-[#6B7280]">
                Import your existing clients and their policies. Each client gets a unique access code.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#3DD6C3]">
                3
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Share the Code</h3>
              <p className="text-[#6B7280]">
                Give your clients their unique code. They download the app and enter it to connect with you.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#3DD6C3]">
                4
              </div>
              <h3 className="text-xl font-bold text-[#0D4D4D] mb-3">Stay Connected</h3>
              <p className="text-[#6B7280]">
                Your clients now have direct access to you and their policies—building trust that lasts a lifetime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-[#0D4D4D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-white/70">
              One plan. Everything included. No surprises.
            </p>
          </div>

          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
              <div className="bg-[#3DD6C3] p-8 text-center">
                <h3 className="text-xl font-semibold text-[#0D4D4D] mb-2">Professional Plan</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-bold text-[#0D4D4D]">$9.99</span>
                  <span className="text-[#0D4D4D]/70 text-xl">/month</span>
                </div>
                <p className="text-[#0D4D4D]/80 mt-2">Unlimited clients. Unlimited policies. Cancel anytime.</p>
              </div>

              <div className="p-8">
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#2D3748] text-lg">Personalized mobile app for your clients</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#2D3748] text-lg">Unlimited client and policy management</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#2D3748] text-lg">Agent profile customization with photo</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#2D3748] text-lg">Secure cloud storage</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#2D3748] text-lg">Priority support</span>
                  </li>
                </ul>

                <Link href="/signup" className="block w-full py-4 bg-[#0D4D4D] hover:bg-[#0A3D3D] text-white text-lg font-semibold rounded-xl transition-colors text-center">
                  Get Started
                </Link>
                <p className="text-center text-[#9CA3AF] text-sm mt-4">
                  Cancel anytime
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-[#F8F9FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-4">
              What Agents Are Saying
            </h2>
            <p className="text-xl text-[#6B7280]">
              Join hundreds of agents who've transformed their client relationships
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-[#2D3748] text-lg mb-6">
                "My retention rate has increased by 23% since I started using AgentForLife. Clients actually reach out to ME now instead of calling the carrier."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold">
                  SM
                </div>
                <div>
                  <p className="font-semibold text-[#0D4D4D]">Sarah M.</p>
                  <p className="text-sm text-[#6B7280]">Independent Agent, 8 years</p>
                </div>
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-[#2D3748] text-lg mb-6">
                "My older clients especially love it. They don't have to dig through papers—everything's right there on their phone. They feel taken care of."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold">
                  JT
                </div>
                <div>
                  <p className="font-semibold text-[#0D4D4D]">James T.</p>
                  <p className="text-sm text-[#6B7280]">Agency Owner, 15 years</p>
                </div>
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-[#2D3748] text-lg mb-6">
                "The time I save not answering 'what's my coverage?' calls is incredible. Clients look it up themselves and I spend more time actually selling."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0D4D4D] rounded-full flex items-center justify-center text-white font-bold">
                  LR
                </div>
                <div>
                  <p className="font-semibold text-[#0D4D4D]">Lisa R.</p>
                  <p className="text-sm text-[#6B7280]">Life Insurance Specialist, 5 years</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-[#0D4D4D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Be Their Agent For Life?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Stop being just another contact. Start building relationships that last a lifetime.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-10 py-5 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white text-xl font-semibold rounded-full transition-all shadow-lg shadow-[#3DD6C3]/30 hover:shadow-[#3DD6C3]/50">
            Get Started
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-white/60 mt-4">
            Only $9.99/month • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0A3D3D] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#3DD6C3] rounded-xl flex items-center justify-center">
                {/* Logo: Person with connection nodes - representing agent-client relationships */}
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  {/* Central person */}
                  <circle cx="12" cy="7" r="3" />
                  <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                  {/* Connection nodes */}
                  <circle cx="4" cy="10" r="2" opacity="0.7" />
                  <circle cx="20" cy="10" r="2" opacity="0.7" />
                  {/* Connection lines */}
                  <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white">AgentForLife</span>
            </div>

            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">Login</Link>
              <a href="mailto:support@agentforlife.com" className="text-white/70 hover:text-white transition-colors">Contact</a>
              <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="text-white/70 hover:text-white transition-colors">Terms of Service</Link>
            </nav>

            <p className="text-white/50 text-sm">
              © 2026 AgentForLife. All rights reserved.
            </p>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="text-[#3DD6C3] font-medium italic">
              "Insurance relationships that last."
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
