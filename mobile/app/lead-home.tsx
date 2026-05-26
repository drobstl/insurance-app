import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getSession,
  clearSession,
  lookupClientCode,
  saveSession,
  saveProfileCache,
  navigateToProfile,
} from './index';
import LeadAssessment from '../components/LeadAssessment';
import {
  fetchLeadHomeContent,
  submitLeadAssessment,
  type LeadHomeContent,
  type LeadVideoSlot,
} from '../lib/leadHomeContent';

const getParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getFirstName = (fullName: string | undefined): string => {
  if (!fullName) return 'there';
  return fullName.split(' ')[0] || 'there';
};

/**
 * Lead-home screen.
 *
 * Different from /agent-profile (the client-facing screen) — this is for
 * pre-clients who got a code from their agent before the appointment but
 * haven't been sold a policy yet. Goal: indoctrination (intro video + 7-10
 * question assessment + objection-busting FAQ videos + case-study videos)
 * so the agent isn't a stranger and objections are softened on the call.
 *
 * Routing: reached via mobile/app/index.tsx::navigateToProfile when
 * `accessType === 'lead'`. The lead's `clientCode` (an `L…` code) is in
 * SecureStore as part of the saved session — that's also what the
 * assessment POST uses for auth (no Firebase user; lead accounts are
 * code-only).
 */
export default function LeadHomeScreen() {
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    agentName?: string | string[];
    agentPhotoBase64?: string | string[];
    agencyName?: string | string[];
    clientName?: string | string[];   // = lead's name (carried in the existing param channel)
  }>();

  const agentId = getParamValue(params.agentId).trim();
  const agentName = getParamValue(params.agentName);
  const agentFirstName = getFirstName(agentName);
  const agentPhotoBase64 = getParamValue(params.agentPhotoBase64);
  const agencyName = getParamValue(params.agencyName);
  const leadName = getParamValue(params.clientName);
  const leadFirstName = getFirstName(leadName);

  const [content, setContent] = useState<LeadHomeContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [leadCode, setLeadCode] = useState<string>('');

  const [showAssessment, setShowAssessment] = useState(false);
  const [activeVideo, setActiveVideo] = useState<LeadVideoSlot | null>(null);
  const [assessmentCompleted, setAssessmentCompleted] = useState(false);

  // ── Load session (for the lead code) + fetch content ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        if (cancelled) return;
        setLeadCode(session?.clientCode || '');
        if (!agentId) {
          setContentError('Missing agent context — please re-enter your code.');
          setContentLoading(false);
          return;
        }
        const c = await fetchLeadHomeContent(agentId);
        if (!cancelled) {
          setContent(c);
          setContentLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setContentError(err instanceof Error ? err.message : 'Failed to load content');
          setContentLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const handleSubmitAssessment = useCallback(async (answers: Record<string, string>) => {
    if (!leadCode) throw new Error('Missing lead code — please re-enter');
    await submitLeadAssessment(leadCode, answers);
    setAssessmentCompleted(true);
  }, [leadCode]);

  const handlePlayVideo = useCallback((slot: LeadVideoSlot) => {
    setActiveVideo(slot);
  }, []);

  const handleSignOut = useCallback(async () => {
    await clearSession();
    router.replace('/login' as never);
  }, []);

  // ── Live-flip polling: detect lead→client convert in real time ──
  //
  // While the prospect is on lead-home, the agent may click "Close the
  // Sale" on the dashboard. That stamps `convertedToClientId` on the
  // lead doc + creates a client doc. The mobile lookup endpoint follows
  // that redirect and returns `accessType: 'client'`. Polling that
  // endpoint every 10s lets us catch the flip without requiring the
  // prospect to force-quit and reopen the app — the agent's close-of-
  // sale verbal script becomes a smooth "you're all set, hit allow on
  // the notification prompt that just popped up" with no app gymnastics.
  //
  // Polling, not Firestore listener, because Firestore security rules
  // restrict `agents/{agentId}/leads/{leadId}` reads to the agent's
  // own auth — the mobile app isn't authenticated as the agent, so
  // direct onSnapshot would fail with permission-denied. The lookup
  // endpoint already handles the public-read auth model via rate limit
  // (10 req/min/IP); 10s polling stays well under the cap (6 req/min).
  //
  // Pauses when the app is backgrounded; resumes + immediately re-checks
  // on foreground (catches the case where convert happened while the
  // prospect was in another app).
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isForeground = true;

    const checkOnce = async () => {
      if (cancelled || !isForeground) return;
      try {
        const session = await getSession();
        if (!session?.clientCode || cancelled) return;
        const result = await lookupClientCode(session.clientCode);
        if (cancelled) return;
        // Convert detected: accessType flipped from 'lead' to anything
        // else (typically 'client'). Update cached session + profile,
        // then hand off to navigateToProfile — for a new client without
        // `clientActivatedAt`, that routes to /activate where the iOS
        // notification prompt fires for the first time.
        if (result.accessType && result.accessType !== 'lead') {
          await saveSession({
            clientCode: session.clientCode,
            agentId: result.agentId,
            clientId: result.clientId,
          });
          await saveProfileCache(result);
          navigateToProfile(
            result.agentId,
            result.clientId,
            result.clientData,
            result.agentData,
            result.accessType,
            result.linqLinePhone || '',
          );
        }
      } catch (err) {
        // Network blip or transient lookup failure — swallow and try
        // again on the next tick. A real failure mode (invalid code
        // post-convert, or a 4xx) doesn't recover from polling anyway.
        console.warn('[lead-home] live-flip poll failed:', err);
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        await checkOnce();
        if (!cancelled) scheduleNext();
      }, 10_000);
    };

    scheduleNext();

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const nowActive = next === 'active';
      if (nowActive && !isForeground) {
        isForeground = true;
        // Resumed from background — re-check immediately in case the
        // convert happened while we were paused.
        checkOnce();
      } else if (!nowActive && isForeground) {
        isForeground = false;
      }
    });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      appStateSub.remove();
    };
  }, []);

  const hasValidPhoto = agentPhotoBase64
    && agentPhotoBase64.length > 0
    && agentPhotoBase64 !== 'undefined'
    && agentPhotoBase64 !== 'null';
  const photoUri = hasValidPhoto ? `data:image/jpeg;base64,${agentPhotoBase64}` : null;

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Header card — agent identity */}
        <View style={styles.headerCard}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.agentPhoto} />
          ) : (
            <View style={[styles.agentPhoto, styles.agentPhotoPlaceholder]}>
              <Text style={styles.agentPhotoPlaceholderText}>
                {(agentName || 'A').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerTextBlock}>
            <Text style={styles.welcomeText}>Welcome, {leadFirstName}</Text>
            <Text style={styles.agentLine}>{agentName || 'Your agent'}</Text>
            {agencyName ? <Text style={styles.agencyLine}>{agencyName}</Text> : null}
          </View>
        </View>

        {/* MAIN VIDEO */}
        <View style={styles.section}>
          <VideoTile
            slot={content?.mainVideo || { title: 'Welcome — what to do next', url: '', durationSec: 0 }}
            big
            onPress={() => content?.mainVideo && handlePlayVideo(content.mainVideo)}
            disabled={!content?.mainVideo?.url}
          />
        </View>

        {/* STEP 1 — ASSESSMENT */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 1</Text>
          <TouchableOpacity
            style={[styles.assessmentCard, assessmentCompleted && styles.assessmentCardDone]}
            onPress={() => !assessmentCompleted && setShowAssessment(true)}
            disabled={assessmentCompleted || contentLoading || !content?.assessment?.length}
            activeOpacity={0.8}
          >
            <View style={styles.assessmentTextBlock}>
              <Text style={styles.assessmentTitle}>
                {assessmentCompleted ? 'Assessment complete ✓' : 'Quick assessment'}
              </Text>
              <Text style={styles.assessmentSubtitle}>
                {assessmentCompleted
                  ? `${agentFirstName} will review your answers before your call.`
                  : `${content?.assessment?.length || 10} quick questions so ${agentFirstName} doesn't have to ask the basics on the call.`}
              </Text>
            </View>
            {!assessmentCompleted && <Text style={styles.assessmentArrow}>→</Text>}
          </TouchableOpacity>
        </View>

        {/* STEP 2 — FAQ */}
        {content?.faqs && content.faqs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.stepLabel}>Step 2 · Common questions</Text>
            <View style={styles.faqRow}>
              {content.faqs.slice(0, 2).map((faq, i) => (
                <View key={faq.id || i} style={styles.faqCol}>
                  <VideoTile
                    slot={faq}
                    onPress={() => handlePlayVideo(faq)}
                    disabled={!faq.url}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* STEP 3 — CASE STUDIES */}
        {content?.caseStudies && content.caseStudies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.stepLabel}>Step 3 · Real conversations</Text>
            {content.caseStudies.map((cs, i) => (
              <View key={cs.id || i} style={styles.caseStudyWrap}>
                <VideoTile
                  slot={cs}
                  onPress={() => handlePlayVideo(cs)}
                  disabled={!cs.url}
                />
              </View>
            ))}
          </View>
        )}

        {contentLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#3DD6C3" />
          </View>
        )}
        {contentError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{contentError}</Text>
          </View>
        )}

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutLink}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Assessment modal */}
      <Modal visible={showAssessment} animationType="slide" presentationStyle="fullScreen">
        {content?.assessment && (
          <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <LeadAssessment
              questions={content.assessment}
              onSubmit={handleSubmitAssessment}
              onCancel={() => setShowAssessment(false)}
            />
          </SafeAreaView>
        )}
      </Modal>

      {/* Video modal — Phase 1 placeholder. Once a real player is wired
          (Chunk 3, expo-video), this swaps to inline playback. For now we
          open the URL in the system browser as a robust default. */}
      <Modal
        visible={Boolean(activeVideo)}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveVideo(null)}
      >
        <View style={styles.videoModalOverlay}>
          <View style={styles.videoModalCard}>
            <Text style={styles.videoModalTitle}>{activeVideo?.title}</Text>
            {activeVideo?.url ? (
              <>
                <Text style={styles.videoModalBody}>
                  Open this video in your browser?
                </Text>
                <TouchableOpacity
                  style={styles.videoModalPlayBtn}
                  onPress={() => {
                    if (activeVideo?.url) Linking.openURL(activeVideo.url).catch(() => {});
                    setActiveVideo(null);
                  }}
                >
                  <Text style={styles.videoModalPlayBtnText}>Play</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.videoModalBody}>
                Your agent hasn&apos;t recorded this video yet. Check back soon.
              </Text>
            )}
            <TouchableOpacity
              style={styles.videoModalCloseBtn}
              onPress={() => setActiveVideo(null)}
            >
              <Text style={styles.videoModalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function VideoTile({
  slot,
  big = false,
  onPress,
  disabled = false,
}: {
  slot: LeadVideoSlot;
  big?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.videoTile, big && styles.videoTileBig, disabled && styles.videoTileDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View style={styles.videoPlayBadge}>
        <Text style={styles.videoPlayBadgeText}>▶</Text>
      </View>
      <Text style={[styles.videoTitle, big && styles.videoTitleBig]} numberOfLines={2}>
        {slot.title || 'Video'}
      </Text>
      {disabled && <Text style={styles.videoComingSoon}>Coming soon</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 60,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FAF8',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  agentPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3DD6C3',
  },
  agentPhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentPhotoPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  headerTextBlock: {
    marginLeft: 14,
    flex: 1,
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D4D4D',
  },
  agentLine: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
  },
  agencyLine: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  section: {
    marginBottom: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3DD6C3',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  videoTile: {
    backgroundColor: '#0D4D4D',
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    justifyContent: 'flex-end',
  },
  videoTileBig: {
    minHeight: 180,
    padding: 20,
  },
  videoTileDisabled: {
    opacity: 0.65,
  },
  videoPlayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(61, 214, 195, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 16,
    left: 16,
  },
  videoPlayBadgeText: {
    color: '#0D4D4D',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 3,
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 'auto',
  },
  videoTitleBig: {
    fontSize: 17,
    fontWeight: '700',
  },
  videoComingSoon: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  assessmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3DD6C3',
    padding: 18,
    borderRadius: 16,
  },
  assessmentCardDone: {
    backgroundColor: '#F0FAF8',
  },
  assessmentTextBlock: {
    flex: 1,
  },
  assessmentTitle: {
    color: '#0D4D4D',
    fontSize: 17,
    fontWeight: '700',
  },
  assessmentSubtitle: {
    color: '#0D4D4D',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.85,
  },
  assessmentArrow: {
    color: '#0D4D4D',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 12,
  },
  faqRow: {
    flexDirection: 'row',
    gap: 12,
  },
  faqCol: {
    flex: 1,
  },
  caseStudyWrap: {
    marginBottom: 12,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 14,
  },
  signOutLink: {
    marginTop: 32,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  signOutText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 77, 77, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  videoModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  videoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 12,
  },
  videoModalBody: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 20,
    lineHeight: 22,
  },
  videoModalPlayBtn: {
    backgroundColor: '#3DD6C3',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  videoModalPlayBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  videoModalCloseBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  videoModalCloseBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
});
