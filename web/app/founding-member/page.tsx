'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function FoundingMemberPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [clientCount, setClientCount] = useState('');
  const [biggestDifference, setBiggestDifference] = useState('');

  // Scroll animation refs
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.getAttribute('data-section'));
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set(prev).add(index));
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    sectionRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const setSectionRef = (index: number) => (el: HTMLElement | null) => {
    sectionRefs.current[index] = el;
  };

  const sectionClass = (index: number) =>
    `transition-all duration-700 ease-out ${
      visibleSections.has(index)
        ? 'opacity-100 translate-y-0'
        : 'opacity-0 translate-y-8'
    }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'foundingMemberApplications'), {
        name,
        email,
        clientCount,
        biggestDifference,
        timestamp: serverTimestamp(),
        status: 'pending',
      });
      setSubmitted(true);

      // Send notification email to admin (fire-and-forget)
      fetch('/api/admin/applications/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantName: name, applicantEmail: email }),
      }).catch(() => {});
    } catch (err) {
      console.error('Error submitting application:', err);
      setError('Something went wrong. Please try again or email support@agentforlife.app directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqItems = [
    {
      question: 'What happens after 60 days?',
      answer:
        "If you've been active and giving feedback, you keep lifetime free access. Period. No bait-and-switch.",
    },
    {
      question: 'Do I need a credit card?',
      answer:
        "Yes — you'll sign up through our normal checkout with a special promo code I send you. Your card won't be charged as long as you're an active founding member.",
    },
    {
      question: 'What if I want to cancel?',
      answer:
        'Cancel anytime. No questions asked. But you\'d lose your founding member status permanently.',
    },
    {
      question: 'Can I join later?',
      answer:
        "No. Once I fill all 50 spots, this program closes permanently. There won't be another round.",
    },
    {
      question: 'What kind of feedback do you want?',
      answer:
        "Real feedback. What's broken, what's confusing, what's missing, what would make you open this app every morning. I need the truth, not compliments.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0D4D4D] shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 md:h-20">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
              <img
                src="/logo.png"
                alt="AgentForLife Logo"
                className="w-[50px] h-[28px] sm:w-[70px] sm:h-[40px] md:w-[80px] md:h-[45px] object-contain flex-shrink-0"
              />
              <span className="text-base sm:text-lg md:text-xl text-white brand-title truncate">
                AgentForLife
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Link
                href="/login"
                className="text-white/80 hover:text-white transition-colors text-sm sm:text-base"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm sm:text-base font-semibold rounded-full transition-colors whitespace-nowrap"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ============================================ */}
        {/* HERO SECTION */}
        {/* ============================================ */}
        <section className="relative bg-[#0D4D4D] pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-10"></div>
          </div>

          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          ></div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Small caps label */}
            <p className="text-[#3DD6C3] text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] mb-6">
              By Invitation Only
            </p>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-8">
              Become a Founding Member
            </h1>

            <p className="text-lg md:text-xl text-white/75 mb-10 max-w-3xl mx-auto leading-relaxed">
              50 agents will get lifetime free access to AgentForLife — in exchange for 60 days of
              honest feedback. Once the group is full, this page disappears.
            </p>

            {/* Spots remaining badge */}
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DD6C3] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3DD6C3]"></span>
              </span>
              <span className="text-white font-bold text-lg">
                <span className="text-[#3DD6C3]">47</span> of 50 spots remaining
              </span>
            </div>
          </div>

          {/* Wave Divider */}
          <div className="absolute -bottom-1 left-0 right-0">
            <svg
              viewBox="0 0 1440 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
              className="w-full h-[60px] md:h-[120px]"
            >
              <path
                d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 40C840 50 960 70 1080 75C1200 80 1320 70 1380 65L1440 60V120H0Z"
                fill="white"
              />
            </svg>
          </div>
        </section>

        {/* ============================================ */}
        {/* WHAT YOU GET SECTION */}
        {/* ============================================ */}
        <section
          ref={setSectionRef(0)}
          data-section="0"
          className={`py-20 md:py-28 bg-white ${sectionClass(0)}`}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-6">
                What Founding Members Get
              </h2>

              {/* Price callout */}
              <div className="inline-block bg-[#F8F9FA] rounded-2xl px-8 py-6 border border-gray-200 mb-4">
                <p className="text-2xl md:text-3xl font-bold text-[#2D3748]">
                  <span className="line-through text-gray-400 decoration-red-400 decoration-2">
                    $100/year
                  </span>
                  <span className="mx-3 text-gray-300">→</span>
                  <span className="text-[#3DD6C3] font-extrabold text-3xl md:text-4xl">
                    FREE. Forever.
                  </span>
                </p>
              </div>
              <p className="text-[#6B7280] text-lg max-w-2xl mx-auto">
                Not a free trial. Not a limited offer. Lifetime free access as long as you stay
                active in the program.
              </p>
            </div>

            {/* Benefits grid */}
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  text: 'Lifetime free access to AgentForLife ($100/year value)',
                },
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ),
                  text: 'Your own branded client app on iOS & Android',
                },
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  ),
                  text: 'Direct line to the founder (me) for support',
                },
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  ),
                  text: 'Your feedback literally shapes the product roadmap',
                },
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                  text: 'Early access to every new feature before anyone else',
                },
                {
                  icon: (
                    <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  ),
                  text: '"Founding Member" badge in your app permanently',
                },
              ].map((benefit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 bg-[#F8F9FA] rounded-xl p-5 border border-gray-100"
                >
                  <div className="w-10 h-10 bg-[#0D4D4D] rounded-lg flex items-center justify-center flex-shrink-0">
                    {benefit.icon}
                  </div>
                  <p className="text-[#2D3748] text-base md:text-lg font-medium">{benefit.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* WHAT I NEED FROM YOU SECTION */}
        {/* ============================================ */}
        <section
          ref={setSectionRef(1)}
          data-section="1"
          className={`py-20 md:py-28 bg-[#F8F9FA] ${sectionClass(1)}`}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                What I Need From You
              </h2>
            </div>

            <div className="max-w-2xl mx-auto space-y-5">
              {[
                {
                  icon: '🏢',
                  text: 'Use AgentForLife with real clients (not just a test account)',
                },
                {
                  icon: '📝',
                  text: 'Give feedback once a week through the in-app feedback tool (takes 2 minutes)',
                },
                {
                  icon: '🔥',
                  text: "Be brutally honest — tell me what sucks, what's confusing, what's missing",
                },
                {
                  icon: '📅',
                  text: 'Commit for 60 days',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 bg-white rounded-xl p-5 border border-gray-200 shadow-sm"
                >
                  <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>
                  <p className="text-[#2D3748] text-base md:text-lg">{item.text}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-[#6B7280] italic mt-10 max-w-2xl mx-auto text-base leading-relaxed">
              &ldquo;I&rsquo;m not looking for cheerleaders. I&rsquo;m looking for agents who will
              tell me the truth so I can build something you can&rsquo;t live without.&rdquo;
            </p>
          </div>
        </section>

        {/* ============================================ */}
        {/* APPLICATION FORM SECTION */}
        {/* ============================================ */}
        <section
          ref={setSectionRef(2)}
          data-section="2"
          className={`py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden ${sectionClass(2)}`}
        >
          {/* Background Effects */}
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-10"></div>
          </div>

          <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            {!submitted ? (
              <>
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                    Apply for a Founding Member Spot
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Full Name */}
                  <div>
                    <label htmlFor="name" className="block text-white font-semibold mb-2 text-base">
                      Full Name <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-[#3DD6C3] focus:outline-none focus:ring-4 focus:ring-[#3DD6C3]/20 transition-all text-base"
                      placeholder="Your full name"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-white font-semibold mb-2 text-base">
                      Email <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-[#3DD6C3] focus:outline-none focus:ring-4 focus:ring-[#3DD6C3]/20 transition-all text-base"
                      placeholder="you@example.com"
                    />
                  </div>

                  {/* Client Count Dropdown */}
                  <div>
                    <label
                      htmlFor="clientCount"
                      className="block text-white font-semibold mb-2 text-base"
                    >
                      How many active clients do you have right now?{' '}
                      <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <select
                      id="clientCount"
                      required
                      value={clientCount}
                      onChange={(e) => setClientCount(e.target.value)}
                      className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white focus:border-[#3DD6C3] focus:outline-none focus:ring-4 focus:ring-[#3DD6C3]/20 transition-all text-base appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='white' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1.25rem center',
                      }}
                    >
                      <option value="" disabled className="bg-[#0D4D4D] text-white/40">
                        Select one
                      </option>
                      <option value="1-10" className="bg-[#0D4D4D]">
                        1–10
                      </option>
                      <option value="11-25" className="bg-[#0D4D4D]">
                        11–25
                      </option>
                      <option value="26-50" className="bg-[#0D4D4D]">
                        26–50
                      </option>
                      <option value="51-100" className="bg-[#0D4D4D]">
                        51–100
                      </option>
                      <option value="100+" className="bg-[#0D4D4D]">
                        100+
                      </option>
                    </select>
                  </div>

                  {/* Biggest Difference - Radio Card Pills */}
                  <div>
                    <p className="block text-white font-semibold mb-3 text-base">
                      What would make the biggest difference in your business right now?{' '}
                      <span className="text-[#3DD6C3]">*</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        'Stop losing clients I already closed',
                        'Get more referrals from my existing clients',
                        'Stay top-of-mind so clients call me first',
                        'All of the above',
                      ].map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setBiggestDifference(option)}
                          className={`px-4 py-3.5 rounded-xl text-left text-sm sm:text-base font-medium transition-all border cursor-pointer ${
                            biggestDifference === option
                              ? 'bg-[#3DD6C3]/20 border-[#3DD6C3] text-white ring-2 ring-[#3DD6C3]/40'
                              : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                biggestDifference === option
                                  ? 'border-[#3DD6C3] bg-[#3DD6C3]'
                                  : 'border-white/40'
                              }`}
                            >
                              {biggestDifference === option && (
                                <svg className="w-3 h-3 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            {option}
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* Hidden required input for form validation */}
                    <input
                      type="text"
                      required
                      value={biggestDifference}
                      onChange={() => {}}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-5 py-4 text-red-300 text-base">
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-[#3DD6C3] hover:bg-[#2fc4b1] text-[#0D4D4D] text-lg font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-[#3DD6C3]/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {submitting ? 'Submitting...' : 'Apply Now'}
                  </button>

                  <p className="text-white/50 text-sm text-center">
                    I personally review every application. You&rsquo;ll hear from me within 24 hours.
                  </p>
                </form>
              </>
            ) : (
              /* Confirmation screen */
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-[#3DD6C3] rounded-full flex items-center justify-center mx-auto mb-8">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6">
                  You&rsquo;re in the running.
                </h2>

                <p className="text-lg text-white/75 mb-8 max-w-lg mx-auto leading-relaxed">
                  I&rsquo;ll personally review your application and get back to you within 24 hours.
                  Keep an eye on your inbox.
                </p>

                <p className="text-[#3DD6C3] font-semibold text-lg">
                  — Daniel Roberts, Founder
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ============================================ */}
        {/* FAQ SECTION */}
        {/* ============================================ */}
        <section
          ref={setSectionRef(3)}
          data-section="3"
          className={`py-20 md:py-28 bg-white ${sectionClass(3)}`}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div
                  key={index}
                  className="bg-[#F8F9FA] border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
                    aria-expanded={openFaq === index}
                  >
                    <span className="text-lg font-semibold text-[#0D4D4D]">{item.question}</span>
                    <svg
                      className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${
                        openFaq === index ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      openFaq === index ? 'max-h-96' : 'max-h-0'
                    }`}
                  >
                    <div className="px-6 pb-5">
                      <p className="text-[#6B7280] leading-relaxed">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* CONTACT FOOTER */}
        {/* ============================================ */}
        <section className="py-16 bg-[#F8F9FA] border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-[#6B7280] text-lg mb-4">
              Questions? Email me directly:{' '}
              <a
                href="mailto:support@agentforlife.app"
                className="text-[#0D4D4D] font-semibold hover:text-[#3DD6C3] transition-colors underline"
              >
                support@agentforlife.app
              </a>
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[#3DD6C3] hover:text-[#0D4D4D] font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to AgentForLife.app
            </Link>
          </div>
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
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">
                Login
              </Link>
              <a
                href="mailto:support@agentforlife.app"
                className="text-white/70 hover:text-white transition-colors"
              >
                Contact
              </a>
              <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-white/70 hover:text-white transition-colors">
                Terms
              </Link>
            </nav>

            <p className="text-white/50 text-sm">© 2026 AgentForLife</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
