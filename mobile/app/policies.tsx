import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Policy {
  id: string;
  policyType: string;
  policyNumber: string;
  insuranceCompany?: string;
  policyOwner?: string;
  beneficiary?: string;
  coverageAmount: number;
  premiumAmount: number;
  renewalDate?: string;
  amountOfProtection?: number;
  protectionUnit?: 'months' | 'years';
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

export default function PoliciesScreen() {
  const params = useLocalSearchParams<{
    agentId: string;
    clientId: string;
    clientName: string;
  }>();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const policiesRef = collection(
        db,
        'agents',
        params.agentId,
        'clients',
        params.clientId,
        'policies'
      );
      const q = query(policiesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const policyList: Policy[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Policy));

      setPolicies(policyList);
    } catch (err) {
      console.error('Error fetching policies:', err);
      setError('Unable to load policies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Active':
        return { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
      case 'Pending':
        return { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
      case 'Lapsed':
        return { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
      default:
        return { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' };
    }
  };

  const getPolicyIcon = (type: string) => {
    switch (type) {
      case 'IUL':
        return '📈';
      case 'Term Life':
        return '⏱️';
      case 'Whole Life':
        return '🛡️';
      case 'Mortgage Protection':
        return '🏠';
      default:
        return '📄';
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Loading policies...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Policies</Text>
          <Text style={styles.headerSubtitle}>{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchPolicies}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : policies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>No Policies Yet</Text>
            <Text style={styles.emptyText}>
              Your policies will appear here once your agent adds them.
            </Text>
          </View>
        ) : (
          <View style={styles.policyList}>
            {policies.map((policy) => {
              const statusStyle = getStatusStyle(policy.status);
              return (
                <View key={policy.id} style={styles.policyCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.policyTypeContainer}>
                      <Text style={styles.policyIcon}>{getPolicyIcon(policy.policyType)}</Text>
                      <View>
                        <Text style={styles.policyType}>{policy.policyType}</Text>
                        <Text style={styles.policyNumber}>#{policy.policyNumber}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
                      <Text style={[styles.statusText, { color: statusStyle.color }]}>
                        {policy.status}
                      </Text>
                    </View>
                  </View>

                  {/* Card Body */}
                  <View style={styles.cardBody}>
                    {/* Insurance Company */}
                    {policy.insuranceCompany && (
                      <View style={styles.insuranceCompanyRow}>
                        <Text style={styles.detailLabel}>Insurance Company</Text>
                        <Text style={styles.insuranceCompanyValue}>{policy.insuranceCompany}</Text>
                      </View>
                    )}

                    {/* Amount of Protection for Mortgage Protection */}
                    {policy.policyType === 'Mortgage Protection' && policy.amountOfProtection && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Amount of Protection</Text>
                        <Text style={styles.detailValueLarge}>
                          {policy.amountOfProtection} {policy.protectionUnit === 'months' ? 'Months' : 'Years'}
                        </Text>
                      </View>
                    )}

                    {/* Renewal Date for Term Life */}
                    {policy.policyType === 'Term Life' && policy.renewalDate && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Renewal Date</Text>
                        <Text style={styles.detailValue}>{formatDate(policy.renewalDate)}</Text>
                      </View>
                    )}

                    <View style={styles.amountGrid}>
                      <View style={styles.amountItem}>
                        <Text style={styles.amountLabel}>Death Benefit</Text>
                        <Text style={styles.amountValue}>{formatCurrency(policy.coverageAmount)}</Text>
                      </View>
                      <View style={styles.amountDivider} />
                      <View style={styles.amountItem}>
                        <Text style={styles.amountLabel}>Premium</Text>
                        <Text style={styles.amountValue}>{formatCurrency(policy.premiumAmount)}/mo</Text>
                      </View>
                    </View>

                    {/* Owner & Beneficiary */}
                    {(policy.policyOwner || policy.beneficiary) && (
                      <View style={styles.ownerSection}>
                        {policy.policyOwner && (
                          <View style={styles.ownerItem}>
                            <Text style={styles.ownerLabel}>Owner</Text>
                            <Text style={styles.ownerValue}>{policy.policyOwner}</Text>
                          </View>
                        )}
                        {policy.beneficiary && (
                          <View style={styles.ownerItem}>
                            <Text style={styles.ownerLabel}>Beneficiary</Text>
                            <Text style={styles.ownerValue}>{policy.beneficiary}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#94a3b8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backArrow: {
    fontSize: 24,
    color: '#f8fafc',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  scrollContent: {
    padding: 20,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#f87171',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  policyList: {
    gap: 16,
  },
  policyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  policyTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  policyIcon: {
    fontSize: 28,
  },
  policyType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  policyNumber: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    padding: 16,
  },
  insuranceCompanyRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  insuranceCompanyValue: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '600',
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '500',
  },
  detailValueLarge: {
    fontSize: 18,
    color: '#10b981',
    fontWeight: '600',
  },
  amountGrid: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  amountItem: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  amountDivider: {
    width: 1,
    backgroundColor: '#334155',
  },
  amountLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  amountValue: {
    fontSize: 18,
    color: '#f8fafc',
    fontWeight: '700',
  },
  ownerSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    flexDirection: 'row',
    gap: 24,
  },
  ownerItem: {
    flex: 1,
  },
  ownerLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ownerValue: {
    fontSize: 14,
    color: '#cbd5e1',
    fontWeight: '500',
  },
});

