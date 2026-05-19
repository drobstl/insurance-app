import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { LeadAssessmentQuestion } from '../lib/leadHomeContent';

interface Props {
  questions: LeadAssessmentQuestion[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

/**
 * Multi-question multiple-choice assessment for the lead-home screen.
 * One question per screen with progress indicator. Locked sequential
 * advance — leads can't skip ahead, but they can go back.
 *
 * Submission errors keep the user on the final screen so they can retry
 * without losing their answers.
 */
export default function LeadAssessment({ questions, onSubmit, onCancel }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const total = questions.length;
  const current = questions[index];
  const isLast = index === total - 1;

  const handleChoice = (choiceId: string) => {
    if (!current) return;
    const next = { ...answers, [current.id]: choiceId };
    setAnswers(next);
    if (isLast) {
      void submit(next);
    } else {
      setIndex(index + 1);
    }
  };

  const submit = async (final: Record<string, string>) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(final);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed — try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={styles.doneContainer}>
        <Text style={styles.doneCheck}>✓</Text>
        <Text style={styles.doneTitle}>Thanks for taking that.</Text>
        <Text style={styles.doneBody}>
          Your agent will review your answers before your call so you don&apos;t have
          to cover the basics again.
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={onCancel} activeOpacity={0.8}>
          <Text style={styles.doneButtonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!current) return null;

  return (
    <View style={styles.outerContainer}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <Text style={styles.cancelText}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.progressText}>{index + 1} of {total}</Text>
      </View>

      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.question}>{current.prompt}</Text>

        <View style={styles.choices}>
          {current.choices.map((choice) => {
            const selected = answers[current.id] === choice.id;
            return (
              <TouchableOpacity
                key={choice.id}
                style={[styles.choiceButton, selected && styles.choiceButtonSelected]}
                onPress={() => handleChoice(choice.id)}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                  {choice.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {index > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setIndex(index - 1)}
            disabled={submitting}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void submit(answers)} disabled={submitting}>
              <Text style={styles.errorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
    borderRadius: 2,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#3DD6C3',
    borderRadius: 2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  question: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D4D4D',
    lineHeight: 32,
    marginBottom: 32,
  },
  choices: {
    gap: 12,
  },
  choiceButton: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  choiceButtonSelected: {
    borderColor: '#3DD6C3',
    backgroundColor: '#F0FAF8',
  },
  choiceText: {
    fontSize: 17,
    color: '#374151',
    fontWeight: '600',
    textAlign: 'center',
  },
  choiceTextSelected: {
    color: '#0D4D4D',
  },
  backButton: {
    marginTop: 24,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backButtonText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 24,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 14,
  },
  errorRetry: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFFFFF',
  },
  doneCheck: {
    fontSize: 64,
    color: '#3DD6C3',
    marginBottom: 16,
  },
  doneTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 12,
    textAlign: 'center',
  },
  doneBody: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#3DD6C3',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
