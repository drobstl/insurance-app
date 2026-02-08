'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
  setDoc,
  increment,
  where,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../../firebase';
import { WEEKLY_QUESTION, ISSUE_TYPES } from '../../../lib/feedback-config';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentProfile {
  name?: string;
  email?: string;
}

interface FeatureIdea {
  id: string;
  text: string;
  submittedBy: string;
  submittedByUid: string;
  upvotes: number;
  createdAt: Timestamp | null;
}

type FeedbackTab = 'pulse' | 'features' | 'problems';

/* ------------------------------------------------------------------ */
/*  Star Rating Component                                              */
/* ------------------------------------------------------------------ */

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="p-1 transition-transform hover:scale-110 focus:outline-none"
          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          <svg
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value)
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-300 fill-gray-300'
            }`}
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Feedback Page                                                 */
/* ------------------------------------------------------------------ */

export default function FeedbackPage() {
  const router = useRouter();

  /* ---- Auth & profile ---- */
  const [user, setUser] = useState<User | null>(null);
  const [agentProfile, setAgentProfile] = useState<AgentProfile>({});
  const [loading, setLoading] = useState(true);

  /* ---- Layout ---- */
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<FeedbackTab>('pulse');

  /* ---- Quick Pulse ---- */
  const [pulseResponse, setPulseResponse] = useState('');
  const [pulseRating, setPulseRating] = useState(0);
  const [pulseSubmitting, setPulseSubmitting] = useState(false);
  const [pulseSubmitted, setPulseSubmitted] = useState(false);

  /* ---- Feature Ideas ---- */
  const [featureIdea, setFeatureIdea] = useState('');
  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [featureIdeas, setFeatureIdeas] = useState<FeatureIdea[]>([]);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());

  /* ---- Bug Report ---- */
  const [bugType, setBugType] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugFile, setBugFile] = useState<File | null>(null);
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);

  /* ---- Error state ---- */
  const [submitError, setSubmitError] = useState('');

  /* ================================================================ */
  /*  Auth                                                             */
  /* ================================================================ */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const profileDoc = await getDoc(doc(db, 'agents', currentUser.uid));
          if (profileDoc.exists()) {
            setAgentProfile(profileDoc.data() as AgentProfile);
          }
        } catch (err) {
          console.error('Failed to load agent profile', err);
        }
        setLoading(false);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  /* ================================================================ */
  /*  Firestore: Feature Ideas                                         */
  /* ================================================================ */

  useEffect(() => {
    const q = query(
      collection(db, 'featureIdeas'),
      orderBy('upvotes', 'desc'),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ideas: FeatureIdea[] = [];
      snapshot.forEach((d) => {
        ideas.push({ id: d.id, ...d.data() } as FeatureIdea);
      });
      setFeatureIdeas(ideas);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'featureIdeaVotes'),
      where('agentUid', '==', user.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const votes = new Set<string>();
      snapshot.forEach((d) => {
        votes.add(d.data().ideaId);
      });
      setUserVotes(votes);
    });
    return () => unsubscribe();
  }, [user]);

  /* ================================================================ */
  /*  Helpers                                                          */
  /* ================================================================ */

  const submitToSheet = useCallback(
    async (data: Record<string, string>) => {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: agentProfile.name || user?.displayName || 'Unknown',
          agentEmail: agentProfile.email || user?.email || 'Unknown',
          ...data,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to submit feedback');
      }
    },
    [agentProfile, user],
  );

  /* ================================================================ */
  /*  Submit handlers                                                  */
  /* ================================================================ */

  const handlePulseSubmit = async () => {
    if (!pulseResponse.trim() || pulseRating === 0) return;
    setPulseSubmitting(true);
    setSubmitError('');
    try {
      await submitToSheet({
        feedbackType: 'pulse',
        question: WEEKLY_QUESTION,
        response: pulseResponse,
        rating: String(pulseRating),
        issueType: '',
        screenshotUrl: '',
      });
      setPulseSubmitted(true);
      setPulseResponse('');
      setPulseRating(0);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPulseSubmitting(false);
    }
  };

  const handleFeatureSubmit = async () => {
    if (!featureIdea.trim() || !user) return;
    setFeatureSubmitting(true);
    setSubmitError('');
    try {
      await addDoc(collection(db, 'featureIdeas'), {
        text: featureIdea,
        submittedBy: agentProfile.name || user.displayName || 'Anonymous',
        submittedByUid: user.uid,
        upvotes: 0,
        createdAt: serverTimestamp(),
      });
      await submitToSheet({
        feedbackType: 'feature_request',
        question: 'N/A',
        response: featureIdea,
        rating: '',
        issueType: '',
        screenshotUrl: '',
      });
      setFeatureIdea('');
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFeatureSubmitting(false);
    }
  };

  const handleUpvote = async (ideaId: string) => {
    if (!user || userVotes.has(ideaId)) return;
    try {
      await setDoc(doc(db, 'featureIdeaVotes', `${ideaId}_${user.uid}`), {
        ideaId,
        agentUid: user.uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'featureIdeas', ideaId), {
        upvotes: increment(1),
      });
    } catch (e) {
      console.error('Upvote failed', e);
    }
  };

  const handleBugSubmit = async () => {
    if (!bugType || !bugDescription.trim()) return;
    setBugSubmitting(true);
    setSubmitError('');
    try {
      let screenshotUrl = '';
      if (bugFile && user) {
        const fileRef = ref(
          storage,
          `feedback-screenshots/${user.uid}/${Date.now()}_${bugFile.name}`,
        );
        const snapshot = await uploadBytes(fileRef, bugFile);
        screenshotUrl = await getDownloadURL(snapshot.ref);
      }
      await submitToSheet({
        feedbackType: 'bug_report',
        question: 'N/A',
        response: bugDescription,
        rating: '',
        issueType: bugType,
        screenshotUrl,
      });
      setBugSubmitted(true);
      setBugType('');
      setBugDescription('');
      setBugFile(null);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBugSubmitting(false);
    }
  };

  /* ================================================================ */
  /*  Loading state                                                    */
  /* ================================================================ */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005851]" />
      </div>
    );
  }

  /* ================================================================ */
  /*  Tabs config                                                      */
  /* ================================================================ */

  const tabs: { key: FeedbackTab; label: string }[] = [
    { key: 'pulse', label: 'Quick Pulse' },
    { key: 'features', label: 'Feature Ideas' },
    { key: 'problems', label: 'Report a Problem' },
  ];

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      {/* ============================================================ */}
      {/*  Sidebar                                                      */}
      {/* ============================================================ */}
      <aside
        className={`fixed left-0 top-0 h-full bg-[#005851] z-50 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-16'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-11 h-7 object-contain"
          />
          <span
            className={`ml-3 text-white text-lg whitespace-nowrap overflow-hidden transition-all duration-300 brand-title ${
              sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}
          >
            AgentForLife
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-2 space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Dashboard
            </span>
          </button>

          {/* Clients */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Clients
            </span>
          </button>

          {/* Activity */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Activity
            </span>
          </button>

          {/* Feedback (active) */}
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 bg-[#daf3f0] text-[#005851]"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Feedback
            </span>
          </button>

          {/* Applications */}
          <button
            onClick={() => router.push('/dashboard/admin/applications')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Applications
            </span>
          </button>

          {/* Settings */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${
                sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Settings
            </span>
          </button>
        </nav>
      </aside>

      {/* ============================================================ */}
      {/*  Main content                                                 */}
      {/* ============================================================ */}
      <div className="flex-1 ml-16 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-14 bg-white border-b border-[#d0d0d0] sticky top-0 z-40 flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-[#005851] font-extrabold text-lg tracking-wide">
              AGENTFORLIFE
            </span>
            <span className="text-[#d0d0d0]">|</span>
            <span className="text-[#707070] font-medium">Feedback</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#707070]">
              {agentProfile.name || user?.displayName || 'Agent'}
            </span>
            <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center text-white text-sm font-bold">
              {(agentProfile.name || user?.displayName || 'A')
                .charAt(0)
                .toUpperCase()}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* ======================================================== */}
          {/*  Founding Member Banner                                   */}
          {/* ======================================================== */}
          <div className="bg-[#0D4D4D] rounded-xl px-6 py-4 mb-6">
            <p className="text-white text-base font-semibold">
              🚀 Founding Member Program — Your feedback directly shapes
              AgentForLife. Thank you for building this with us.
            </p>
            <p className="text-white/70 text-sm mt-1">
              Founding members who provide weekly feedback keep lifetime free
              access.
            </p>
          </div>

          {/* ======================================================== */}
          {/*  Tabs                                                     */}
          {/* ======================================================== */}
          <div className="flex gap-1 border-b border-[#d0d0d0] mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSubmitError('');
                }}
                className={`px-4 sm:px-5 py-3 text-sm sm:text-base font-semibold transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-[#0D4D4D]'
                    : 'text-[#707070] hover:text-[#005851]'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#3DD6C3] rounded-t" />
                )}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
              {submitError}
            </div>
          )}

          {/* ======================================================== */}
          {/*  Tab 1: Quick Pulse                                       */}
          {/* ======================================================== */}
          {activeTab === 'pulse' && (
            <div className="max-w-2xl">
              {pulseSubmitted ? (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-8 text-center">
                  <div className="w-16 h-16 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-[#3DD6C3]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[#0D4D4D] mb-2">
                    Thanks!
                  </h3>
                  <p className="text-[#707070] text-base">
                    Your feedback shapes what we build next.
                  </p>
                  <button
                    onClick={() => setPulseSubmitted(false)}
                    className="mt-6 text-[#3DD6C3] font-semibold text-sm hover:underline"
                  >
                    Submit another response
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8">
                  {/* Weekly question */}
                  <h2 className="text-xl sm:text-2xl font-bold text-[#0D4D4D] leading-snug mb-6">
                    {WEEKLY_QUESTION}
                  </h2>

                  {/* Response textarea */}
                  <textarea
                    value={pulseResponse}
                    onChange={(e) => setPulseResponse(e.target.value)}
                    placeholder="Be honest — we need your real thoughts, not polite ones..."
                    rows={5}
                    className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent resize-none"
                  />

                  {/* Star rating */}
                  <div className="mt-6">
                    <label className="block text-sm font-semibold text-[#0D4D4D] mb-2">
                      How essential does AgentForLife feel to your daily workflow
                      right now?
                    </label>
                    <StarRating
                      value={pulseRating}
                      onChange={setPulseRating}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handlePulseSubmit}
                    disabled={
                      pulseSubmitting ||
                      !pulseResponse.trim() ||
                      pulseRating === 0
                    }
                    className="mt-6 w-full sm:w-auto min-h-[44px] px-8 bg-[#3DD6C3] hover:bg-[#32c4b2] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-base"
                  >
                    {pulseSubmitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/*  Tab 2: Feature Ideas                                     */}
          {/* ======================================================== */}
          {activeTab === 'features' && (
            <div className="max-w-2xl">
              {/* Submit new idea */}
              <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8 mb-6">
                <label className="block text-lg font-bold text-[#0D4D4D] mb-3">
                  What feature would make AgentForLife impossible to stop using?
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={featureIdea}
                    onChange={(e) => setFeatureIdea(e.target.value)}
                    placeholder="Describe your feature idea..."
                    className="flex-1 border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFeatureSubmit();
                    }}
                  />
                  <button
                    onClick={handleFeatureSubmit}
                    disabled={featureSubmitting || !featureIdea.trim()}
                    className="min-h-[44px] px-6 bg-[#3DD6C3] hover:bg-[#32c4b2] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-base whitespace-nowrap"
                  >
                    {featureSubmitting ? 'Submitting...' : 'Submit Idea'}
                  </button>
                </div>
              </div>

              {/* Ideas list */}
              <div className="space-y-3">
                {featureIdeas.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-8 text-center">
                    <p className="text-[#707070] text-base">
                      No feature ideas yet. Be the first to share one!
                    </p>
                  </div>
                ) : (
                  featureIdeas.map((idea) => (
                    <div
                      key={idea.id}
                      className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-4 sm:p-5 flex items-start gap-4"
                    >
                      {/* Upvote button */}
                      <button
                        onClick={() => handleUpvote(idea.id)}
                        disabled={userVotes.has(idea.id)}
                        className={`flex flex-col items-center min-w-[48px] py-2 px-2 rounded-lg transition-colors ${
                          userVotes.has(idea.id)
                            ? 'bg-[#3DD6C3]/10 text-[#3DD6C3] cursor-default'
                            : 'bg-[#F8F9FA] hover:bg-[#3DD6C3]/10 text-[#707070] hover:text-[#3DD6C3]'
                        }`}
                      >
                        <svg
                          className="w-5 h-5"
                          fill={userVotes.has(idea.id) ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                        <span className="text-sm font-bold">
                          {idea.upvotes}
                        </span>
                      </button>

                      {/* Idea content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-[#2D3748] leading-relaxed">
                          {idea.text}
                        </p>
                        <p className="text-sm text-[#a0a0a0] mt-1">
                          by {idea.submittedBy}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/*  Tab 3: Report a Problem                                  */}
          {/* ======================================================== */}
          {activeTab === 'problems' && (
            <div className="max-w-2xl">
              {bugSubmitted ? (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-8 text-center">
                  <div className="w-16 h-16 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-[#3DD6C3]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[#0D4D4D] mb-2">
                    Report received!
                  </h3>
                  <p className="text-[#707070] text-base">
                    We&apos;ll look into this. Thanks for helping us improve.
                  </p>
                  <button
                    onClick={() => setBugSubmitted(false)}
                    className="mt-6 text-[#3DD6C3] font-semibold text-sm hover:underline"
                  >
                    Report another issue
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8">
                  {/* Issue type dropdown */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#0D4D4D] mb-2">
                      What type of issue?
                    </label>
                    <select
                      value={bugType}
                      onChange={(e) => setBugType(e.target.value)}
                      className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] bg-white focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23707070' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 16px center',
                      }}
                    >
                      <option value="">Select an issue type...</option>
                      {ISSUE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#0D4D4D] mb-2">
                      Describe what happened
                    </label>
                    <textarea
                      value={bugDescription}
                      onChange={(e) => setBugDescription(e.target.value)}
                      placeholder="What were you trying to do? What went wrong?"
                      rows={5}
                      className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent resize-none"
                    />
                  </div>

                  {/* File upload */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-[#0D4D4D] mb-2">
                      Screenshot (optional)
                    </label>
                    <label className="flex items-center gap-3 border border-dashed border-[#d0d0d0] rounded-lg px-4 py-4 cursor-pointer hover:border-[#3DD6C3] hover:bg-[#F8F9FA] transition-colors">
                      <svg
                        className="w-6 h-6 text-[#a0a0a0] shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-sm text-[#707070]">
                        {bugFile
                          ? bugFile.name
                          : 'Click to upload a screenshot'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setBugFile(file);
                        }}
                      />
                    </label>
                    {bugFile && (
                      <button
                        type="button"
                        onClick={() => setBugFile(null)}
                        className="mt-2 text-sm text-red-500 hover:underline"
                      >
                        Remove file
                      </button>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleBugSubmit}
                    disabled={
                      bugSubmitting || !bugType || !bugDescription.trim()
                    }
                    className="w-full sm:w-auto min-h-[44px] px-8 bg-[#3DD6C3] hover:bg-[#32c4b2] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-base"
                  >
                    {bugSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
