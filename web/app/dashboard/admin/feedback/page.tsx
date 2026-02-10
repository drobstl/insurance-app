'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../../../../firebase';
import {
  ACTIVE_SURVEYS,
  getCurrentPeriodId,
} from '../../../../lib/feedback-config';
import type { Survey, SurveyQuestion } from '../../../../lib/feedback-config';
import { isAdminEmail } from '../../../../lib/admin';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SurveyResponse {
  id: string;
  surveyId: string;
  periodId: string;
  agentUid: string;
  agentName: string;
  agentEmail: string;
  answers: Record<string, unknown>;
  completedAt: Timestamp | null;
}

interface BugReport {
  id: string;
  agentName: string;
  agentEmail: string;
  productArea: string;
  issueType: string;
  description: string;
  screenshotUrl?: string;
  createdAt: Timestamp | null;
}

interface AgentInfo {
  id: string;
  name?: string;
  email?: string;
}

type AdminTab = 'overview' | 'surveys' | 'bugs' | 'agents';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(timestamp: Timestamp | null): string {
  if (!timestamp) return '—';
  const now = Date.now();
  const then = timestamp.toMillis();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function computeNps(scores: number[]): number {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

function npsLabel(score: number): string {
  if (score >= 50) return 'Excellent';
  if (score >= 0) return 'Good';
  return 'Needs Work';
}

function npsColor(score: number): string {
  if (score >= 50) return 'text-emerald-600';
  if (score >= 0) return 'text-yellow-600';
  return 'text-red-600';
}

const PRODUCT_AREA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  client_app: 'Client App',
  general: 'General',
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  broken: 'Broken',
  confusing: 'Confusing',
  crashed: 'Crashed',
  slow: 'Slow',
  other: 'Other',
};

/* ------------------------------------------------------------------ */
/*  Stat Card Component                                                */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  subtext,
  valueColor,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-5">
      <p className="text-sm text-[#707070] font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueColor || 'text-[#0D4D4D]'}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-[#a0a0a0] mt-1">{subtext}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rating Distribution Bar                                            */
/* ------------------------------------------------------------------ */

function RatingBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[#707070] w-6 text-right">{label}</span>
      <div className="flex-1 h-5 bg-[#F8F9FA] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-[#707070] w-8">{count}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Question Result Renderer                                           */
/* ------------------------------------------------------------------ */

function QuestionResult({
  question,
  responses,
}: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
}) {
  const answers = responses
    .map((r) => r.answers[question.id])
    .filter((a) => a !== undefined && a !== null && a !== '');

  if (answers.length === 0) {
    return (
      <div className="py-4">
        <p className="text-sm font-semibold text-[#0D4D4D] mb-2">{question.text}</p>
        <p className="text-sm text-[#a0a0a0]">No responses yet</p>
      </div>
    );
  }

  if (question.type === 'rating') {
    const scale = question.scale || 5;
    const nums = answers.map(Number);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const dist: Record<number, number> = {};
    for (let i = 1; i <= scale; i++) dist[i] = 0;
    nums.forEach((n) => {
      if (dist[n] !== undefined) dist[n]++;
    });

    return (
      <div className="py-4">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-semibold text-[#0D4D4D]">{question.text}</p>
          <span className="text-lg font-bold text-[#0D4D4D] ml-4 shrink-0">
            {avg.toFixed(1)}/{scale}
          </span>
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: scale }, (_, i) => scale - i).map((star) => (
            <RatingBar
              key={star}
              label={String(star)}
              count={dist[star]}
              total={nums.length}
              color="bg-yellow-400"
            />
          ))}
        </div>
        <p className="text-xs text-[#a0a0a0] mt-2">
          {nums.length} response{nums.length !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }

  if (question.type === 'nps') {
    const nums = answers.map(Number);
    const nps = computeNps(nums);
    const promoters = nums.filter((n) => n >= 9).length;
    const passives = nums.filter((n) => n >= 7 && n <= 8).length;
    const detractors = nums.filter((n) => n <= 6).length;

    return (
      <div className="py-4">
        <p className="text-sm font-semibold text-[#0D4D4D] mb-3">{question.text}</p>
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center">
            <p className={`text-4xl font-bold ${npsColor(nps)}`}>{nps}</p>
            <p className={`text-xs font-medium mt-1 ${npsColor(nps)}`}>
              NPS — {npsLabel(nps)}
            </p>
          </div>
          <div className="flex-1 space-y-1.5">
            <RatingBar
              label=""
              count={promoters}
              total={nums.length}
              color="bg-emerald-500"
            />
            <RatingBar
              label=""
              count={passives}
              total={nums.length}
              color="bg-yellow-400"
            />
            <RatingBar
              label=""
              count={detractors}
              total={nums.length}
              color="bg-red-400"
            />
          </div>
        </div>
        <div className="flex gap-4 text-xs text-[#707070]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            Promoters (9-10): {promoters}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
            Passives (7-8): {passives}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-red-400 rounded-full" />
            Detractors (0-6): {detractors}
          </span>
        </div>
      </div>
    );
  }

  if (question.type === 'multiple_choice' && question.options) {
    const counts: Record<string, number> = {};
    question.options.forEach((o) => (counts[o] = 0));
    answers.forEach((a) => {
      const s = String(a);
      if (counts[s] !== undefined) counts[s]++;
    });
    const sorted = question.options.slice().sort(
      (a, b) => (counts[b] || 0) - (counts[a] || 0),
    );

    return (
      <div className="py-4">
        <p className="text-sm font-semibold text-[#0D4D4D] mb-3">{question.text}</p>
        <div className="space-y-2">
          {sorted.map((option) => (
            <RatingBar
              key={option}
              label=""
              count={counts[option]}
              total={answers.length}
              color="bg-[#3DD6C3]"
            />
          ))}
        </div>
        <div className="space-y-1 mt-2">
          {sorted.map((option) => (
            <div key={option} className="flex items-center gap-2 text-xs text-[#707070]">
              <span className="w-2 h-2 bg-[#3DD6C3] rounded-full shrink-0" />
              <span className="flex-1">{option}</span>
              <span className="font-medium">{counts[option]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === 'text') {
    const texts = answers.map(String).filter((t) => t.trim());
    return (
      <div className="py-4">
        <p className="text-sm font-semibold text-[#0D4D4D] mb-3">
          {question.text}
          <span className="text-[#a0a0a0] font-normal ml-2">
            ({texts.length} response{texts.length !== 1 ? 's' : ''})
          </span>
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {texts.map((text, i) => (
            <div
              key={i}
              className="bg-[#F8F9FA] rounded-lg px-4 py-3 text-sm text-[#2D3748]"
            >
              &ldquo;{text}&rdquo;
              <span className="block text-xs text-[#a0a0a0] mt-1">
                — {responses[i]?.agentName || 'Anonymous'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Main Admin Feedback Analytics Page                                 */
/* ------------------------------------------------------------------ */

export default function AdminFeedbackPage() {
  const router = useRouter();

  /* ---- State ---- */
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  /* ---- Data ---- */
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  /* ---- Selected survey for detail view ---- */
  const activeSurveys = ACTIVE_SURVEYS.filter((s) => s.active);
  const [selectedSurveyId, setSelectedSurveyId] = useState(
    activeSurveys[0]?.id || '',
  );

  /* ================================================================ */
  /*  Auth                                                             */
  /* ================================================================ */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (!isAdminEmail(currentUser.email)) {
          router.push('/dashboard');
          return;
        }
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  /* ================================================================ */
  /*  Firestore listeners                                              */
  /* ================================================================ */

  useEffect(() => {
    const q = query(
      collection(db, 'surveyResponses'),
      orderBy('completedAt', 'desc'),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const responses: SurveyResponse[] = [];
      snapshot.forEach((d) => {
        responses.push({ id: d.id, ...d.data() } as SurveyResponse);
      });
      setSurveyResponses(responses);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'bugReports'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports: BugReport[] = [];
      snapshot.forEach((d) => {
        reports.push({ id: d.id, ...d.data() } as BugReport);
      });
      setBugReports(reports);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function loadAgents() {
      try {
        const snapshot = await getDocs(collection(db, 'agents'));
        const list: AgentInfo[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({ id: d.id, name: data.name, email: data.email });
        });
        setAgents(list);
      } catch (err) {
        console.error('Failed to load agents', err);
      }
    }
    loadAgents();
  }, []);

  /* ================================================================ */
  /*  Computed metrics                                                 */
  /* ================================================================ */

  const selectedSurvey = activeSurveys.find((s) => s.id === selectedSurveyId);
  const currentPeriodId = selectedSurvey
    ? getCurrentPeriodId(selectedSurvey.frequency)
    : '';

  const currentPeriodResponses = useMemo(
    () =>
      surveyResponses.filter(
        (r) => r.surveyId === selectedSurveyId && r.periodId === currentPeriodId,
      ),
    [surveyResponses, selectedSurveyId, currentPeriodId],
  );

  const allSurveyResponsesForSelected = useMemo(
    () => surveyResponses.filter((r) => r.surveyId === selectedSurveyId),
    [surveyResponses, selectedSurveyId],
  );

  const responseRate = agents.length > 0
    ? Math.round((currentPeriodResponses.length / agents.length) * 100)
    : 0;

  const npsScores = useMemo(() => {
    const npsQ = selectedSurvey?.questions.find((q) => q.type === 'nps');
    if (!npsQ) return [];
    return currentPeriodResponses
      .map((r) => r.answers[npsQ.id])
      .filter((a) => a !== undefined && a !== null)
      .map(Number);
  }, [selectedSurvey, currentPeriodResponses]);

  const npsScore = computeNps(npsScores);

  const avgSatisfaction = useMemo(() => {
    const satQ = selectedSurvey?.questions.find(
      (q) => q.id === 'overall-satisfaction',
    );
    if (!satQ) return null;
    const vals = currentPeriodResponses
      .map((r) => r.answers[satQ.id])
      .filter((a) => a !== undefined && a !== null)
      .map(Number);
    if (vals.length === 0) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }, [selectedSurvey, currentPeriodResponses]);

  /* Agents who responded this period vs not */
  const respondedUids = new Set(currentPeriodResponses.map((r) => r.agentUid));
  const respondedAgents = agents.filter((a) => respondedUids.has(a.id));
  const notRespondedAgents = agents.filter((a) => !respondedUids.has(a.id));

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

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'surveys', label: 'Survey Results' },
    { key: 'bugs', label: 'Bug Reports' },
    { key: 'agents', label: 'Agent Activity' },
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
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <img src="/logo.png" alt="Logo" className="w-11 h-7 object-contain" />
          <span
            className={`ml-3 text-white text-lg whitespace-nowrap overflow-hidden transition-all duration-300 brand-title ${
              sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}
          >
            AgentForLife
          </span>
        </div>

        <nav className="mt-4 px-2 space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Dashboard
            </span>
          </button>

          {/* Resources */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Resources
            </span>
          </button>

          {/* Feedback */}
          <button
            onClick={() => router.push('/dashboard/feedback')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Feedback
            </span>
          </button>

          {/* Applications */}
          <button
            onClick={() => router.push('/dashboard/admin/applications')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Applications
            </span>
          </button>

          {/* Analytics (active) */}
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 bg-[#daf3f0] text-[#005851]">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Analytics
            </span>
          </button>

          {/* Settings */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
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
            <span className="text-[#707070] font-medium">
              Feedback Analytics
            </span>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* Period selector */}
          {activeSurveys.length > 1 && (
            <div className="mb-6">
              <select
                value={selectedSurveyId}
                onChange={(e) => setSelectedSurveyId(e.target.value)}
                className="border border-[#d0d0d0] rounded-lg px-4 py-2 text-sm text-[#2D3748] bg-white focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]"
              >
                {activeSurveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period badge */}
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 bg-white border border-[#d0d0d0] rounded-full px-4 py-1.5 text-sm text-[#707070]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Current period: <span className="font-medium text-[#0D4D4D]">{currentPeriodId}</span>
            </span>
          </div>

          {/* ======================================================== */}
          {/*  Tabs                                                     */}
          {/* ======================================================== */}
          <div className="flex gap-1 border-b border-[#d0d0d0] mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
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

          {/* ======================================================== */}
          {/*  Overview Tab                                             */}
          {/* ======================================================== */}
          {activeTab === 'overview' && (
            <div>
              {/* Stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Response Rate"
                  value={`${responseRate}%`}
                  subtext={`${currentPeriodResponses.length} of ${agents.length} agents`}
                  valueColor={
                    responseRate >= 70
                      ? 'text-emerald-600'
                      : responseRate >= 40
                      ? 'text-yellow-600'
                      : 'text-red-500'
                  }
                />
                <StatCard
                  label="NPS Score"
                  value={npsScores.length > 0 ? npsScore : '—'}
                  subtext={
                    npsScores.length > 0
                      ? npsLabel(npsScore)
                      : 'No responses yet'
                  }
                  valueColor={npsScores.length > 0 ? npsColor(npsScore) : undefined}
                />
                <StatCard
                  label="Avg Satisfaction"
                  value={avgSatisfaction || '—'}
                  subtext={avgSatisfaction ? 'out of 5' : 'No responses yet'}
                />
                <StatCard
                  label="Bug Reports"
                  value={bugReports.length}
                  subtext="all time"
                />
              </div>

              {/* Quick survey snapshot */}
              {selectedSurvey && currentPeriodResponses.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 mb-6">
                  <h3 className="text-lg font-bold text-[#0D4D4D] mb-4">
                    This Week&apos;s Highlights
                  </h3>
                  <div className="divide-y divide-[#f0f0f0]">
                    {selectedSurvey.questions
                      .filter((q) => q.type === 'nps' || q.type === 'rating')
                      .map((q) => (
                        <QuestionResult
                          key={q.id}
                          question={q}
                          responses={currentPeriodResponses}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Not responded */}
              {notRespondedAgents.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6">
                  <h3 className="text-lg font-bold text-[#0D4D4D] mb-3">
                    Haven&apos;t Responded Yet
                    <span className="text-[#a0a0a0] font-normal text-sm ml-2">
                      ({notRespondedAgents.length})
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {notRespondedAgents.map((a) => (
                      <span
                        key={a.id}
                        className="bg-red-50 text-red-700 text-sm px-3 py-1.5 rounded-full"
                      >
                        {a.name || a.email || a.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/*  Survey Results Tab                                       */}
          {/* ======================================================== */}
          {activeTab === 'surveys' && selectedSurvey && (
            <div className="max-w-3xl">
              <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-[#0D4D4D]">
                      {selectedSurvey.title}
                    </h3>
                    <p className="text-sm text-[#707070] mt-1">
                      {currentPeriodResponses.length} response
                      {currentPeriodResponses.length !== 1 ? 's' : ''} this
                      period &middot; {allSurveyResponsesForSelected.length}{' '}
                      all time
                    </p>
                  </div>
                </div>

                {currentPeriodResponses.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[#a0a0a0] text-base">
                      No responses for this period yet.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#f0f0f0]">
                    {selectedSurvey.questions.map((q) => (
                      <QuestionResult
                        key={q.id}
                        question={q}
                        responses={currentPeriodResponses}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/*  Bug Reports Tab                                          */}
          {/* ======================================================== */}
          {activeTab === 'bugs' && (
            <div className="max-w-3xl">
              {bugReports.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-8 text-center">
                  <p className="text-[#a0a0a0] text-base">
                    No bug reports yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bugReports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-5"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-[#0D4D4D] text-white text-xs font-medium px-2.5 py-1 rounded-full">
                            {PRODUCT_AREA_LABELS[report.productArea] ||
                              report.productArea}
                          </span>
                          <span className="bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
                            {ISSUE_TYPE_LABELS[report.issueType] ||
                              report.issueType}
                          </span>
                        </div>
                        <span className="text-xs text-[#a0a0a0] shrink-0">
                          {timeAgo(report.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-[#2D3748] leading-relaxed mb-2">
                        {report.description}
                      </p>
                      <p className="text-xs text-[#a0a0a0]">
                        {report.agentName} &middot; {report.agentEmail}
                      </p>
                      {report.screenshotUrl && (
                        <a
                          href={report.screenshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs text-[#3DD6C3] hover:underline"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          View screenshot
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/*  Agent Activity Tab                                       */}
          {/* ======================================================== */}
          {activeTab === 'agents' && (
            <div className="max-w-3xl">
              {/* Responded */}
              <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 mb-6">
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                  Responded This Period
                  <span className="text-[#a0a0a0] font-normal text-sm">
                    ({respondedAgents.length})
                  </span>
                </h3>
                {respondedAgents.length === 0 ? (
                  <p className="text-sm text-[#a0a0a0]">
                    No responses this period yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#f0f0f0]">
                    {respondedAgents.map((a) => {
                      const response = currentPeriodResponses.find(
                        (r) => r.agentUid === a.id,
                      );
                      return (
                        <div
                          key={a.id}
                          className="py-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-[#2D3748]">
                              {a.name || 'Unnamed Agent'}
                            </p>
                            <p className="text-xs text-[#a0a0a0]">
                              {a.email}
                            </p>
                          </div>
                          <span className="text-xs text-[#a0a0a0]">
                            {timeAgo(response?.completedAt || null)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Not responded */}
              <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6">
                <h3 className="text-lg font-bold text-[#0D4D4D] mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-red-400 rounded-full" />
                  Not Yet Responded
                  <span className="text-[#a0a0a0] font-normal text-sm">
                    ({notRespondedAgents.length})
                  </span>
                </h3>
                {notRespondedAgents.length === 0 ? (
                  <p className="text-sm text-emerald-600 font-medium">
                    Everyone has responded! Great participation.
                  </p>
                ) : (
                  <div className="divide-y divide-[#f0f0f0]">
                    {notRespondedAgents.map((a) => (
                      <div key={a.id} className="py-3">
                        <p className="text-sm font-medium text-[#2D3748]">
                          {a.name || 'Unnamed Agent'}
                        </p>
                        <p className="text-xs text-[#a0a0a0]">{a.email}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
