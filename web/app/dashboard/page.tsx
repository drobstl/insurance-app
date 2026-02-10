'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, Timestamp, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import OnboardingOverlay from '../../components/OnboardingOverlay';
import LoomVideoModal from '../../components/LoomVideoModal';
import { isAdminEmail } from '../../lib/admin';
import ApplicationUpload from '../../components/ApplicationUpload';
import type { ExtractedApplicationData } from '../../lib/types';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  createdAt: Timestamp;
  agentId: string;
}

interface Policy {
  id: string;
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  policyOwner: string;
  beneficiary: string;
  coverageAmount: number;
  premiumAmount: number;
  renewalDate?: string;
  amountOfProtection?: number;
  protectionUnit?: 'months' | 'years';
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

interface AgentProfile {
  name?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
  photoBase64?: string;
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  agencyName?: string;
  agencyLogoBase64?: string;
  businessCardBase64?: string;
  referralMessage?: string;
}

interface PolicyFormData {
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  otherCarrier: string;
  policyOwner: string;
  beneficiary: string;
  coverageAmount: string;
  premiumAmount: string;
  renewalDate: string;
  amountOfProtection: string;
  protectionUnit: 'months' | 'years';
  status: 'Active' | 'Pending' | 'Lapsed';
}

const POLICY_TYPES = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'];
const POLICY_STATUSES = ['Active', 'Pending', 'Lapsed'] as const;

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const getDefaultPolicyFormData = (): PolicyFormData => ({
  policyType: 'IUL',
  policyNumber: '',
  insuranceCompany: '',
  otherCarrier: '',
  policyOwner: '',
  beneficiary: '',
  coverageAmount: '',
  premiumAmount: '',
  renewalDate: '',
  amountOfProtection: '',
  protectionUnit: 'years',
  status: 'Active',
});

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Client search state
  const [searchQuery, setSearchQuery] = useState('');

  // Policy management state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyFormData, setPolicyFormData] = useState<PolicyFormData>(getDefaultPolicyFormData());
  const [policyFormError, setPolicyFormError] = useState('');
  const [policyFormSuccess, setPolicyFormSuccess] = useState(false);
  const [policySubmitting, setPolicySubmitting] = useState(false);

  // Application upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Edit/Delete state
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [deleteConfirmPolicy, setDeleteConfirmPolicy] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete client state
  const [deleteConfirmClient, setDeleteConfirmClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  // Import clients state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<{ name: string; email: string; phone: string }[]>([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccess, setImportSuccess] = useState(false);

  // Agent profile state
  const [agentProfile, setAgentProfile] = useState<AgentProfile>({});
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profilePhoneNumber, setProfilePhoneNumber] = useState('');
  const [profileAgencyName, setProfileAgencyName] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAgencyLogo, setUploadingAgencyLogo] = useState(false);
  const [uploadingBusinessCard, setUploadingBusinessCard] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [referralMessage, setReferralMessage] = useState('');
  
  // Password change state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Subscription state
  const [portalLoading, setPortalLoading] = useState(false);

  // Track total active and pending policies across all clients
  const [totalActivePolicies, setTotalActivePolicies] = useState(0);
  const [totalPendingPolicies, setTotalPendingPolicies] = useState(0);

  // Sidebar state for Quility-style layout
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'clients' | 'activity' | 'resources'>('clients');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Onboarding & tutorial state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTutorialVideo, setShowTutorialVideo] = useState(false);

  // Filtered clients based on search
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase().trim();
    return clients.filter(client =>
      client.name.toLowerCase().includes(query) ||
      client.email.toLowerCase().includes(query) ||
      client.phone.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch agent profile from Firestore
  useEffect(() => {
    if (!user) return;

    const fetchAgentProfile = async () => {
      try {
        const agentDoc = await getDoc(doc(db, 'agents', user.uid));
        if (agentDoc.exists()) {
          const data = agentDoc.data();
          setAgentProfile({
            name: data.name,
            email: data.email,
            phoneNumber: data.phoneNumber,
            photoBase64: data.photoBase64,
            photoURL: data.photoURL,
            subscriptionStatus: data.subscriptionStatus,
            stripeCustomerId: data.stripeCustomerId,
            subscriptionId: data.subscriptionId,
            agencyName: data.agencyName,
            agencyLogoBase64: data.agencyLogoBase64,
            businessCardBase64: data.businessCardBase64,
            referralMessage: data.referralMessage,
          });
          setProfilePhoneNumber(data.phoneNumber || '');
          setProfileAgencyName(data.agencyName || '');
          setReferralMessage(data.referralMessage || '');

          // Show onboarding if not completed yet
          if (!data.onboardingComplete) {
            setShowOnboarding(true);
          }
        } else {
          // No agent doc at all — definitely first time
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('Error fetching agent profile:', error);
      }
    };

    fetchAgentProfile();
  }, [user]);

  // Fetch clients from Firestore
  useEffect(() => {
    if (!user) return;

    const clientsRef = collection(db, 'agents', user.uid, 'clients');
    const q = query(clientsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientList: Client[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Client));
      setClients(clientList);
      setClientsLoading(false);
    }, (error) => {
      console.error('Error fetching clients:', error);
      setClientsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Count total active and pending policies across all clients
  useEffect(() => {
    if (!user || clients.length === 0) {
      setTotalActivePolicies(0);
      setTotalPendingPolicies(0);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const policyCounts: { [clientId: string]: { active: number; pending: number } } = {};

    clients.forEach((client) => {
      policyCounts[client.id] = { active: 0, pending: 0 };
      
      const policiesRef = collection(db, 'agents', user.uid, 'clients', client.id, 'policies');
      const unsubscribe = onSnapshot(policiesRef, (snapshot) => {
        const activeCount = snapshot.docs.filter(doc => doc.data().status === 'Active').length;
        const pendingCount = snapshot.docs.filter(doc => doc.data().status === 'Pending').length;
        
        policyCounts[client.id] = { active: activeCount, pending: pendingCount };
        
        // Calculate totals from all clients
        const totalActive = Object.values(policyCounts).reduce((sum, counts) => sum + counts.active, 0);
        const totalPending = Object.values(policyCounts).reduce((sum, counts) => sum + counts.pending, 0);
        
        setTotalActivePolicies(totalActive);
        setTotalPendingPolicies(totalPending);
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, clients]);

  // Fetch policies for selected client
  useEffect(() => {
    if (!user || !selectedClient) {
      setPolicies([]);
      return;
    }

    setPoliciesLoading(true);
    const policiesRef = collection(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies');
    const q = query(policiesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const policyList: Policy[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Policy));
      setPolicies(policyList);
      setPoliciesLoading(false);
    }, (error) => {
      console.error('Error fetching policies:', error);
      setPoliciesLoading(false);
    });

    return () => unsubscribe();
  }, [user, selectedClient]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setPortalLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session');
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
      setPortalLoading(false);
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setFormData({ name: '', email: '', phone: '' });
    setFormError('');
    setFormSuccess(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({ name: '', email: '', phone: '' });
    setFormError('');
    setFormSuccess(false);
  };

  // Generate a secure unique client code (12 chars in XXXX-XXXX-XXXX format)
  // Using crypto.getRandomValues for cryptographically secure randomness
  const generateClientCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars (excluding confusable: 0,O,1,I)
    const getSecureRandom = (max: number) => {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return array[0] % max;
    };
    
    let code = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars.charAt(getSecureRandom(chars.length));
    }
    return code; // Format: XXXX-XXXX-XXXX
  };

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setFormError('');
    setFormSuccess(false);
    setSubmitting(true);

    try {
      const clientCode = generateClientCode();
      const clientsRef = collection(db, 'agents', user.uid, 'clients');
      await addDoc(clientsRef, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        clientCode: clientCode,
        createdAt: serverTimestamp(),
        agentId: user.uid,
      });

      setFormSuccess(true);
      setFormData({ name: '', email: '', phone: '' });

      setTimeout(() => {
        handleCloseModal();
      }, 1500);
    } catch (error) {
      console.error('Error adding client:', error);
      setFormError('Failed to add client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Parse CSV file for import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportData([]);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setImportError('CSV file must have a header row and at least one data row.');
          return;
        }

        // Parse header to find column indices
        const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Find column indices (flexible matching)
        const nameIdx = header.findIndex(h => h.includes('name') || h === 'full name' || h === 'contact');
        const emailIdx = header.findIndex(h => h.includes('email') || h.includes('e-mail'));
        const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile') || h.includes('cell'));

        if (nameIdx === -1) {
          setImportError('CSV must have a "Name" column. Found columns: ' + header.join(', '));
          return;
        }

        // Parse data rows
        const parsedData: { name: string; email: string; phone: string }[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          // Handle CSV with quoted fields
          const row = lines[i].match(/("([^"]|"")*"|[^,]*)/g)?.map(field => 
            field.trim().replace(/^"|"$/g, '').replace(/""/g, '"')
          ) || [];
          
          if (row.length === 0 || !row[nameIdx]?.trim()) continue;
          
          parsedData.push({
            name: row[nameIdx]?.trim() || '',
            email: emailIdx !== -1 ? (row[emailIdx]?.trim() || '') : '',
            phone: phoneIdx !== -1 ? (row[phoneIdx]?.trim() || '') : '',
          });
        }

        if (parsedData.length === 0) {
          setImportError('No valid client data found in the CSV file.');
          return;
        }

        setImportData(parsedData);
      } catch {
        setImportError('Failed to parse CSV file. Please check the format.');
      }
    };

    reader.onerror = () => {
      setImportError('Failed to read the file. Please try again.');
    };

    reader.readAsText(file);
  };

  // Bulk import clients
  const handleImportClients = async () => {
    if (!user || importData.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    setImportError('');

    try {
      const clientsRef = collection(db, 'agents', user.uid, 'clients');
      const total = importData.length;
      let imported = 0;

      for (const client of importData) {
        const clientCode = generateClientCode();
        await addDoc(clientsRef, {
          name: client.name,
          email: client.email,
          phone: client.phone,
          clientCode: clientCode,
          createdAt: serverTimestamp(),
          agentId: user.uid,
        });
        imported++;
        setImportProgress(Math.round((imported / total) * 100));
      }

      setImportSuccess(true);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportData([]);
        setImportSuccess(false);
        setImportProgress(0);
      }, 2000);
    } catch (error) {
      console.error('Error importing clients:', error);
      setImportError('Failed to import some clients. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setImportData([]);
    setImportError('');
    setImportSuccess(false);
    setImportProgress(0);
  };

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
  }, []);

  const handleCloseClientView = useCallback(() => {
    setSelectedClient(null);
    setPolicies([]);
  }, []);

  const handleOpenPolicyModal = (policy?: Policy) => {
    setIsPolicyModalOpen(true);
    setEditingPolicy(policy || null);
    
    if (policy) {
      // Pre-fill form for editing
      // Check if carrier is in the known list
      const knownCarriers = ['Americo', 'Mutual of Omaha', 'American-Amicable', 'Banner', 'United Home Life',
        'SBLI', 'Corebridge', 'AIG', 'Transamerica', 'F&G', 'Foresters', 'National Life Group', 
        'Lincoln Financial', 'Nationwide', 'Prudential', 'Protective', 'North American', 'Athene'];
      const isKnownCarrier = knownCarriers.includes(policy.insuranceCompany || '');
      
      setPolicyFormData({
        policyType: policy.policyType,
        policyNumber: policy.policyNumber,
        insuranceCompany: isKnownCarrier ? (policy.insuranceCompany || '') : 'Other',
        otherCarrier: isKnownCarrier ? '' : (policy.insuranceCompany || ''),
        policyOwner: policy.policyOwner || '',
        beneficiary: policy.beneficiary || '',
        coverageAmount: policy.coverageAmount.toString(),
        premiumAmount: policy.premiumAmount.toString(),
        renewalDate: policy.renewalDate || '',
        amountOfProtection: policy.amountOfProtection?.toString() || '',
        protectionUnit: policy.protectionUnit || 'years',
        status: policy.status,
      });
    } else {
      setPolicyFormData(getDefaultPolicyFormData());
    }
    
    setPolicyFormError('');
    setPolicyFormSuccess(false);
  };

  const handleClosePolicyModal = () => {
    setIsPolicyModalOpen(false);
    setEditingPolicy(null);
    setPolicyFormData(getDefaultPolicyFormData());
    setPolicyFormError('');
    setPolicyFormSuccess(false);
  };

  const handleApplicationExtracted = (data: ExtractedApplicationData) => {
    setIsUploadModalOpen(false);

    // Map the extracted carrier to known list or "Other"
    const knownCarriers = ['Americo', 'Mutual of Omaha', 'American-Amicable', 'Banner', 'United Home Life',
      'SBLI', 'Corebridge', 'AIG', 'Transamerica', 'F&G', 'Foresters', 'National Life Group',
      'Lincoln Financial', 'Nationwide', 'Prudential', 'Protective', 'North American', 'Athene'];
    const extractedCarrier = data.insuranceCompany || '';
    const isKnownCarrier = knownCarriers.includes(extractedCarrier);

    setPolicyFormData({
      policyType: data.policyType || 'IUL',
      policyNumber: data.policyNumber || '',
      insuranceCompany: isKnownCarrier ? extractedCarrier : (extractedCarrier ? 'Other' : ''),
      otherCarrier: isKnownCarrier ? '' : extractedCarrier,
      policyOwner: data.policyOwner || '',
      beneficiary: data.beneficiary || '',
      coverageAmount: data.coverageAmount?.toString() || '',
      premiumAmount: data.premiumAmount?.toString() || '',
      renewalDate: data.renewalDate || '',
      amountOfProtection: '',
      protectionUnit: 'years',
      status: 'Pending',
    });

    setEditingPolicy(null);
    setPolicyFormError('');
    setPolicyFormSuccess(false);
    setIsPolicyModalOpen(true);
  };

  const handleSubmitPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedClient) return;

    setPolicyFormError('');
    setPolicyFormSuccess(false);
    setPolicySubmitting(true);

    try {
      // Use otherCarrier if "Other" is selected
      const finalCarrier = policyFormData.insuranceCompany === 'Other' 
        ? policyFormData.otherCarrier 
        : policyFormData.insuranceCompany;

      const policyData: Record<string, unknown> = {
        policyType: policyFormData.policyType,
        policyNumber: policyFormData.policyNumber,
        insuranceCompany: finalCarrier,
        policyOwner: policyFormData.policyOwner,
        beneficiary: policyFormData.beneficiary,
        coverageAmount: parseFloat(policyFormData.coverageAmount),
        premiumAmount: parseFloat(policyFormData.premiumAmount),
        status: policyFormData.status,
      };

      // Add conditional fields
      if (policyFormData.policyType === 'Term Life' && policyFormData.renewalDate) {
        policyData.renewalDate = policyFormData.renewalDate;
      }
      if (policyFormData.policyType === 'Mortgage Protection' && policyFormData.amountOfProtection) {
        policyData.amountOfProtection = parseInt(policyFormData.amountOfProtection);
        policyData.protectionUnit = policyFormData.protectionUnit;
      }

      if (editingPolicy) {
        // Update existing policy
        const policyRef = doc(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies', editingPolicy.id);
        await updateDoc(policyRef, policyData);
      } else {
        // Add new policy
        const policiesRef = collection(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies');
        await addDoc(policiesRef, {
          ...policyData,
          createdAt: serverTimestamp(),
        });
      }

      setPolicyFormSuccess(true);
      setPolicyFormData(getDefaultPolicyFormData());

      setTimeout(() => {
        handleClosePolicyModal();
      }, 1500);
    } catch (error) {
      console.error('Error saving policy:', error);
      setPolicyFormError(`Failed to ${editingPolicy ? 'update' : 'add'} policy. Please try again.`);
    } finally {
      setPolicySubmitting(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!user || !selectedClient || !deleteConfirmPolicy) return;

    setDeleting(true);
    try {
      const policyRef = doc(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies', deleteConfirmPolicy.id);
      await deleteDoc(policyRef);
      setDeleteConfirmPolicy(null);
    } catch (error) {
      console.error('Error deleting policy:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!user || !deleteConfirmClient) return;

    setDeletingClient(true);
    try {
      // First, delete all policies for this client
      const policiesRef = collection(db, 'agents', user.uid, 'clients', deleteConfirmClient.id, 'policies');
      const policiesSnapshot = await getDocs(policiesRef);
      const deletePromises = policiesSnapshot.docs.map(policyDoc => 
        deleteDoc(doc(db, 'agents', user.uid, 'clients', deleteConfirmClient.id, 'policies', policyDoc.id))
      );
      await Promise.all(deletePromises);

      // Then delete the client document
      await deleteDoc(doc(db, 'agents', user.uid, 'clients', deleteConfirmClient.id));

      // Clear selection if deleted client was selected
      if (selectedClient?.id === deleteConfirmClient.id) {
        setSelectedClient(null);
        setPolicies([]);
      }

      setDeleteConfirmClient(null);
    } catch (error) {
      console.error('Error deleting client:', error);
    } finally {
      setDeletingClient(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }

    setUploadingPhoto(true);
    try {
      // Resize and compress image to base64
      const base64 = await resizeAndCompressImage(file, 400, 0.8);
      
      // Save base64 string directly to Firestore
      await setDoc(doc(db, 'agents', user.uid), { photoBase64: base64 }, { merge: true });

      setAgentProfile(prev => ({ ...prev, photoBase64: base64 }));
    } catch (error) {
      console.error('Error uploading photo:', error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Helper function to resize and compress image to base64
  const resizeAndCompressImage = (file: File, maxSize: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down if larger than maxSize
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to base64 JPEG with quality setting
          const base64 = canvas.toDataURL('image/jpeg', quality);
          // Remove the data:image/jpeg;base64, prefix - we'll add it back when displaying
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleAgencyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }

    setUploadingAgencyLogo(true);
    try {
      // Resize and compress image to base64 (smaller size for logo)
      const base64 = await resizeAndCompressImage(file, 200, 0.8);
      
      // Save base64 string directly to Firestore
      await setDoc(doc(db, 'agents', user.uid), { agencyLogoBase64: base64 }, { merge: true });

      setAgentProfile(prev => ({ ...prev, agencyLogoBase64: base64 }));
    } catch (error) {
      console.error('Error uploading agency logo:', error);
    } finally {
      setUploadingAgencyLogo(false);
    }
  };

  const handleDeleteAgencyLogo = async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete your agency logo?')) return;
    
    try {
      await setDoc(doc(db, 'agents', user.uid), { agencyLogoBase64: '' }, { merge: true });
      setAgentProfile(prev => ({ ...prev, agencyLogoBase64: '' }));
    } catch (error) {
      console.error('Error deleting agency logo:', error);
    }
  };

  const handleBusinessCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }

    setUploadingBusinessCard(true);
    try {
      // Resize and compress image to base64 (larger size for business card readability)
      const base64 = await resizeAndCompressImage(file, 800, 0.85);
      
      // Save base64 string directly to Firestore
      await setDoc(doc(db, 'agents', user.uid), { businessCardBase64: base64 }, { merge: true });

      setAgentProfile(prev => ({ ...prev, businessCardBase64: base64 }));
    } catch (error) {
      console.error('Error uploading business card:', error);
    } finally {
      setUploadingBusinessCard(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setSavingProfile(true);
    try {
      await setDoc(doc(db, 'agents', user.uid), { 
        phoneNumber: profilePhoneNumber,
        agencyName: profileAgencyName,
        referralMessage: referralMessage,
      }, { merge: true });
      setAgentProfile(prev => ({ 
        ...prev, 
        phoneNumber: profilePhoneNumber,
        agencyName: profileAgencyName,
        referralMessage: referralMessage,
      }));
      setIsProfileModalOpen(false);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) return;

    setPasswordError('');
    setPasswordSuccess('');

    // Validation
    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password.');
      return;
    }

    setChangingPassword(true);
    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      setPasswordSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Hide success message and close section after 3 seconds
      setTimeout(() => {
        setPasswordSuccess('');
        setShowPasswordSection(false);
      }, 3000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        if (errorMessage.includes('wrong-password') || errorMessage.includes('invalid-credential')) {
          setPasswordError('Current password is incorrect.');
        } else if (errorMessage.includes('weak-password')) {
          setPasswordError('Password is too weak. Please use a stronger password.');
        } else if (errorMessage.includes('requires-recent-login')) {
          setPasswordError('Please log out and log back in before changing your password.');
        } else {
          setPasswordError('Failed to change password. Please try again.');
        }
      } else {
        setPasswordError('An unexpected error occurred.');
      }
    } finally {
      setChangingPassword(false);
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
    // Parse date parts directly to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-[#44bbaa]/20 text-[#005851] border-[#45bcaa]/30';
      case 'Pending':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'Lapsed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-200/50 text-gray-500 border-gray-300/50';
    }
  };

  const getPolicyTypeIcon = (type: string) => {
    switch (type) {
      case 'IUL':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      case 'Term Life':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'Whole Life':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      case 'Mortgage Protection':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        );
      case 'Accidental':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  // Generate year options (current year to 40 years in the future)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i <= 40; i++) {
      years.push(currentYear + i);
    }
    return years;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[#000000]">Loading...</p>
        </div>
      </div>
    );
  }

  // Check for subscription status
  if (agentProfile.subscriptionStatus !== 'active') {
    return (
      <div className="min-h-screen bg-[#e4e4e4]">
        {/* Navigation Bar */}
        <nav className="bg-[#005851]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#44bbaa] rounded-[5px] flex items-center justify-center shadow-lg shadow-[#45bcaa]/30">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-white">Agent Portal</span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-white/80 hover:text-white transition-colors text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>

        {/* Subscription Required Message */}
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-[5px] shadow-xl p-8 text-center">
              <div className="w-16 h-16 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#005851] mb-3">Subscription Required</h2>
              <p className="text-[#6B7280] mb-6">
                {agentProfile.subscriptionStatus === 'canceled' 
                  ? 'Your subscription has been canceled. Please resubscribe to continue using the dashboard.'
                  : agentProfile.subscriptionStatus === 'past_due'
                  ? 'Your payment is past due. Please update your payment method to continue.'
                  : 'You need an active subscription to access the agent dashboard and manage your clients.'}
              </p>
              <button
                onClick={() => router.push('/subscribe')}
                className="w-full py-3 px-6 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {agentProfile.subscriptionStatus === 'canceled' || agentProfile.subscriptionStatus === 'past_due' 
                  ? 'Reactivate Subscription' 
                  : 'Subscribe Now'}
              </button>
              <p className="text-sm text-[#9CA3AF] mt-4">
                Only $9.99/month for unlimited clients and policies
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e4e4e4] flex">
      {/* Collapsible Left Sidebar - Quility Style */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-[#005851] z-50 transition-all duration-300 ${sidebarExpanded ? 'w-56' : 'w-16'}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
            {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <img src="/logo.png" alt="Logo" className="w-11 h-7 object-contain" />
          <span className={`ml-3 text-white text-lg whitespace-nowrap overflow-hidden transition-all duration-300 brand-title ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
            AgentForLife
          </span>
            </div>

        {/* Navigation Items */}
        <nav className="mt-4 px-2 space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => setActiveSection('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group ${
              activeSection === 'dashboard' ? 'bg-[#daf3f0] text-[#005851]' : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Dashboard
            </span>
          </button>

          {/* Clients */}
          <button
            onClick={() => setActiveSection('clients')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group ${
              activeSection === 'clients' ? 'bg-[#daf3f0] text-[#005851]' : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Clients
            </span>
          </button>

          {/* Activity */}
          <button
            onClick={() => setActiveSection('activity')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group ${
              activeSection === 'activity' ? 'bg-[#daf3f0] text-[#005851]' : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Activity
            </span>
          </button>

          {/* Resources */}
          <button
            onClick={() => setActiveSection('resources')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 group ${
              activeSection === 'resources' ? 'bg-[#daf3f0] text-[#005851]' : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Resources
            </span>
          </button>

          {/* Feedback */}
          <button
            onClick={() => router.push('/dashboard/feedback')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <div className="relative shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#3DD6C3] rounded-full animate-pulse" />
            </div>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Feedback
            </span>
          </button>

          {/* Analytics (admin only) */}
          {isAdminEmail(user?.email) && (
            <button
              onClick={() => router.push('/dashboard/admin/feedback')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
                Analytics
              </span>
            </button>
          )}

          {/* Applications (admin only) */}
          {isAdminEmail(user?.email) && (
            <button
              onClick={() => router.push('/dashboard/admin/applications')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
                Applications
              </span>
            </button>
          )}

          {/* Settings */}
              <button
                onClick={() => setIsProfileModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-semibold ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              Settings
            </span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-16 flex flex-col min-h-screen">
        {/* Top Header Bar - Quility Style */}
        <header className="h-14 bg-white border-b border-[#d0d0d0] sticky top-0 z-40 flex items-center justify-between px-6">
          {/* Left: Branding */}
          <div className="flex items-center gap-2">
            <span className="text-[#005851] font-extrabold text-lg tracking-wide">AGENTFORLIFE</span>
            <span className="text-[#d0d0d0]">|</span>
            <span className="text-[#707070] font-medium">Agent Portal</span>
          </div>

          {/* Right: Actions & Profile */}
          <div className="flex items-center gap-4">
            {/* Watch Tutorial */}
            <button
              onClick={() => setShowTutorialVideo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] border border-[#3DD6C3] text-[#0D4D4D] hover:bg-[#3DD6C3]/10 transition-colors text-sm font-medium"
              title="Watch tutorial"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="hidden sm:inline">Tutorial</span>
            </button>

            {/* Search Icon */}
            <button className="w-9 h-9 rounded-[5px] hover:bg-[#f1f1f1] flex items-center justify-center text-[#707070] hover:text-[#005851] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[5px] hover:bg-[#f1f1f1] transition-colors"
              >
                {agentProfile.photoBase64 ? (
                  <img
                    src={`data:image/jpeg;base64,${agentProfile.photoBase64}`}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover border-2 border-[#45bcaa]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#44bbaa] flex items-center justify-center text-white font-bold text-sm">
                      {agentProfile.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-[#000000]">{agentProfile.name || 'Agent'}</p>
                  <p className="text-xs text-[#707070]">{agentProfile.agencyName || 'Agency'}</p>
                </div>
                <svg className={`w-4 h-4 text-[#707070] transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showProfileDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] py-2 z-50">
              <button
                      onClick={() => { setIsProfileModalOpen(true); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
              >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                      <span className="text-sm font-medium">My Account</span>
              </button>
                    {agentProfile.stripeCustomerId && (
                      <button
                        onClick={() => { handleManageSubscription(); setShowProfileDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                      >
                        <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
                        <span className="text-sm font-medium">Subscription</span>
                      </button>
                    )}
                    <div className="border-t border-[#d0d0d0] my-2" />
                    <button
                      onClick={() => { handleLogout(); setShowProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[#000000] hover:bg-[#f1f1f1] transition-colors"
                    >
                      <svg className="w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                      <span className="text-sm font-medium">Logout</span>
                    </button>
              </div>
                </>
              )}
              </div>
            </div>
        </header>

        {/* Main Content + Right Sidebar */}
        <div className="flex flex-1">
          {/* Center Content */}
          <main className="flex-1 p-6 overflow-auto">
            {activeSection === 'resources' ? (
              /* Resources Section */
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-[#000000]">Resources</h1>
                  <p className="text-[#707070] text-sm mt-1">Downloadable tools and scripts to help you succeed.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* App Preview Video */}
                  <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="bg-gradient-to-br from-[#005851] to-[#0A3D3D] p-4 flex items-center justify-center">
                      <video
                        className="w-full rounded-[4px]"
                        controls
                        preload="metadata"
                        poster=""
                      >
                        <source src="/app-preview.mp4" type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-semibold text-[#000000] mb-1">App Preview</h3>
                      <p className="text-[#707070] text-sm mb-4">Watch a walkthrough of the AgentForLife mobile app to see key features and how to get the most out of it.</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#707070] bg-[#f1f1f1] px-2 py-1 rounded-[5px]">Video</span>
                        <a
                          href="/app-preview.mp4"
                          download
                          className="flex items-center gap-2 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Product Introduction Script */}
                  <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="bg-gradient-to-br from-[#005851] to-[#0A3D3D] p-6 flex items-center justify-center">
                      <svg className="w-16 h-16 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-semibold text-[#000000] mb-1">Product Introduction Script</h3>
                      <p className="text-[#707070] text-sm mb-4">A ready-to-use script to help you introduce our products to your clients with confidence.</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#707070] bg-[#f1f1f1] px-2 py-1 rounded-[5px]">PDF</span>
                        <a
                          href="/product-introduction-script.pdf"
                          download
                          className="flex items-center gap-2 px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <>
            {/* Action Bar - Quility Style */}
            <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
              <button
                    onClick={handleOpenModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                    Add Client
              </button>
              <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#f1f1f1] text-[#005851] font-semibold rounded-[5px] border border-[#45bcaa] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                    Import CSV
              </button>
          </div>

                {/* Search */}
          {clients.length > 0 && (
                  <div className="relative flex-1 max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search clients..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Clients Section */}
            <div className="bg-white rounded-[5px] border border-[#d0d0d0]">
              <div className="p-4 border-b border-[#d0d0d0]">
                <h2 className="text-lg font-semibold text-[#000000]">My Clients</h2>
                <p className="text-sm text-[#707070]">{clients.length} total clients</p>
              </div>
              <div className="p-4">
          {clientsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <svg className="animate-spin w-8 h-8 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            </div>
          ) : clients.length === 0 ? (
                  <div className="flex flex-col items-center text-center py-8">
                    <div className="w-16 h-16 bg-[#f1f1f1] rounded-[5px] flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                    <h3 className="text-lg font-semibold text-[#000000] mb-2">No clients yet</h3>
                    <p className="text-[#707070] mb-4 max-w-sm text-sm">Add your first client to get started.</p>
                <button
                  onClick={handleOpenModal}
                      className="px-4 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white font-medium rounded-[5px] transition-colors text-sm"
                >
                      Add Client
                </button>
            </div>
          ) : filteredClients.length === 0 ? (
                  <div className="flex flex-col items-center text-center py-8">
                    <div className="w-12 h-12 bg-[#f1f1f1] rounded-[5px] flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                    <h3 className="text-sm font-semibold text-[#000000] mb-1">No clients found</h3>
                    <p className="text-[#707070] text-sm">No clients match your search.</p>
            </div>
          ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#f1f1f1]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#000000] uppercase tracking-wide">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#000000] uppercase tracking-wide">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#000000] uppercase tracking-wide">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#000000] uppercase tracking-wide">Code</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-[#000000] uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#d0d0d0]">
              {filteredClients.map((client) => (
                          <tr 
                  key={client.id}
                            className={`hover:bg-[#f1f1f1] transition-colors cursor-pointer ${
                              selectedClient?.id === client.id ? 'bg-[#daf3f0]' : ''
                            }`}
                            onClick={() => handleSelectClient(client)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#44bbaa] rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                                <span className="font-medium text-[#000000]">{client.name}</span>
                        </div>
                            </td>
                            <td className="px-4 py-3 text-[#707070] text-sm">{client.email}</td>
                            <td className="px-4 py-3 text-[#707070] text-sm">{client.phone}</td>
                            <td className="px-4 py-3">
                  {client.clientCode && (
                                <span className="font-mono text-sm text-[#45bcaa] font-medium">{client.clientCode}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                  <button
                                  onClick={(e) => { e.stopPropagation(); handleSelectClient(client); }}
                                  className={`p-2 rounded-[5px] transition-colors ${
                      selectedClient?.id === client.id
                                      ? 'bg-[#44bbaa] text-white' 
                                      : 'bg-[#f1f1f1] text-[#707070] hover:bg-[#daf3f0] hover:text-[#005851]'
                                  }`}
                                  title="View Policies"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmClient(client); }}
                                  className="p-2 rounded-[5px] bg-[#f1f1f1] text-[#707070] hover:bg-red-100 hover:text-red-500 transition-colors"
                                  title="Delete Client"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Client Policies Section */}
            {selectedClient && (
          <div className="mt-8 bg-white rounded-[5px] border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#005851] to-[#0A3D3D] rounded-[5px] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">Policies for {selectedClient.name}</h3>
                  <p className="text-gray-500 text-sm">{policies.length} {policies.length === 1 ? 'policy' : 'policies'} total</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2.5 bg-[#005851] hover:bg-[#004540] text-white font-semibold rounded-[5px] shadow-lg shadow-[#005851]/30 hover:shadow-[#005851]/40 transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Application
                </button>
                <button
                  onClick={() => handleOpenPolicyModal()}
                  className="px-4 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Policy
                </button>
                <button
                  onClick={handleCloseClientView}
                  className="w-10 h-10 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Policies Content */}
            <div className="p-6">
              {policiesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <svg className="animate-spin w-8 h-8 text-[#0099FF]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-gray-500">Loading policies...</p>
                  </div>
                </div>
              ) : policies.length === 0 ? (
                // Empty Policies State
                <div className="flex flex-col items-center text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-[5px] flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-[#000000] mb-2">No policies yet</h4>
                  <p className="text-gray-500 mb-4 max-w-sm">
                    Add a policy to start tracking coverage for this client.
                  </p>
                  <button
                    onClick={() => handleOpenPolicyModal()}
                    className="px-5 py-2.5 bg-[#0099FF] hover:bg-[#0088DD] text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add First Policy
                  </button>
                </div>
              ) : (
                // Policy List
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {policies.map((policy) => (
                    <div
                      key={policy.id}
                      className="bg-white rounded-[5px] border border-gray-200 p-5 hover:border-gray-200 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0099FF]/20 rounded-lg flex items-center justify-center text-[#0099FF]">
                            {getPolicyTypeIcon(policy.policyType)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-[#000000]">{policy.policyType}</h4>
                            <p className="text-gray-500 text-sm">#{policy.policyNumber}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(policy.status)}`}>
                          {policy.status}
                        </span>
                      </div>
                      
                      {/* Insurance Company */}
                      {policy.insuranceCompany && (
                        <div className="mb-4 pb-4 border-b border-gray-200">
                          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Insurance Company</p>
                          <p className="text-[#000000] font-medium">{policy.insuranceCompany}</p>
                        </div>
                      )}

                      {/* Policy Owner & Beneficiary */}
                      {(policy.policyOwner || policy.beneficiary) && (
                        <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200">
                          {policy.policyOwner && (
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Owner</p>
                              <p className="text-[#000000] text-sm">{policy.policyOwner}</p>
                            </div>
                          )}
                          {policy.beneficiary && (
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Beneficiary</p>
                              <p className="text-[#000000] text-sm">{policy.beneficiary}</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        {policy.policyType === 'Mortgage Protection' && policy.amountOfProtection && (
                          <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-3 border border-[#45bcaa]/30">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Amount of Protection</p>
                            <p className="text-[#005851] text-xl font-bold">{policy.amountOfProtection} {policy.protectionUnit === 'months' ? 'Months' : 'Years'}</p>
                          </div>
                        )}
                        {policy.policyType === 'Term Life' && policy.renewalDate && (
                          <div className="col-span-2">
                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Renewal Date</p>
                            <p className="text-[#000000]">{formatDate(policy.renewalDate)}</p>
                          </div>
                        )}
                        {(policy.policyType === 'Accidental' || policy.policyType === 'Term Life') ? (
                          <>
                            <div className="col-span-2 bg-[#44bbaa]/10 rounded-lg p-3 border border-[#45bcaa]/30">
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                              <p className="text-[#005851] text-xl font-bold">{formatCurrency(policy.coverageAmount)}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                              <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}/mo</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Death Benefit</p>
                              <p className="text-[#000000] font-semibold">{formatCurrency(policy.coverageAmount)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Premium</p>
                              <p className="text-[#000000] font-semibold">{formatCurrency(policy.premiumAmount)}/mo</p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Edit/Delete Actions */}
                      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleOpenPolicyModal(policy)}
                          className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirmPolicy(policy)}
                          className="flex-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-red-500/20"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
            </>
            )}
      </main>

          {/* Right Sidebar - Business At a Glance */}
          <aside className="w-72 bg-white border-l border-[#d0d0d0] p-4 hidden lg:block overflow-y-auto">
            <h3 className="text-sm font-semibold text-[#000000] mb-4">Your Business At a Glance</h3>
            
            {/* Stats Cards */}
            <div className="space-y-3">
              {/* Clients */}
              <div className="bg-[#f1f1f1] rounded-[5px] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#0099FF]/10 rounded-[5px] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#0099FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-[#707070]">Total Clients</p>
                      <p className="text-xl font-bold text-[#000000]">{clients.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Policies */}
              <div className="bg-[#f1f1f1] rounded-[5px] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#44bbaa]/20 rounded-[5px] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-[#707070]">Active Policies</p>
                      <p className="text-xl font-bold text-[#45bcaa]">{totalActivePolicies}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Policies */}
              <div className="bg-[#f1f1f1] rounded-[5px] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#fdcc02]/20 rounded-[5px] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-[#707070]">Pending Policies</p>
                      <p className="text-xl font-bold text-[#fdcc02]">{totalPendingPolicies}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-[#000000] mb-3">Quick Actions</h4>
              <div className="space-y-2">
                <button
                  onClick={handleOpenModal}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#daf3f0] hover:bg-[#cbfbef] text-[#005851] font-medium rounded-[5px] transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Add New Client
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#f1f1f1] hover:bg-[#e4e4e4] text-[#005851] font-medium rounded-[5px] transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import Contacts
                </button>
              </div>
            </div>

            {/* Selected Client Preview */}
            {selectedClient && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-[#000000] mb-3">Selected Client</h4>
                <div className="bg-[#daf3f0] rounded-[5px] p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#005851] rounded-full flex items-center justify-center text-white font-bold">
                      {selectedClient.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#005851] truncate">{selectedClient.name}</p>
                      <p className="text-xs text-[#337973] truncate">{selectedClient.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#45bcaa]/30 flex items-center justify-between">
                    <span className="text-xs text-[#337973]">{policies.length} policies</span>
                    <button
                      onClick={handleCloseClientView}
                      className="text-xs text-[#005851] hover:text-[#003e3a] font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseModal}
          />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl transform transition-all">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#000000]">Add New Client</h3>
              <button
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmitClient} className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-[5px] p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{formError}</p>
                </div>
              )}
              {formSuccess && (
                <div className="bg-[#44bbaa]/10 border border-[#45bcaa]/30 rounded-[5px] p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#45bcaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[#45bcaa] text-sm">Client added successfully!</p>
                </div>
              )}
              <div>
                <label htmlFor="clientName" className="block text-sm font-medium text-gray-600 mb-2">
                  Client Name
                </label>
                <input
                  id="clientName"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-600 mb-2">
                  Email Address
                </label>
                <input
                  id="clientEmail"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label htmlFor="clientPhone" className="block text-sm font-medium text-gray-600 mb-2">
                  Phone Number
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || formSuccess}
                  className="flex-1 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#44bbaa]/50 disabled:cursor-not-allowed text-[#005851] font-semibold rounded-[5px] shadow-lg shadow-[#45bcaa]/30 hover:shadow-[#45bcaa]/40 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    'Add Client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Clients Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseImportModal}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-[5px] border border-gray-200 shadow-2xl transform transition-all max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-[#005851]">Import Clients from CSV</h3>
                <p className="text-gray-500 text-sm mt-1">Upload a CSV file with your contacts</p>
              </div>
              <button
                onClick={handleCloseImportModal}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Upload Section */}
              {importData.length === 0 && !importSuccess && (
                <div className="space-y-4">
                  <div className="bg-[#e4e4e4] rounded-[5px] p-6 border-2 border-dashed border-gray-300 text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-[#000000] font-medium mb-2">Upload your contact list</p>
                    <p className="text-gray-500 text-sm mb-4">CSV file with Name, Email, and Phone columns</p>
                    <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#005851] hover:bg-[#0A3D3D] text-white font-medium rounded-lg cursor-pointer transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      Choose File
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      CSV Format Tips
                    </h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• First row should be headers (Name, Email, Phone)</li>
                      <li>• Name column is required, Email and Phone are optional</li>
                      <li>• Exports from Google Contacts, Outlook, or Excel work great</li>
                    </ul>
                  </div>

                  {importError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-red-600 text-sm">{importError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Section */}
              {importData.length > 0 && !importSuccess && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-[#005851]">Preview ({importData.length} clients)</h4>
                      <p className="text-sm text-gray-500">Review before importing</p>
                    </div>
                    <button
                      onClick={() => setImportData([])}
                      className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                    >
                      Clear & Upload New
                    </button>
                  </div>

                  <div className="bg-[#e4e4e4] rounded-[5px] border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-[#000000]">#</th>
                            <th className="px-4 py-3 text-left font-semibold text-[#000000]">Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-[#000000]">Email</th>
                            <th className="px-4 py-3 text-left font-semibold text-[#000000]">Phone</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {importData.slice(0, 50).map((client, idx) => (
                            <tr key={idx} className="hover:bg-white transition-colors">
                              <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-4 py-2 text-[#000000] font-medium">{client.name}</td>
                              <td className="px-4 py-2 text-gray-600">{client.email || '—'}</td>
                              <td className="px-4 py-2 text-gray-600">{client.phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importData.length > 50 && (
                      <div className="px-4 py-2 bg-gray-100 text-sm text-gray-500 text-center">
                        ...and {importData.length - 50} more
                      </div>
                    )}
                  </div>

                  {importing && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#000000]">Importing clients...</span>
                        <span className="text-[#45bcaa] font-medium">{importProgress}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#44bbaa] transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {importError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-red-600 text-sm">{importError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Success State */}
              {importSuccess && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-xl font-bold text-[#005851] mb-2">Import Complete!</h4>
                  <p className="text-gray-500">{importData.length} clients have been added to your book.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {importData.length > 0 && !importSuccess && (
              <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseImportModal}
                  disabled={importing}
                  className="flex-1 py-3 px-4 bg-white hover:bg-gray-100 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportClients}
                  disabled={importing}
                  className="flex-1 py-3 px-4 bg-[#44bbaa] hover:bg-[#2cc5b2] disabled:bg-[#44bbaa]/50 disabled:cursor-not-allowed text-[#000000] font-semibold rounded-[5px] shadow-lg shadow-[#45bcaa]/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Import {importData.length} Clients
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Policy Modal */}
      {isPolicyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClosePolicyModal}
          />
          <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl transform transition-all max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-[#000000]">
                  {editingPolicy ? 'Edit Policy' : 'Add New Policy'}
                </h3>
                <p className="text-gray-500 text-sm">For {selectedClient?.name}</p>
              </div>
              <button
                onClick={handleClosePolicyModal}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmitPolicy} className="p-6 space-y-5">
              {policyFormError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-[5px] p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{policyFormError}</p>
                </div>
              )}
              {policyFormSuccess && (
                <div className="bg-[#44bbaa]/10 border border-[#45bcaa]/30 rounded-[5px] p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#45bcaa] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[#45bcaa] text-sm">Policy {editingPolicy ? 'updated' : 'added'} successfully!</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="policyType" className="block text-sm font-medium text-gray-600 mb-2">
                    Policy Type
                  </label>
                  <select
                    id="policyType"
                    value={policyFormData.policyType}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, policyType: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                  >
                    {POLICY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="policyStatus" className="block text-sm font-medium text-gray-600 mb-2">
                    Status
                  </label>
                  <select
                    id="policyStatus"
                    value={policyFormData.status}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, status: e.target.value as 'Active' | 'Pending' | 'Lapsed' })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                  >
                    {POLICY_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Policy Number & Insurance Company */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="policyNumber" className="block text-sm font-medium text-gray-600 mb-2">
                    Policy Number
                  </label>
                  <input
                    id="policyNumber"
                    type="text"
                    value={policyFormData.policyNumber}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, policyNumber: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                    placeholder="POL-2026-001234"
                  />
                </div>
                <div className="relative">
                  <label htmlFor="insuranceCompany" className="block text-sm font-medium text-gray-600 mb-2">
                    Insurance Company
                  </label>
                  <select
                    id="insuranceCompany"
                    value={policyFormData.insuranceCompany}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, insuranceCompany: e.target.value, otherCarrier: '' })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200 appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    <option value="">Select a carrier...</option>
                    <option value="Americo">Americo</option>
                    <option value="Mutual of Omaha">Mutual of Omaha</option>
                    <option value="American-Amicable">American-Amicable</option>
                    <option value="Banner">Banner</option>
                    <option value="United Home Life">United Home Life</option>
                    <option value="SBLI">SBLI</option>
                    <option value="Corebridge">Corebridge</option>
                    <option value="AIG">AIG</option>
                    <option value="Transamerica">Transamerica</option>
                    <option value="F&G">F&G</option>
                    <option value="Foresters">Foresters</option>
                    <option value="National Life Group">National Life Group</option>
                    <option value="Lincoln Financial">Lincoln Financial</option>
                    <option value="Nationwide">Nationwide</option>
                    <option value="Prudential">Prudential</option>
                    <option value="Protective">Protective</option>
                    <option value="North American">North American</option>
                    <option value="Athene">Athene</option>
                    <option value="Other">Other</option>
                  </select>
                  {policyFormData.insuranceCompany === 'Other' && (
                    <input
                      type="text"
                      value={policyFormData.otherCarrier}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, otherCarrier: e.target.value })}
                      required
                      className="w-full mt-2 px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                      placeholder="Enter carrier name"
                    />
                  )}
                </div>
              </div>

              {/* Policy Owner & Beneficiary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="policyOwner" className="block text-sm font-medium text-gray-600 mb-2">
                    Policy Owner Name
                  </label>
                  <input
                    id="policyOwner"
                    type="text"
                    value={policyFormData.policyOwner}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, policyOwner: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label htmlFor="beneficiary" className="block text-sm font-medium text-gray-600 mb-2">
                    Beneficiary Name
                  </label>
                  <input
                    id="beneficiary"
                    type="text"
                    value={policyFormData.beneficiary}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, beneficiary: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>

              {/* Conditional: Amount of Protection for Mortgage Protection only */}
              {policyFormData.policyType === 'Mortgage Protection' && (
                <div>
                  <label htmlFor="amountOfProtection" className="block text-sm font-medium text-gray-600 mb-2">
                    Amount of Protection
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        id="amountOfProtection"
                        type="number"
                        min="1"
                        max="480"
                        value={policyFormData.amountOfProtection}
                        onChange={(e) => setPolicyFormData({ ...policyFormData, amountOfProtection: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                        placeholder={policyFormData.protectionUnit === 'months' ? '360' : '30'}
                      />
                    </div>
                    <div className="w-32">
                      <select
                        id="protectionUnit"
                        value={policyFormData.protectionUnit}
                        onChange={(e) => setPolicyFormData({ ...policyFormData, protectionUnit: e.target.value as 'months' | 'years' })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                      >
                        <option value="years">Years</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs mt-2">Enter the protection duration (e.g., 30 Years or 360 Months)</p>
                </div>
              )}

              {/* Conditional: Renewal Date for Term Life only */}
              {policyFormData.policyType === 'Term Life' && (
                <div>
                  <label htmlFor="renewalDate" className="block text-sm font-medium text-gray-600 mb-2">
                    Renewal Date
                  </label>
                  <input
                    id="renewalDate"
                    type="date"
                    value={policyFormData.renewalDate}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, renewalDate: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                  />
                  <p className="text-gray-500 text-xs mt-2">Select the exact date of policy renewal</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="coverageAmount" className="block text-sm font-medium text-gray-600 mb-2">
                    Death Benefit
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      id="coverageAmount"
                      type="number"
                      min="0"
                      step="1000"
                      value={policyFormData.coverageAmount}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, coverageAmount: e.target.value })}
                      required
                      className="w-full pl-8 pr-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                      placeholder="500000"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="premiumAmount" className="block text-sm font-medium text-gray-600 mb-2">
                    Monthly Premium
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      id="premiumAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={policyFormData.premiumAmount}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, premiumAmount: e.target.value })}
                      required
                      className="w-full pl-8 pr-4 py-3 bg-white border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0099FF]/50 focus:border-[#0099FF] transition-all duration-200"
                      placeholder="60.16"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePolicyModal}
                  className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={policySubmitting || policyFormSuccess}
                  className="flex-1 py-3 px-4 bg-[#0099FF] hover:bg-[#0088DD] disabled:bg-[#0099FF]/50 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-lg shadow-[#0099FF]/30 hover:shadow-[#0099FF]/40 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {policySubmitting ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {editingPolicy ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    editingPolicy ? 'Update Policy' : 'Add Policy'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Application Upload Modal */}
      {isUploadModalOpen && selectedClient && (
        <ApplicationUpload
          clientName={selectedClient.name}
          onExtracted={handleApplicationExtracted}
          onClose={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmPolicy(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-[5px] flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#000000]">Delete Policy?</h3>
                <p className="text-gray-500 text-sm">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the <span className="font-semibold text-[#000000]">{deleteConfirmPolicy.policyType}</span> policy #{deleteConfirmPolicy.policyNumber}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmPolicy(null)}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePolicy}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-lg shadow-red-500/30 hover:shadow-red-500/40 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Policy'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Dialog */}
      {deleteConfirmClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmClient(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-[5px] flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#000000]">Delete Client?</h3>
                <p className="text-gray-500 text-sm">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-semibold text-[#000000]">{deleteConfirmClient.name}</span>? This will permanently remove the client and <span className="text-red-500 font-semibold">all their policies</span>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmClient(null)}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-[#000000] font-semibold rounded-[5px] border border-gray-200 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={deletingClient}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-[#000000] font-semibold rounded-[5px] shadow-lg shadow-red-500/30 hover:shadow-red-500/40 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {deletingClient ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Client'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsProfileModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header with dark teal background */}
            <div className="bg-[#005851] p-6 shrink-0">
              <h2 className="text-xl font-bold text-white">Profile Settings</h2>
              <p className="text-white/70 text-sm mt-1">Manage your account and preferences</p>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-[#e4e4e4]">
              {/* Profile Photo Section */}
              <div className="bg-white rounded-[5px] p-6 border border-gray-200">
                <div className="flex flex-col items-center">
                  <div className="relative">
                    {agentProfile.photoBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${agentProfile.photoBase64}`}
                        alt="Profile"
                        className="w-24 h-24 rounded-full object-cover border-4 border-[#45bcaa] shadow-lg"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-[#005851] flex items-center justify-center border-4 border-[#45bcaa] shadow-lg">
                        <span className="text-4xl font-bold text-[#45bcaa]">
                          {agentProfile.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A'}
                        </span>
                      </div>
                    )}
                    <label className="absolute bottom-0 right-0 w-9 h-9 bg-[#44bbaa] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#005751] transition-colors shadow-lg border-2 border-white">
                      {uploadingPhoto ? (
                        <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-[#005851] font-medium mt-3">{agentProfile.name || 'Your Name'}</p>
                  <p className="text-gray-500 text-sm">{agentProfile.email || user?.email}</p>
                </div>
              </div>

              {/* Contact Information Card */}
              <div className="bg-white rounded-[5px] p-5 border border-gray-200">
                <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Contact Info
                </h3>
                <div>
                  <label htmlFor="profilePhoneNumber" className="block text-sm font-medium text-[#000000] mb-2">
                    Phone Number
                  </label>
                  <input
                    id="profilePhoneNumber"
                    type="tel"
                    value={profilePhoneNumber}
                    onChange={(e) => setProfilePhoneNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* Agency Branding Card */}
              <div className="bg-white rounded-[5px] p-5 border border-gray-200">
                <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Agency Branding
                </h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="profileAgencyName" className="block text-sm font-medium text-[#000000] mb-2">
                      Agency Name
                    </label>
                    <input
                      id="profileAgencyName"
                      type="text"
                      value={profileAgencyName}
                      onChange={(e) => setProfileAgencyName(e.target.value)}
                      className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                      placeholder="Your Agency Name"
                    />
                  </div>

                  {/* Agency Logo */}
                  <div>
                    <label className="block text-sm font-medium text-[#000000] mb-2">
                      Agency Logo
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {agentProfile.agencyLogoBase64 ? (
                          <img
                            src={`data:image/jpeg;base64,${agentProfile.agencyLogoBase64}`}
                            alt="Agency Logo"
                            className="w-16 h-16 rounded-[5px] object-contain bg-white border-2 border-[#45bcaa] p-1"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-[5px] bg-[#e4e4e4] flex items-center justify-center border-2 border-dashed border-[#45bcaa]/50">
                            <svg className="w-6 h-6 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#005851] hover:bg-[#0A3D3D] text-white text-sm font-medium rounded-[5px] cursor-pointer transition-colors">
                            {uploadingAgencyLogo ? (
                              <>
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Uploading...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Upload Logo
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={handleAgencyLogoUpload}
                              disabled={uploadingAgencyLogo}
                              className="hidden"
                            />
                          </label>
                          {agentProfile.agencyLogoBase64 && (
                            <button
                              onClick={handleDeleteAgencyLogo}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-[5px] transition-colors"
                              title="Delete agency logo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">PNG or JPG (max 200KB)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Referral Settings Section */}
              <div className="bg-white rounded-[5px] p-5 border border-gray-200">
                <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Referral Settings
                </h3>

                {/* Business Card Upload */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-[#000000] mb-2">
                    Business Card
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Upload your business card to share with referrals
                  </p>
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      {agentProfile.businessCardBase64 ? (
                        <img
                          src={`data:image/jpeg;base64,${agentProfile.businessCardBase64}`}
                          alt="Business Card"
                          className="w-32 h-20 rounded-lg object-cover border-2 border-[#45bcaa]"
                        />
                      ) : (
                        <div className="w-32 h-20 rounded-lg bg-[#e4e4e4] flex flex-col items-center justify-center border-2 border-dashed border-[#45bcaa]/50">
                          <svg className="w-6 h-6 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          <span className="text-xs text-gray-400 mt-1">No card</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#005851] hover:bg-[#0A3D3D] text-white text-sm font-medium rounded-[5px] cursor-pointer transition-colors">
                        {uploadingBusinessCard ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Upload Card
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleBusinessCardUpload}
                          disabled={uploadingBusinessCard}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-gray-500 mt-1">PNG or JPG recommended</p>
                    </div>
                  </div>
                </div>

                {/* Referral Message Template */}
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-2">
                    Referral Message Template
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Customize the message your clients send when referring you. Use placeholders: [referral], [agent], [client]
                  </p>
                  <textarea
                    value={referralMessage}
                    onChange={(e) => setReferralMessage(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200 text-sm resize-none"
                    placeholder="Hey [referral], I just got helped by [agent] getting protection to pay off our mortgage if something happens to me. I really liked the way [agent] was able to help me and thought they might be able to help you too."
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Leave blank to use the default message
                  </p>
                </div>
              </div>

              {/* Subscription Management */}
              {agentProfile.stripeCustomerId && (
                <div className="bg-white rounded-[5px] p-5 border border-gray-200">
                  <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Subscription
                  </h3>
                  <div className="flex items-center justify-between p-4 bg-[#D1FAE5] rounded-[5px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#005851] rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-[#005851] font-semibold block">Active</span>
                        <span className="text-[#005851]/70 text-sm">$9.99/month</span>
                      </div>
                    </div>
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="px-4 py-2 bg-[#005851] hover:bg-[#0A3D3D] text-white text-sm font-medium rounded-[5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {portalLoading ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        'Manage'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Security Section */}
              <div className="bg-white rounded-[5px] border border-gray-200 overflow-hidden">
                <button
                  onClick={() => {
                    setShowPasswordSection(!showPasswordSection);
                    setPasswordError('');
                    setPasswordSuccess('');
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex items-center justify-between w-full p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#005851] rounded-[5px] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[#005851] block">Change Password</span>
                      <span className="text-xs text-gray-500">Update your account password</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-[#45bcaa] transition-transform ${showPasswordSection ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPasswordSection && (
                  <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                    <div className="pt-4">
                      {passwordError && (
                        <div className="bg-red-50 border border-red-200 rounded-[5px] p-3 flex items-start gap-2 mb-4">
                          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-red-600 text-sm">{passwordError}</p>
                        </div>
                      )}

                      {passwordSuccess && (
                        <div className="bg-[#D1FAE5] border border-[#45bcaa]/30 rounded-[5px] p-3 flex items-start gap-2 mb-4">
                          <svg className="w-4 h-4 text-[#005851] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <p className="text-[#005851] text-sm font-medium">{passwordSuccess}</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label htmlFor="currentPassword" className="block text-sm font-medium text-[#000000] mb-1.5">
                            Current Password
                          </label>
                          <input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                            placeholder="Enter current password"
                          />
                        </div>

                        <div>
                          <label htmlFor="newPassword" className="block text-sm font-medium text-[#000000] mb-1.5">
                            New Password
                          </label>
                          <input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                            placeholder="Min 6 characters"
                          />
                        </div>

                        <div>
                          <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#000000] mb-1.5">
                            Confirm New Password
                          </label>
                          <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-[#e4e4e4] border border-gray-200 rounded-[5px] text-[#000000] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                            placeholder="Confirm new password"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleChangePassword}
                        disabled={changingPassword}
                        className="w-full mt-4 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#44bbaa]/50 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#45bcaa]/20"
                      >
                        {changingPassword ? (
                          <>
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Updating...
                          </>
                        ) : (
                          'Update Password'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 flex gap-3 shrink-0 bg-white">
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="flex-1 py-3 px-4 bg-white hover:bg-gray-50 text-[#000000] font-semibold rounded-[5px] border-2 border-gray-200 hover:border-gray-300 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 py-3 px-4 bg-[#005851] hover:bg-[#0A3D3D] disabled:bg-[#005851]/50 disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-lg shadow-[#005851]/20 hover:shadow-[#005851]/30 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Overlay — shows on first login */}
      {showOnboarding && user && (
        <OnboardingOverlay
          agentUid={user.uid}
          agentName={agentProfile.name || user.displayName || ''}
          onComplete={() => setShowOnboarding(false)}
          onOpenTutorial={() => setShowTutorialVideo(true)}
          onOpenProfile={() => setIsProfileModalOpen(true)}
        />
      )}

      {/* Loom Tutorial Video Modal */}
      <LoomVideoModal
        isOpen={showTutorialVideo}
        onClose={() => setShowTutorialVideo(false)}
      />
    </div>
  );
}
