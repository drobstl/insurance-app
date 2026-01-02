import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  ScrollView,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

export default function AgentProfileScreen() {
  const params = useLocalSearchParams<{
    agentId: string;
    agentName: string;
    agentEmail: string;
    agentPhone: string;
    agentPhotoBase64: string;
    clientId: string;
    clientName: string;
  }>();

  const [imageError, setImageError] = useState(false);

  // Check if we have a valid base64 photo
  const hasValidPhoto = params.agentPhotoBase64 && 
    params.agentPhotoBase64.length > 0 && 
    params.agentPhotoBase64 !== 'undefined' &&
    params.agentPhotoBase64 !== 'null';

  // Create the data URI for the image
  const photoUri = hasValidPhoto 
    ? `data:image/jpeg;base64,${params.agentPhotoBase64}` 
    : null;

  const handleCall = () => {
    if (params.agentPhone) {
      Linking.openURL(`tel:${params.agentPhone}`);
    }
  };

  const handleEmail = () => {
    if (params.agentEmail) {
      Linking.openURL(`mailto:${params.agentEmail}`);
    }
  };

  const handleViewPolicies = () => {
    router.push({
      pathname: '/policies',
      params: {
        agentId: params.agentId,
        clientId: params.clientId,
        clientName: params.clientName,
      },
    });
  };

  const handleLogout = () => {
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome, {params.clientName}</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Agent Card */}
        <View style={styles.agentCard}>
          <Text style={styles.sectionLabel}>YOUR INSURANCE AGENT</Text>
          
          {/* Agent Avatar */}
          <View style={styles.avatarContainer}>
            {hasValidPhoto && photoUri && !imageError ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.avatarImage}
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {params.agentName?.charAt(0)?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}
          </View>

          {/* Agent Name */}
          <Text style={styles.agentName}>{params.agentName}</Text>

          {/* Contact Info */}
          <View style={styles.contactContainer}>
            {params.agentEmail ? (
              <TouchableOpacity style={styles.contactItem} onPress={handleEmail}>
                <View style={styles.contactIcon}>
                  <Text style={styles.contactIconText}>✉</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Email</Text>
                  <Text style={styles.contactValue}>{params.agentEmail}</Text>
                </View>
                <Text style={styles.contactAction}>→</Text>
              </TouchableOpacity>
            ) : null}

            {params.agentPhone ? (
              <TouchableOpacity style={styles.contactItem} onPress={handleCall}>
                <View style={[styles.contactIcon, styles.phoneIcon]}>
                  <Text style={styles.contactIconText}>📞</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Phone</Text>
                  <Text style={styles.contactValue}>{params.agentPhone}</Text>
                </View>
                <Text style={styles.contactAction}>→</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleViewPolicies}>
            <View style={styles.buttonIconContainer}>
              <Text style={styles.buttonIcon}>📋</Text>
            </View>
            <View style={styles.buttonContent}>
              <Text style={styles.primaryButtonText}>View My Policies</Text>
              <Text style={styles.buttonSubtext}>See your coverage details</Text>
            </View>
            <Text style={styles.buttonArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            Contact your agent directly for questions about your policies, 
            claims, or coverage options.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  agentCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 20,
    textAlign: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#10b981',
    backgroundColor: '#1e293b',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#ffffff',
  },
  agentName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 24,
  },
  contactContainer: {
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  phoneIcon: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  contactIconText: {
    fontSize: 20,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '500',
  },
  contactAction: {
    fontSize: 18,
    color: '#64748b',
  },
  actionsSection: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  buttonIcon: {
    fontSize: 24,
  },
  buttonContent: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  buttonSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  buttonArrow: {
    fontSize: 24,
    color: '#ffffff',
  },
  helpSection: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
  },
});
