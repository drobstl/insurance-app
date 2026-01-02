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

// Peace Sans font family constant
const FONT_FAMILY = 'PeaceSans';

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
      {/* Dark Teal Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.clientName}>{params.clientName}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                  <Text style={styles.contactIconText}>✉️</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Email</Text>
                  <Text style={styles.contactValue}>{params.agentEmail}</Text>
                </View>
                <View style={styles.contactArrow}>
                  <Text style={styles.contactArrowText}>→</Text>
                </View>
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
                <View style={styles.contactArrow}>
                  <Text style={styles.contactArrowText}>→</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Primary Action Button */}
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
    backgroundColor: '#0D4D4D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#0D4D4D',
  },
  headerContent: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: FONT_FAMILY,
  },
  clientName: {
    fontSize: 26,
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FONT_FAMILY,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
  },
  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    color: '#3DD6C3',
    letterSpacing: 1.5,
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
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#3DD6C3',
    backgroundColor: '#F8F9FA',
  },
  avatarText: {
    fontSize: 40,
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
  },
  agentName: {
    fontSize: 30,
    fontFamily: FONT_FAMILY,
    color: '#2D3748',
    textAlign: 'center',
    marginBottom: 20,
  },
  contactContainer: {
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 16,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  phoneIcon: {
    backgroundColor: '#0099FF',
  },
  contactIconText: {
    fontSize: 20,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
    fontFamily: FONT_FAMILY,
  },
  contactValue: {
    fontSize: 16,
    color: '#2D3748',
    fontFamily: FONT_FAMILY,
  },
  contactArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactArrowText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3DD6C3',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  buttonIcon: {
    fontSize: 26,
  },
  buttonContent: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 22,
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  buttonSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: FONT_FAMILY,
  },
  buttonArrow: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
  },
  helpSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  helpTitle: {
    fontSize: 20,
    fontFamily: FONT_FAMILY,
    color: '#0D4D4D',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    fontFamily: FONT_FAMILY,
  },
});
