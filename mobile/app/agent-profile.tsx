import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  ScrollView,
  Image,
  Alert,
  Platform,
  StatusBar,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Confetti from '../components/confetti';
import MessageCard from '../components/MessageCard';

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
    referralMessage: string;
    businessCardBase64: string;
  }>();

  const [imageError, setImageError] = useState(false);
  const [isReferring, setIsReferring] = useState(false);
  const [businessCardBase64, setBusinessCardBase64] = useState<string | null>(null);
  const [schedulingUrl, setSchedulingUrl] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  // Fetch agent-specific data from Firestore (fields too large for URL params)
  useEffect(() => {
    const fetchAgentExtras = async () => {
      if (!params.agentId) return;
      
      try {
        const agentDoc = await getDoc(doc(db, 'agents', params.agentId));
        if (agentDoc.exists()) {
          const data = agentDoc.data();
          if (data.businessCardBase64) {
            setBusinessCardBase64(data.businessCardBase64);
          }
          if (data.schedulingUrl) {
            setSchedulingUrl(data.schedulingUrl);
          }
        }
      } catch (error) {
        console.error('Error fetching agent data:', error);
      }
    };
    
    fetchAgentExtras();
  }, [params.agentId]);

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

  const handleBookAppointment = () => {
    if (schedulingUrl) {
      Linking.openURL(schedulingUrl);
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

  const handleReferral = async () => {
    setIsReferring(true);
    
    try {
      // Get client's first name
      const clientFirstName = getFirstName(params.clientName);

      // Check if SMS is available first
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'SMS Not Available',
          'Your device does not support sending SMS messages.',
          [{ text: 'OK' }]
        );
        setIsReferring(false);
        return;
      }

      // Request permission to access contacts
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your contacts to send a referral.',
          [{ text: 'OK' }]
        );
        setIsReferring(false);
        return;
      }

      let referralFirstName = 'Friend';
      let referralPhone = '';

      // Open native contact picker (works on both iOS and Android)
      try {
        const contact = await Contacts.presentContactPickerAsync();
        
        if (!contact) {
          // User cancelled
          setIsReferring(false);
          return;
        }

        // Get the referral's name - check multiple fields
        if (contact.firstName && contact.firstName.trim()) {
          referralFirstName = contact.firstName.trim();
        } else if (contact.name && contact.name.trim()) {
          referralFirstName = contact.name.trim().split(' ')[0];
        } else if (contact.lastName && contact.lastName.trim()) {
          referralFirstName = contact.lastName.trim();
        }
        
        // Get phone number from contact
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          referralPhone = contact.phoneNumbers[0].number || '';
        }

        if (!referralPhone) {
          Alert.alert(
            'No Phone Number',
            'The selected contact does not have a phone number.',
            [{ text: 'OK' }]
          );
          setIsReferring(false);
          return;
        }
      } catch (pickerError) {
        console.error('Contact picker error:', pickerError);
        Alert.alert(
          'Contact Picker Error',
          'Could not open contact picker. Please try again.',
          [{ text: 'OK' }]
        );
        setIsReferring(false);
        return;
      }

      // Build the referral message
      let message = params.referralMessage;
      if (!message || message === 'undefined' || message === 'null') {
        message = `Hey [referral], I just got helped by [agent] getting protection to pay off our mortgage if something happens to me. I really liked the way [agent] was able to help me and thought they might be able to help you too.`;
      }

      // Replace placeholders
      message = message
        .replace(/\[referral\]/gi, referralFirstName)
        .replace(/\[agent\]/gi, agentFirstName)
        .replace(/\[Agent-First-Name\]/gi, agentFirstName)
        .replace(/\[client\]/gi, clientFirstName);

      // Build recipients array
      const recipients: string[] = [referralPhone];
      // Include agent phone if available
      if (params.agentPhone) {
        const cleanAgentPhone = params.agentPhone.replace(/[^0-9+]/g, '');
        if (cleanAgentPhone && !recipients.includes(cleanAgentPhone)) {
          recipients.push(cleanAgentPhone);
        }
      }

      // Check if we have a business card to attach (fetched from Firestore)
      let attachments: SMS.SMSAttachment[] | undefined;
      
      if (businessCardBase64 && businessCardBase64.length > 0) {
        try {
          // Save the business card to a temp file
          const fileUri = `${FileSystem.cacheDirectory}business_card_${Date.now()}.jpg`;
          
          // Write base64 data to file
          await FileSystem.writeAsStringAsync(fileUri, businessCardBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          // Verify the file was created
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          
          if (fileInfo.exists) {
            attachments = [{
              uri: fileUri,
              mimeType: 'image/jpeg',
              filename: `${agentFirstName}_business_card.jpg`,
            }];
          }
        } catch (attachError) {
          console.log('Could not attach business card:', attachError);
          // Continue without attachment
        }
      }

      // Send the SMS (with attachment if available)
      try {
        const { result } = await SMS.sendSMSAsync(
          recipients,
          message,
          attachments ? { attachments } : undefined
        );

        if (result === 'sent') {
          Alert.alert(
            'Referral Sent!',
            `Thank you for referring ${agentFirstName} to ${referralFirstName}!`,
            [{ text: 'OK' }]
          );
        }
      } catch (smsError) {
        console.error('SMS error:', smsError);
        // Fall back to sharing with clipboard + image (works on WiFi-only devices)
        try {
          // Build the full message with contact info
          let shareMessage = message;
          if (params.agentPhone) {
            shareMessage += `\n\nContact ${agentFirstName}: ${params.agentPhone}`;
          }
          if (params.agentEmail) {
            shareMessage += `\nEmail: ${params.agentEmail}`;
          }
          
          // Check if we have a business card and sharing is available
          const canShare = await Sharing.isAvailableAsync();
          
          if (canShare && businessCardBase64 && businessCardBase64.length > 0) {
            // Save business card to temp file if not already done
            const fileUri = `${FileSystem.cacheDirectory}business_card_share_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(fileUri, businessCardBase64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            // Copy message to clipboard first
            await Clipboard.setStringAsync(shareMessage);
            
            // Show alert with instructions, then share the image
            Alert.alert(
              'Message Copied!',
              'The referral message has been copied to your clipboard. Tap "Share Image" to send the business card, then paste the message.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Share Image', 
                  onPress: async () => {
                    try {
                      await Sharing.shareAsync(fileUri, {
                        mimeType: 'image/jpeg',
                        dialogTitle: `Share ${agentFirstName}'s Business Card`,
                      });
                    } catch (e) {
                      console.error('Sharing error:', e);
                    }
                  }
                }
              ]
            );
          } else {
            // No business card or sharing not available, just use basic share
            await Share.share({
              message: shareMessage,
              title: `Referral for ${agentFirstName}`,
            });
          }
        } catch (shareError) {
          console.error('Share error:', shareError);
          Alert.alert(
            'SMS Not Available',
            'SMS requires cellular service. Please connect to a mobile network to send referrals via text.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Referral error:', error);
      Alert.alert(
        'Error',
        'There was an error sending the referral. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsReferring(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      {/* Confetti celebration on login */}
      <Confetti 
        isVisible={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />
      
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

              {schedulingUrl ? (
                <TouchableOpacity style={styles.contactItem} onPress={handleBookAppointment}>
                  <View style={styles.contactIcon}>
                    {/* Calendar Icon */}
                    <View style={styles.calendarIconOuter}>
                      <View style={styles.calendarIconTop} />
                      <View style={styles.calendarIconGrid}>
                        <View style={styles.calendarDot} />
                        <View style={styles.calendarDot} />
                        <View style={styles.calendarDot} />
                        <View style={styles.calendarDot} />
                      </View>
                    </View>
                  </View>
                  <Text style={styles.contactText}>Book Appointment w/ {agentFirstName}</Text>
                  <View style={styles.contactArrow}>
                    <Text style={styles.contactArrowText}>›</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

            </View>
          </View>

          {/* Inline Message Card (animates in after 1.5s if unread notifications exist) */}
          <MessageCard
            agentId={params.agentId || ''}
            clientId={params.clientId || ''}
            agentName={params.agentName}
            agentPhotoBase64={params.agentPhotoBase64}
            schedulingUrl={schedulingUrl || undefined}
            agencyName={params.agencyName}
            agencyLogoBase64={params.agencyLogoBase64}
            clientName={getFirstName(params.clientName)}
          />

          {/* Referral Button - Red Primary Style */}
          <TouchableOpacity 
            style={styles.referralButton} 
            onPress={handleReferral}
            disabled={isReferring}
          >
            <View style={styles.referralButtonIconContainer}>
              {/* Two People with Dotted Line Icon */}
              <View style={styles.referralIconInner}>
                <View style={styles.personIcon}>
                  <View style={styles.personHead} />
                  <View style={styles.personBody} />
                </View>
                <View style={styles.dottedLine}>
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                </View>
                <View style={styles.personIcon}>
                  <View style={styles.personHead} />
                  <View style={styles.personBody} />
                </View>
              </View>
            </View>
            <View style={styles.buttonContent}>
              <Text style={styles.primaryButtonText}>{`Refer ${agentFirstName}`}</Text>
              <Text style={styles.buttonSubtext}>Share with friends & family</Text>
            </View>
            <Text style={styles.buttonArrow}>›</Text>
          </TouchableOpacity>

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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 20,
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
    backgroundColor: '#fdcc02',
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
    backgroundColor: '#0099FF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#0099FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  // Professional Document Icon
  docIcon: {
    width: 24,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    padding: 5,
    justifyContent: 'center',
    gap: 4,
  },
  docIconLine: {
    height: 2,
    backgroundColor: '#0099FF',
    borderRadius: 1,
  },
  docIconLineShort: {
    height: 2,
    width: '60%',
    backgroundColor: '#0099FF',
    borderRadius: 1,
  },
  buttonContent: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  buttonSubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.85,
    fontWeight: '500',
  },
  buttonArrow: {
    fontSize: 28,
    color: '#FFFFFF',
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
  // Referral button styles - red primary button
  referralButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e31837',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#e31837',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  referralButtonIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  referralIconInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  personIcon: {
    alignItems: 'center',
  },
  personHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginBottom: 1,
  },
  personBody: {
    width: 9,
    height: 6,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 4.5,
    borderTopRightRadius: 4.5,
  },
  dottedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 2,
  },
  dot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  // Calendar icon for Book Appointment
  calendarIconOuter: {
    width: 20,
    height: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 3,
    justifyContent: 'space-between',
  },
  calendarIconTop: {
    height: 3,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  calendarIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    padding: 2,
    justifyContent: 'center',
  },
  calendarDot: {
    width: 3,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
});
