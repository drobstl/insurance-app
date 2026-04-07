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
import {
  ACTIVE_SURVEYS,
  ISSUE_TYPES,
  PRODUCT_AREAS,
  getCurrentPeriodId,
  surveyResponseDocId,
} from '../../../lib/feedback-config';
import type { Survey, SurveyQuestion } from '../../../lib/feedback-config';
import { isAdminEmail } from '../../../lib/admin';

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

type FeedbackTab = 'surveys' | 'features' | 'problems';

/* ------------------------------------------------------------------ */
/*  Star Rating Component                                              */
/* ------------------------------------------------------------------ */

function StarRating({
  value,
  onChange,
  scale = 5,
}: {
  value: number;
  onChange: (v: number) => void;
  scale?: number;
}) {
  const [hovered, setHovered] = useState(0);
  const stars = Array.from({ length: scale }, (_, i) => i + 1);

  return (
    <div className="flex gap-1">
      {stars.map((star) => (
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
/*  NPS Rating Component (0-10)                                        */
/* ------------------------------------------------------------------ */

function NpsRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex gap-1 sm:gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
          let selectedClass = '';
          if (value === n) {
            if (n <= 6) selectedClass = 'bg-red-500 text-white ring-2 ring-red-300';
            else if (n <= 8) selectedClass = 'bg-yellow-500 text-white ring-2 ring-yellow-300';
            else selectedClass = 'bg-emerald-500 text-white ring-2 ring-emerald-300';
          }
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-8 h-10 sm:w-10 sm:h-10 rounded-lg text-sm font-bold transition-all ${
                selectedClass || 'bg-[#F8F9FA] text-[#707070] hover:bg-gray-200'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-[#a0a0a0]">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Survey Question Renderer                                           */
/* ------------------------------------------------------------------ */

function QuestionRenderer({
  question,
  value,
  onChange,
  index,
}: {
  question: SurveyQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  index: number;
}) {
  return (
    <div className="py-5 first:pt-0">
      <label className="block text-sm font-semibold text-[#0D4D4D] mb-3">
        <span className="text-[#a0a0a0] mr-2">{index + 1}.</span>
        {question.text}
        {question.required && <span className="text-red-400 ml-1">*</span>}
        {!question.required && (
          <span className="text-[#a0a0a0] ml-2 font-normal">(Optional)</span>
        )}
      </label>

      {question.type === 'rating' && (
        <StarRating
          value={(value as number) || 0}
          onChange={(v) => onChange(v)}
          scale={question.scale || 5}
        />
      )}

      {question.type === 'nps' && (
        <NpsRating
          value={value as number | null}
          onChange={(v) => onChange(v)}
        />
      )}

      {question.type === 'multiple_choice' && question.options &&
        (question.multipleSelect ? (
          (() => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            const exclusiveOption = "I didn't use it much this week";
            const handleToggle = (option: string) => {
              const isChecked = selected.includes(option);
              if (option === exclusiveOption) {
                if (isChecked) {
                  onChange([]);
                } else {
                  onChange([option]);
                }
              } else {
                if (isChecked) {
                  onChange(selected.filter((o) => o !== option));
                } else {
                  onChange([
                    ...selected.filter((o) => o !== exclusiveOption),
                    option,
                  ]);
                }
              }
            };
            return (
              <div className="space-y-2">
                {question.options.map((option) => {
                  const isChecked = selected.includes(option);
                  return (
                    <div
                      key={option}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isChecked}
                      onClick={(e) => {
                        e.preventDefault();
                        handleToggle(option);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggle(option);
                        }
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all select-none ${
                        isChecked
                          ? 'border-[#3DD6C3] bg-[#3DD6C3]/5'
                          : 'border-[#d0d0d0] hover:border-[#3DD6C3]/50'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isChecked
                            ? 'border-[#3DD6C3] bg-[#3DD6C3]'
                            : 'border-[#d0d0d0]'
                        }`}
                      >
                        {isChecked && (
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-[#2D3748]">{option}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          (() => {
            const selectedOption =
              typeof value === 'object' && value && 'option' in value
                ? (value as { option: string }).option
                : (value as string);
            const otherText =
              typeof value === 'object' && value && 'otherText' in value
                ? (value as { otherText: string }).otherText || ''
                : '';
            const followUpText =
              typeof value === 'object' && value && 'followUpText' in value
                ? (value as { followUpText: string }).followUpText || ''
                : '';
            return (
              <div className="space-y-2">
                {question.options.map((option) => (
                  <label
                    key={option}
                    onClick={() =>
                      option === 'Other'
                        ? onChange({ option: 'Other', otherText })
                        : question.followUpWhen && option === question.followUpWhen
                          ? onChange({ option, followUpText })
                          : onChange(option)
                    }
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                      selectedOption === option
                        ? 'border-[#3DD6C3] bg-[#3DD6C3]/5'
                        : 'border-[#d0d0d0] hover:border-[#3DD6C3]/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      checked={selectedOption === option}
                      onChange={() =>
                        option === 'Other'
                          ? onChange({ option: 'Other', otherText })
                          : question.followUpWhen && option === question.followUpWhen
                            ? onChange({ option, followUpText })
                            : onChange(option)
                      }
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selectedOption === option
                          ? 'border-[#3DD6C3]'
                          : 'border-[#d0d0d0]'
                      }`}
                    >
                      {selectedOption === option && (
                        <div className="w-2 h-2 rounded-full bg-[#3DD6C3]" />
                      )}
                    </div>
                    <span className="text-sm text-[#2D3748]">{option}</span>
                  </label>
                ))}
                {question.allowOther && selectedOption === 'Other' && (
                  <div className="mt-3 pl-7">
                    <input
                      type="text"
                      value={otherText}
                      onChange={(e) =>
                        onChange({
                          option: 'Other',
                          otherText: e.target.value,
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                      placeholder="What feature?"
                      className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent"
                    />
                  </div>
                )}
                {question.followUpWhen &&
                  question.followUpPlaceholder &&
                  selectedOption === question.followUpWhen && (
                    <div className="mt-3 pl-7">
                      <input
                        type="text"
                        value={followUpText}
                        onChange={(e) =>
                          onChange({
                            option: selectedOption,
                            followUpText: e.target.value,
                          })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder={question.followUpPlaceholder}
                        className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent"
                      />
                    </div>
                  )}
              </div>
            );
          })()
        ))}

      {question.type === 'text' && (
        <textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Share your thoughts..."
          rows={3}
          className="w-full border border-[#d0d0d0] rounded-lg px-4 py-3 text-base text-[#2D3748] placeholder:text-[#a0a0a0] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3] focus:border-transparent resize-none"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Survey Card                                                        */
/* ------------------------------------------------------------------ */

function SurveyCard({
  survey,
  completed,
  answers,
  onAnswerChange,
  onSubmit,
  submitting,
}: {
  survey: Survey;
  completed: boolean;
  answers: Record<string, unknown>;
  onAnswerChange: (questionId: string, value: unknown) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  if (completed) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[#3DD6C3]"
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
          <div>
            <h3 className="text-lg font-bold text-[#0D4D4D]">{survey.title}</h3>
            <p className="text-sm text-[#3DD6C3] font-medium">
              Completed this week — thank you!
            </p>
          </div>
        </div>
      </div>
    );
  }

  const requiredQuestions = survey.questions.filter((q) => q.required);
  const allRequiredAnswered = requiredQuestions.every((q) => {
    const a = answers[q.id];
    if (a === undefined || a === null || a === '') return false;
    if (q.type === 'rating' && a === 0) return false;
    if (
      q.type === 'multiple_choice' &&
      q.multipleSelect &&
      Array.isArray(a)
    ) {
      return a.length > 0;
    }
    if (
      q.type === 'multiple_choice' &&
      typeof a === 'object' &&
      a &&
      'option' in a
    ) {
      return !!(a as { option: string }).option;
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-6 sm:p-8">
      <h3 className="text-xl font-bold text-[#0D4D4D] mb-1">{survey.title}</h3>
      <p className="text-sm text-[#707070] mb-6">{survey.description}</p>

      <div className="divide-y divide-[#f0f0f0]">
        {survey.questions.map((question, i) => (
          <QuestionRenderer
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(v) => onAnswerChange(question.id, v)}
            index={i}
          />
        ))}
      </div>

      <button
        onClick={onSubmit}
        disabled={submitting || !allRequiredAnswered}
        className="mt-6 w-full sm:w-auto min-h-[44px] px-8 bg-[#3DD6C3] hover:bg-[#32c4b2] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-base"
      >
        {submitting ? 'Submitting...' : 'Submit Survey'}
      </button>
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
  const [activeTab, setActiveTab] = useState<FeedbackTab>('surveys');

  /* ---- Surveys ---- */
  const [surveyAnswers, setSurveyAnswers] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [completedSurveys, setCompletedSurveys] = useState<Set<string>>(
    new Set(),
  );
  const [surveySubmitting, setSurveySubmitting] = useState(false);

  /* ---- Feature Ideas ---- */
  const [featureIdea, setFeatureIdea] = useState('');
  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [featureIdeas, setFeatureIdeas] = useState<FeatureIdea[]>([]);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());

  /* ---- Bug Report ---- */
  const [bugProductArea, setBugProductArea] = useState('');
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
  /*  Survey completion check                                          */
  /* ================================================================ */

  useEffect(() => {
    if (!user) return;
    const activeSurveys = ACTIVE_SURVEYS.filter((s) => s.active);
    let cancelled = false;

    async function checkCompletions() {
      const completed = new Set<string>();
      for (const survey of activeSurveys) {
        const periodId = getCurrentPeriodId(survey.frequency);
        const docId = surveyResponseDocId(survey.id, periodId, user!.uid);
        try {
          const snap = await getDoc(doc(db, 'surveyResponses', docId));
          if (snap.exists()) {
            completed.add(survey.id);
          }
        } catch (err) {
          console.error('Failed to check survey completion', err);
        }
      }
      if (!cancelled) setCompletedSurveys(completed);
    }

    checkCompletions();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
  /*  Submit handlers                                                  */
  /* ================================================================ */

  const handleSurveySubmit = useCallback(
    async (survey: Survey) => {
      if (!user) return;
      setSurveySubmitting(true);
      setSubmitError('');
      try {
        const periodId = getCurrentPeriodId(survey.frequency);
        const docId = surveyResponseDocId(survey.id, periodId, user.uid);
        const answers = surveyAnswers[survey.id] || {};

        await setDoc(doc(db, 'surveyResponses', docId), {
          surveyId: survey.id,
          periodId,
          agentUid: user.uid,
          agentName:
            agentProfile.name || user.displayName || 'Unknown',
          agentEmail: agentProfile.email || user.email || 'Unknown',
          answers,
          completedAt: serverTimestamp(),
        });

        setCompletedSurveys((prev) => new Set([...prev, survey.id]));
        setSurveyAnswers((prev) => {
          const next = { ...prev };
          delete next[survey.id];
          return next;
        });
      } catch (e: unknown) {
        setSubmitError(
          e instanceof Error ? e.message : 'Something went wrong',
        );
      } finally {
        setSurveySubmitting(false);
      }
    },
    [user, agentProfile, surveyAnswers],
  );

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
      setFeatureIdea('');
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : 'Something went wrong',
      );
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
    if (!bugType || !bugDescription.trim() || !user) return;
    setBugSubmitting(true);
    setSubmitError('');
    try {
      let screenshotUrl = '';
      if (bugFile) {
        const fileRef = ref(
          storage,
          `feedback-screenshots/${user.uid}/${Date.now()}_${bugFile.name}`,
        );
        const snapshot = await uploadBytes(fileRef, bugFile);
        screenshotUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(db, 'bugReports'), {
        agentUid: user.uid,
        agentName:
          agentProfile.name || user.displayName || 'Unknown',
        agentEmail: agentProfile.email || user.email || 'Unknown',
        productArea: bugProductArea || 'general',
        issueType: bugType,
        description: bugDescription,
        screenshotUrl,
        createdAt: serverTimestamp(),
      });

      setBugSubmitted(true);
      setBugProductArea('');
      setBugType('');
      setBugDescription('');
      setBugFile(null);
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : 'Something went wrong',
      );
    } finally {
      setBugSubmitting(false);
    }
  };

  /* ================================================================ */
  /*  Derived                                                          */
  /* ================================================================ */

  const activeSurveys = ACTIVE_SURVEYS.filter((s) => s.active);
  const pendingSurveyCount = activeSurveys.filter(
    (s) => !completedSurveys.has(s.id),
  ).length;

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

  const tabs: { key: FeedbackTab; label: string; badge?: number }[] = [
    {
      key: 'surveys',
      label: 'Surveys',
      badge: pendingSurveyCount > 0 ? pendingSurveyCount : undefined,
    },
    { key: 'features', label: 'Feature Ideas' },
    { key: 'problems', label: 'Report a Problem' },
  ];

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      <div className="flex-1 ml-0 flex flex-col min-h-screen">
        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* ======================================================== */}
          {/*  Founding Member Banner                                   */}
          {/* ======================================================== */}
          <div className="bg-[#0D4D4D] rounded-xl px-6 py-4 mb-6">
            <p className="text-white text-base font-semibold">
              Founding Member Program — Your feedback directly shapes
              AgentForLife. Thank you for building this with us.
            </p>
            <p className="text-white/70 text-sm mt-1">
              Founding members who provide weekly feedback keep lifetime free
              access.
            </p>
          </div>

          {/* ======================================================== */}
          {/*  Pending Survey Nudge                                     */}
          {/* ======================================================== */}
          {activeTab !== 'surveys' && pendingSurveyCount > 0 && (
            <button
              onClick={() => setActiveTab('surveys')}
              className="w-full bg-[#3DD6C3]/10 border border-[#3DD6C3]/30 rounded-lg px-4 py-3 mb-6 flex items-center gap-3 hover:bg-[#3DD6C3]/15 transition-colors text-left"
            >
              <span className="w-2.5 h-2.5 bg-[#3DD6C3] rounded-full animate-pulse shrink-0" />
              <span className="text-sm font-medium text-[#0D4D4D]">
                You have {pendingSurveyCount} pending survey
                {pendingSurveyCount > 1 ? 's' : ''} — tap here to complete{' '}
                {pendingSurveyCount > 1 ? 'them' : 'it'}
              </span>
            </button>
          )}

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
                className={`px-4 sm:px-5 py-3 text-sm sm:text-base font-semibold transition-colors relative flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'text-[#0D4D4D]'
                    : 'text-[#707070] hover:text-[#005851]'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="w-5 h-5 bg-[#3DD6C3] text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
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
          {/*  Tab 1: Surveys                                           */}
          {/* ======================================================== */}
          {activeTab === 'surveys' && (
            <div className="max-w-2xl space-y-6">
              {activeSurveys.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-[#d0d0d0] p-8 text-center">
                  <p className="text-[#707070] text-base">
                    No active surveys right now. Check back soon!
                  </p>
                </div>
              ) : (
                activeSurveys.map((survey) => (
                  <SurveyCard
                    key={survey.id}
                    survey={survey}
                    completed={completedSurveys.has(survey.id)}
                    answers={surveyAnswers[survey.id] || {}}
                    onAnswerChange={(questionId, value) => {
                      setSurveyAnswers((prev) => ({
                        ...prev,
                        [survey.id]: {
                          ...(prev[survey.id] || {}),
                          [questionId]: value,
                        },
                      }));
                    }}
                    onSubmit={() => handleSurveySubmit(survey)}
                    submitting={surveySubmitting}
                  />
                ))
              )}

              {activeSurveys.length > 0 &&
                activeSurveys.every((s) => completedSurveys.has(s.id)) && (
                  <div className="bg-[#3DD6C3]/5 border border-[#3DD6C3]/20 rounded-xl px-6 py-5 text-center">
                    <p className="text-[#0D4D4D] font-semibold">
                      You&apos;re all caught up!
                    </p>
                    <p className="text-sm text-[#707070] mt-1">
                      New surveys appear weekly. Thanks for staying engaged.
                    </p>
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
                          fill={
                            userVotes.has(idea.id) ? 'currentColor' : 'none'
                          }
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
                  {/* Product area */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#0D4D4D] mb-2">
                      Which part of the product?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PRODUCT_AREAS.map((area) => (
                        <button
                          key={area.value}
                          type="button"
                          onClick={() => setBugProductArea(area.value)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                            bugProductArea === area.value
                              ? 'border-[#3DD6C3] bg-[#3DD6C3]/10 text-[#0D4D4D]'
                              : 'border-[#d0d0d0] bg-white text-[#707070] hover:border-[#3DD6C3]/50'
                          }`}
                        >
                          {area.label}
                        </button>
                      ))}
                    </div>
                  </div>

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
