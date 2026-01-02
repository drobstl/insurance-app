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
        const clientName = (foundClientData.name as string) || 'Client';
        
        router.push({
          pathname: '/agent-profile',
          params: {
            agentId: foundAgentId,
            agentName: agentName,
            agentEmail: agentEmail,
            agentPhone: agentPhone,
            agentPhotoBase64: photoBase64,
            clientId: foundClientId,
            clientName: clientName,
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Logo Section */}
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoIconText}>✓</Text>
            </View>
            <Text style={styles.title}>My Insurance</Text>
            <Text style={styles.subtitle}>Access your policy information</Text>
          </View>

          {/* Form Section */}
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
              placeholderTextColor="#64748b"
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
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Help Text */}
          <Text style={styles.helpText}>
            Your client code was provided by your insurance agent.
            Contact your agent if you need assistance.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIconText: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  formContainer: {
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: '#f8fafc',
    marginBottom: 16,
    letterSpacing: 2,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});

