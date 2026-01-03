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

// Get first name from full name
const getFirstName = (fullName: string | undefined) => {
  if (!fullName) return 'Agent';
  return fullName.split(' ')[0];
};

export default function AgentProfileScreen() {
  const params = useLocalSearchParams<{
    agentId: string;
    agentName: string;
    agentEmail: string;
    agentPhone: string;
    agentPhotoBase64: string;
    agencyName: string;
    agencyLogoBase64: string;
    clientId: string;
    clientName: string;
  }>();

  const [imageError, setImageError] = useState(false);

  // Check if we have a valid base64 photo
  const hasValidPhoto = params.agentPhotoBase64 && 
    params.agentPhotoBase64.length > 0 && 
    params.agentPhotoBase64 !== 'undefined' &&
    params.agentPhotoBase64 !== 'null';

  // Check if we have a valid agency logo
  const hasAgencyLogo = params.agencyLogoBase64 && 
    params.agencyLogoBase64.length > 0 && 
    params.agencyLogoBase64 !== 'undefined' &&
    params.agencyLogoBase64 !== 'null';

  // Create the data URI for the image
  const photoUri = hasValidPhoto 
    ? `data:image/jpeg;base64,${params.agentPhotoBase64}` 
    : null;

  // Create the data URI for agency logo
  const agencyLogoUri = hasAgencyLogo 
    ? `data:image/jpeg;base64,${params.agencyLogoBase64}` 
    : null;

  const agentFirstName = getFirstName(params.agentName);

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
    <View style={styles.outerContainer}>
      {/* Dark teal for status bar area */}
      <SafeAreaView style={styles.topSafeArea} />
      
      {/* Off-white for bottom safe area */}
      <SafeAreaView style={styles.container}>
        {/* Dark Teal Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.clientName}>{getFirstName(params.clientName)}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Area with off-white background */}
        <View style={styles.mainContent}>
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
          {/* Agent Card */}
          <View style={styles.agentCard}>
            {/* Prominent Section Label */}
            <View style={styles.sectionLabelContainer}>
              <Text style={styles.sectionLabel}>YOUR INSURANCE AGENT</Text>
            </View>
            
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
            
            {/* Agency Name */}
            {params.agencyName ? (
              <Text style={styles.agencyName}>{params.agencyName}</Text>
            ) : null}

            {/* Agency Logo */}
            {agencyLogoUri ? (
              <View style={styles.agencyLogoContainer}>
                <Image
                  source={{ uri: agencyLogoUri }}
                  style={styles.agencyLogo}
                  resizeMode="contain"
                />
              </View>
            ) : null}

            {/* Contact Buttons */}
            <View style={styles.contactContainer}>
              {params.agentEmail ? (
                <TouchableOpacity style={styles.contactItem} onPress={handleEmail}>
                  <View style={styles.contactIcon}>
                    {/* Professional Email Icon */}
                    <View style={styles.emailIconOuter}>
                      <View style={styles.emailIconInner} />
                    </View>
                  </View>
                  <Text style={styles.contactText}>Email {agentFirstName}</Text>
                  <View style={styles.contactArrow}>
                    <Text style={styles.contactArrowText}>›</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {params.agentPhone ? (
                <TouchableOpacity style={styles.contactItem} onPress={handleCall}>
                  <View style={[styles.contactIcon, styles.phoneIcon]}>
                    {/* Professional Cell Phone Icon */}
                    <View style={styles.cellPhoneOuter}>
                      <View style={styles.cellPhoneScreen} />
                      <View style={styles.cellPhoneButton} />
                    </View>
                  </View>
                  <Text style={styles.contactText}>Call {agentFirstName}</Text>
                  <View style={styles.contactArrow}>
                    <Text style={styles.contactArrowText}>›</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity style={styles.primaryButton} onPress={handleViewPolicies}>
            <View style={styles.buttonIconContainer}>
              {/* Professional Document Icon */}
              <View style={styles.docIcon}>
                <View style={styles.docIconLine} />
                <View style={styles.docIconLine} />
                <View style={styles.docIconLineShort} />
              </View>
            </View>
            <View style={styles.buttonContent}>
              <Text style={styles.primaryButtonText}>View My Policies</Text>
              <Text style={styles.buttonSubtext}>See your coverage details</Text>
            </View>
            <Text style={styles.buttonArrow}>›</Text>
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
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
    fontWeight: '500',
  },
  clientName: {
    fontSize: 24,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
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
  sectionLabelContainer: {
    backgroundColor: '#0D4D4D',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
    alignSelf: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#3DD6C3',
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: '#3DD6C3',
    backgroundColor: '#F8F9FA',
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  agentName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2D3748',
    textAlign: 'center',
    marginBottom: 4,
  },
  agencyName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  agencyLogoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  agencyLogo: {
    width: 60,
    height: 60,
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  phoneIcon: {
    backgroundColor: '#0099FF',
  },
  // Professional Email Icon
  emailIconOuter: {
    width: 22,
    height: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 3,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 2,
  },
  emailIconInner: {
    width: 12,
    height: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '180deg' }],
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  // Professional Cell Phone Icon
  cellPhoneOuter: {
    width: 14,
    height: 22,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 3,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cellPhoneScreen: {
    width: 8,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  cellPhoneButton: {
    width: 4,
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  contactText: {
    flex: 1,
    fontSize: 17,
    color: '#2D3748',
    fontWeight: '600',
  },
  contactArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactArrowText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: -2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdcc02',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#fdcc02',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(13, 77, 77, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  // Professional Document Icon
  docIcon: {
    width: 24,
    height: 28,
    backgroundColor: '#0D4D4D',
    borderRadius: 3,
    padding: 5,
    justifyContent: 'center',
    gap: 4,
  },
  docIconLine: {
    height: 2,
    backgroundColor: '#fdcc02',
    borderRadius: 1,
  },
  docIconLineShort: {
    height: 2,
    width: '60%',
    backgroundColor: '#fdcc02',
    borderRadius: 1,
  },
  buttonContent: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 2,
  },
  buttonSubtext: {
    fontSize: 14,
    color: '#0D4D4D',
    opacity: 0.85,
    fontWeight: '500',
  },
  buttonArrow: {
    fontSize: 28,
    color: '#0D4D4D',
    fontWeight: '400',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
});
