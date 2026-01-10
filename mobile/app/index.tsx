import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function LoginScreen() {
  const [clientCode, setClientCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!clientCode.trim()) {
      setError('Please enter your client code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Search for client with matching code across all agents
      const agentsRef = collection(db, 'agents');
      const agentsSnapshot = await getDocs(agentsRef);

      let foundClientId: string | null = null;
      let foundClientData: Record<string, unknown> | null = null;
      let foundAgentId: string | null = null;

      // First, find which agent has this client
      for (const agentDoc of agentsSnapshot.docs) {
        const clientsRef = collection(db, 'agents', agentDoc.id, 'clients');
        const clientQuery = query(clientsRef, where('clientCode', '==', clientCode.trim().toUpperCase()));
        const clientSnapshot = await getDocs(clientQuery);

        if (!clientSnapshot.empty) {
          foundClientId = clientSnapshot.docs[0].id;
          foundClientData = clientSnapshot.docs[0].data();
          foundAgentId = agentDoc.id;
          break;
        }
      }

      if (foundAgentId && foundClientId && foundClientData) {
        // Fetch the agent document to get all fields
        const agentDocRef = doc(db, 'agents', foundAgentId);
        const agentDocSnap = await getDoc(agentDocRef);
        
        if (!agentDocSnap.exists()) {
          setError('Agent data not found.');
          return;
        }
        
        const agentData = agentDocSnap.data();
        
        const photoBase64 = (agentData.photoBase64 as string) || '';
        const agentName = (agentData.name as string) || 'Your Agent';
        const agentEmail = (agentData.email as string) || '';
        const agentPhone = (agentData.phoneNumber as string) || '';
        const agencyName = (agentData.agencyName as string) || '';
        const agencyLogoBase64 = (agentData.agencyLogoBase64 as string) || '';
        const referralMessage = (agentData.referralMessage as string) || '';
        const businessCardBase64 = (agentData.businessCardBase64 as string) || '';
        const clientName = (foundClientData.name as string) || 'Client';
        
        router.push({
          pathname: '/agent-profile',
          params: {
            agentId: foundAgentId,
            agentName: agentName,
            agentEmail: agentEmail,
            agentPhone: agentPhone,
            agentPhotoBase64: photoBase64,
            agencyName: agencyName,
            agencyLogoBase64: agencyLogoBase64,
            clientId: foundClientId,
            clientName: clientName,
            referralMessage: referralMessage,
            businessCardBase64: businessCardBase64,
          },
        });
      } else {
        setError('Invalid client code. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      {/* Status bar area with teal background */}
      <SafeAreaView style={styles.topSafeArea} />
      
      <View style={styles.container}>
        {/* Dark Teal Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>✓</Text>
          </View>
          <Text style={styles.title}>My Insurance</Text>
          <Text style={styles.subtitle}>Access your policy information</Text>
        </View>

        {/* White Content Section - extends to bottom */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.contentSection}
        >
          <SafeAreaView style={styles.formSafeArea}>
            <View style={styles.formContainer}>
              <Text style={styles.label}>Client Code</Text>
              <TextInput
                style={styles.input}
                value={clientCode}
                onChangeText={(text) => {
                  setClientCode(text.toUpperCase());
                  setError('');
                }}
                placeholder="Enter your code"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
              />

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.helpText}>
                Your client code was provided by your insurance agent.
                Contact your agent if you need assistance.
              </Text>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White at the bottom
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIconText: {
    fontSize: 38,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  contentSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  formSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 36,
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 22,
    color: '#2D3748',
    marginBottom: 20,
    letterSpacing: 3,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#3DD6C3',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
