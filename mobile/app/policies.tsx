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
        return { backgroundColor: '#D1FAE5', color: '#065F46', borderColor: '#3DD6C3' };
      case 'Pending':
        return { backgroundColor: '#FEF3C7', color: '#92400E', borderColor: '#F59E0B' };
      case 'Lapsed':
        return { backgroundColor: '#FEE2E2', color: '#991B1B', borderColor: '#EF4444' };
      default:
        return { backgroundColor: '#F3F4F6', color: '#4B5563', borderColor: '#D1D5DB' };
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
          <ActivityIndicator size="large" color="#3DD6C3" />
          <Text style={styles.loadingText}>Loading policies...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Dark Teal Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Policies</Text>
          <Text style={styles.headerSubtitle}>
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                      <View style={styles.policyIconContainer}>
                        <Text style={styles.policyIcon}>{getPolicyIcon(policy.policyType)}</Text>
                      </View>
                      <View>
                        <Text style={styles.policyType}>{policy.policyType}</Text>
                        <Text style={styles.policyNumber}>#{policy.policyNumber}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }]}>
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
                      <View style={styles.protectionHighlight}>
                        <Text style={styles.protectionLabel}>Amount of Protection</Text>
                        <Text style={styles.protectionValue}>
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
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 17,
    color: '#0D4D4D',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0D4D4D',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backArrow: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#3DD6C3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  policyList: {
    gap: 20,
  },
  policyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0D4D4D',
    shadowColor: '#0D4D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  policyTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  policyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  policyIcon: {
    fontSize: 24,
  },
  policyType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
  },
  policyNumber: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
  },
  insuranceCompanyRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  insuranceCompanyValue: {
    fontSize: 17,
    color: '#2D3748',
    fontWeight: '600',
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 17,
    color: '#2D3748',
    fontWeight: '600',
  },
  protectionHighlight: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#3DD6C3',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  protectionLabel: {
    fontSize: 12,
    color: '#0D4D4D',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  protectionValue: {
    fontSize: 26,
    color: '#0D4D4D',
    fontWeight: '700',
  },
  amountGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    overflow: 'hidden',
  },
  amountItem: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
  },
  amountDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  amountLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  amountValue: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '700',
  },
  ownerSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    gap: 20,
  },
  ownerItem: {
    flex: 1,
  },
  ownerLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  ownerValue: {
    fontSize: 15,
    color: '#2D3748',
    fontWeight: '600',
  },
});
