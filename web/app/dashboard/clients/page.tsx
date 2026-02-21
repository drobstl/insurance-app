'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import ClientDetailModal from '../../../components/ClientDetailModal';
import ApplicationUpload from '../../../components/ApplicationUpload';
import type { ExtractedApplicationData, Beneficiary } from '../../../lib/types';
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getPolicyTypeIcon,
  getAnniversaryDate,
  daysUntilAnniversary,
} from '../../../lib/policyUtils';

// ─── Constants ─────────────────────────────────────────────

const POLICY_TYPES = ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'];
const POLICY_STATUSES = ['Active', 'Pending', 'Lapsed'];
const KNOWN_CARRIERS = [
  'Americo',
  'Mutual of Omaha',
  'American-Amicable',
  'Banner',
  'United Home Life',
  'SBLI',
  'Corebridge',
  'AIG',
  'Transamerica',
  'F&G',
  'Foresters',
  'National Life Group',
  'Lincoln Financial',
  'Nationwide',
  'Prudential',
  'Protective',
  'North American',
  'Athene',
];

// ─── Interfaces ────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  clientCode?: string;
  dateOfBirth?: string;
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
  beneficiaries?: Beneficiary[];
  coverageAmount: number;
  premiumAmount: number;
  premiumFrequency?: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  renewalDate?: string;
  amountOfProtection?: number;
  protectionUnit?: 'months' | 'years';
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

interface PolicyFormData {
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  otherCarrier: string;
  policyOwner: string;
  beneficiaries: { name: string; type: 'primary' | 'contingent'; relationship?: string; percentage?: number }[];
  coverageAmount: string;
  premiumAmount: string;
  premiumFrequency: string;
  renewalDate: string;
  amountOfProtection: string;
  protectionUnit: string;
  status: string;
}

interface AnniversaryAlert {
  clientName: string;
  clientId: string;
  policy: Policy;
  anniversaryDate: Date;
}

interface ImportRow {
  name: string;
  email: string;
  phone: string;
  [key: string]: string;
}

// ─── Helpers ───────────────────────────────────────────────

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const emptyPolicyForm: PolicyFormData = {
  policyType: '',
  policyNumber: '',
  insuranceCompany: '',
  otherCarrier: '',
  policyOwner: '',
  beneficiaries: [{ name: '', type: 'primary', relationship: '', percentage: undefined }],
  coverageAmount: '',
  premiumAmount: '',
  premiumFrequency: 'monthly',
  renewalDate: '',
  amountOfProtection: '',
  protectionUnit: 'years',
  status: 'Active',
};

function mapExtractedApplicationToPolicyFormData(data: ExtractedApplicationData): Partial<PolicyFormData> {
  const mapped: Partial<PolicyFormData> = {};
  if (data.policyType) mapped.policyType = data.policyType;
  if (data.policyNumber) mapped.policyNumber = data.policyNumber;
  if (data.insuranceCompany) {
    const match = KNOWN_CARRIERS.find(
      (c) => c.toLowerCase() === data.insuranceCompany!.toLowerCase()
    );
    if (match) {
      mapped.insuranceCompany = match;
    } else {
      mapped.insuranceCompany = 'Other';
      mapped.otherCarrier = data.insuranceCompany;
    }
  }
  if (data.policyOwner) mapped.policyOwner = data.policyOwner;
  if (data.beneficiaries && data.beneficiaries.length > 0) {
    mapped.beneficiaries = data.beneficiaries.map((b) => ({
      name: b.name,
      type: b.type,
      relationship: b.relationship || '',
      percentage: b.percentage,
    }));
  }
  if (data.coverageAmount != null) mapped.coverageAmount = String(data.coverageAmount);
  if (data.premiumAmount != null) mapped.premiumAmount = String(data.premiumAmount);
  if (data.premiumFrequency) mapped.premiumFrequency = data.premiumFrequency;
  if (data.renewalDate) mapped.renewalDate = data.renewalDate;
  mapped.status = 'Active';
  return mapped;
}

// ─── Component ─────────────────────────────────────────────

export default function ClientsPage() {
  const { user, agentProfile, loading } = useDashboard();

  // ── Client state ──
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // ── Sorting state ──
  type SortKey = 'name' | 'email' | 'createdAt';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Pagination state ──
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // ── Client form state ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', dateOfBirth: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Delete client state ──
  const [deleteConfirmClient, setDeleteConfirmClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  // ── Policy state ──
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

  // ── Policy form state ──
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyFormData, setPolicyFormData] = useState<PolicyFormData>({ ...emptyPolicyForm });
  const [policyFormError, setPolicyFormError] = useState('');
  const [policyFormSuccess, setPolicyFormSuccess] = useState('');
  const [policySubmitting, setPolicySubmitting] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);

  // ── Delete policy state ──
  const [deleteConfirmPolicy, setDeleteConfirmPolicy] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Application upload state ──
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isClientUploadModalOpen, setIsClientUploadModalOpen] = useState(false);
  const [pendingClientApplicationData, setPendingClientApplicationData] = useState<ExtractedApplicationData | null>(null);

  // ── Import state ──
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccess, setImportSuccess] = useState('');

  // ── Anniversary alerts ──
  const [anniversaryAlerts, setAnniversaryAlerts] = useState<AnniversaryAlert[]>([]);
  const [anniversaryDismissed, setAnniversaryDismissed] = useState(false);

  // ── Share toast state ──
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  // ── Push token cache for ClientDetailModal ──
  const [clientPushToken, setClientPushToken] = useState<string | null | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Data Fetching ───────────────────────────────────────

  // Fetch clients
  useEffect(() => {
    if (!user) return;
    setClientsLoading(true);
    const q = query(collection(db, 'agents', user.uid, 'clients'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
      setClientsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Fetch policies for selected client
  useEffect(() => {
    if (!user || !selectedClient) {
      setPolicies([]);
      return;
    }
    setPoliciesLoading(true);
    const q = query(
      collection(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setPolicies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Policy)));
      setPoliciesLoading(false);
    });
    return () => unsub();
  }, [user, selectedClient]);

  // Fetch push token when a client is selected
  useEffect(() => {
    if (!selectedClient) {
      setClientPushToken(undefined);
      return;
    }
    (async () => {
      try {
        const tokenDoc = await getDoc(doc(db, 'clients', selectedClient.id));
        if (tokenDoc.exists()) {
          setClientPushToken(tokenDoc.data()?.pushToken || null);
        } else {
          setClientPushToken(null);
        }
      } catch {
        setClientPushToken(null);
      }
    })();
  }, [selectedClient]);

  // Fetch policy counts across all clients for anniversary detection
  useEffect(() => {
    if (!user || clients.length === 0) {
      setAnniversaryAlerts([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const anniversaryMap: Record<string, AnniversaryAlert[]> = {};

    clients.forEach((client) => {
      anniversaryMap[client.id] = [];
      const policiesRef = collection(db, 'agents', user.uid, 'clients', client.id, 'policies');
      const unsub = onSnapshot(policiesRef, (snap) => {
        const clientAnniv: AnniversaryAlert[] = [];
        snap.docs.forEach((d) => {
          const p = { id: d.id, ...d.data() } as Policy;
          const annivDate = getAnniversaryDate(p.createdAt);
          if (annivDate) {
            clientAnniv.push({
              clientName: client.name,
              clientId: client.id,
              policy: p,
              anniversaryDate: annivDate,
            });
          }
        });
        anniversaryMap[client.id] = clientAnniv;
        setAnniversaryAlerts(
          Object.values(anniversaryMap)
            .flat()
            .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime())
        );
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, [user, clients]);

  // ─── Filtered + Sorted Clients ────────────────────────────

  const filteredClients = useMemo(() => {
    let result = clients;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.clientCode?.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'email') cmp = (a.email || '').localeCompare(b.email || '');
      else if (sortKey === 'createdAt') {
        const aT = a.createdAt?.toMillis?.() ?? 0;
        const bT = b.createdAt?.toMillis?.() ?? 0;
        cmp = aT - bT;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [clients, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClients.slice(start, start + PAGE_SIZE);
  }, [filteredClients, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => (
    <svg className={`w-3.5 h-3.5 inline ml-1 ${sortKey === column ? 'text-[#005851]' : 'text-[#d0d0d0]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {sortKey === column && sortDir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        : sortKey === column && sortDir === 'desc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      }
    </svg>
  );

  // ─── Client Handlers ─────────────────────────────────────

  const handleOpenModal = useCallback(() => {
    setEditingClient(null);
    setFormData({ name: '', email: '', phone: '', dateOfBirth: '' });
    setFormError('');
    setFormSuccess('');
    setPendingClientApplicationData(null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormData({ name: '', email: '', phone: '', dateOfBirth: '' });
    setFormError('');
    setFormSuccess('');
    setPendingClientApplicationData(null);
  }, []);

  const handleEditClient = useCallback((client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      dateOfBirth: client.dateOfBirth || '',
    });
    setFormError('');
    setFormSuccess('');
    setIsModalOpen(true);
  }, []);

  const handleSubmitClient = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.name.trim()) {
      setFormError('Client name is required.');
      return;
    }
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'agents', user.uid, 'clients', editingClient.id), {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          dateOfBirth: formData.dateOfBirth || null,
        });
        // Update the selected client if it's the one being edited
        if (selectedClient?.id === editingClient.id) {
          setSelectedClient((prev) =>
            prev ? { ...prev, name: formData.name.trim(), email: formData.email.trim(), phone: formData.phone.trim() } : null
          );
        }
        setFormSuccess('Client updated!');
        setTimeout(() => handleCloseModal(), 800);
      } else {
        const code = generateClientCode();
        const newClient: Record<string, unknown> = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          clientCode: code,
          agentId: user.uid,
          createdAt: serverTimestamp(),
        };
        if (formData.dateOfBirth) newClient.dateOfBirth = formData.dateOfBirth;
        const docRef = await addDoc(collection(db, 'agents', user.uid, 'clients'), newClient);

        // Also create the top-level client doc for the mobile app
        await setDoc(doc(db, 'clients', docRef.id), {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          clientCode: code,
          agentId: user.uid,
          createdAt: serverTimestamp(),
        });

        setFormSuccess('Client added!');

        // Auto-send welcome text with code if Twilio number is set and client has a phone
        if (agentProfile.twilioPhoneNumber && formData.phone.trim()) {
          const firstName = formData.name.trim().split(' ')[0];
          const agentName = agentProfile.name || 'your agent';
          const welcomeText = `Hey ${firstName}! ${agentName} here. Download the AgentForLife app and use code ${code} to connect with me. https://agentforlife.app`;
          try {
            const token = await user.getIdToken();
            await fetch('/api/notifications/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                clientPhone: formData.phone.trim(),
                message: welcomeText,
                twilioNumber: agentProfile.twilioPhoneNumber,
              }),
            });
          } catch (smsErr) {
            console.error('Auto-text failed (non-blocking):', smsErr);
          }
        }

        // If there's pending application data, auto-create the policy
        if (pendingClientApplicationData) {
          const mapped = mapExtractedApplicationToPolicyFormData(pendingClientApplicationData);
          const policyData: Record<string, unknown> = {
            policyType: mapped.policyType || '',
            policyNumber: mapped.policyNumber || '',
            insuranceCompany: mapped.insuranceCompany === 'Other' ? (mapped.otherCarrier || '') : (mapped.insuranceCompany || ''),
            policyOwner: mapped.policyOwner || formData.name.trim(),
            beneficiaries: mapped.beneficiaries || [],
            coverageAmount: mapped.coverageAmount ? parseFloat(mapped.coverageAmount) : 0,
            premiumAmount: mapped.premiumAmount ? parseFloat(mapped.premiumAmount) : 0,
            premiumFrequency: mapped.premiumFrequency || 'monthly',
            renewalDate: mapped.renewalDate || '',
            status: 'Active',
            createdAt: serverTimestamp(),
          };
          await addDoc(collection(db, 'agents', user.uid, 'clients', docRef.id, 'policies'), policyData);
        }

        setTimeout(() => handleCloseModal(), 800);
      }
    } catch (err) {
      console.error('Error saving client:', err);
      setFormError('Failed to save client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [user, formData, editingClient, selectedClient, pendingClientApplicationData, handleCloseModal, agentProfile]);

  const handleDeleteClient = useCallback(async () => {
    if (!user || !deleteConfirmClient) return;
    setDeletingClient(true);
    try {
      // Delete all policies under this client first
      const policiesSnap = await getDocs(
        collection(db, 'agents', user.uid, 'clients', deleteConfirmClient.id, 'policies')
      );
      for (const pDoc of policiesSnap.docs) {
        await deleteDoc(doc(db, 'agents', user.uid, 'clients', deleteConfirmClient.id, 'policies', pDoc.id));
      }
      await deleteDoc(doc(db, 'agents', user.uid, 'clients', deleteConfirmClient.id));
      // Also delete top-level client doc
      try {
        await deleteDoc(doc(db, 'clients', deleteConfirmClient.id));
      } catch { /* may not exist */ }

      if (selectedClient?.id === deleteConfirmClient.id) {
        setSelectedClient(null);
      }
      setDeleteConfirmClient(null);
    } catch (err) {
      console.error('Error deleting client:', err);
    } finally {
      setDeletingClient(false);
    }
  }, [user, deleteConfirmClient, selectedClient]);

  // ─── Client Selection ────────────────────────────────────

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
  }, []);

  const handleCloseClientView = useCallback(() => {
    setSelectedClient(null);
    setPolicies([]);
  }, []);

  // ─── Policy Handlers ─────────────────────────────────────

  const handleOpenPolicyModal = useCallback(() => {
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setIsPolicyModalOpen(true);
  }, []);

  const handleClosePolicyModal = useCallback(() => {
    setIsPolicyModalOpen(false);
    setEditingPolicy(null);
    setPolicyFormData({ ...emptyPolicyForm });
    setPolicyFormError('');
    setPolicyFormSuccess('');
  }, []);

  const handleSubmitPolicy = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedClient) return;
    if (!policyFormData.policyType) {
      setPolicyFormError('Policy type is required.');
      return;
    }
    setPolicyFormError('');
    setPolicyFormSuccess('');
    setPolicySubmitting(true);

    try {
      const carrier =
        policyFormData.insuranceCompany === 'Other'
          ? policyFormData.otherCarrier.trim()
          : policyFormData.insuranceCompany;

      const policyPayload: Record<string, unknown> = {
        policyType: policyFormData.policyType,
        policyNumber: policyFormData.policyNumber.trim(),
        insuranceCompany: carrier,
        policyOwner: policyFormData.policyOwner.trim(),
        beneficiaries: policyFormData.beneficiaries.filter((b) => b.name.trim()),
        coverageAmount: policyFormData.coverageAmount ? parseFloat(policyFormData.coverageAmount) : 0,
        premiumAmount: policyFormData.premiumAmount ? parseFloat(policyFormData.premiumAmount) : 0,
        premiumFrequency: policyFormData.premiumFrequency,
        renewalDate: policyFormData.renewalDate,
        status: policyFormData.status,
      };

      if (policyFormData.policyType === 'Mortgage Protection') {
        policyPayload.amountOfProtection = policyFormData.amountOfProtection
          ? parseFloat(policyFormData.amountOfProtection)
          : 0;
        policyPayload.protectionUnit = policyFormData.protectionUnit;
      }

      if (editingPolicy) {
        await updateDoc(
          doc(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies', editingPolicy.id),
          policyPayload
        );
        setPolicyFormSuccess('Policy updated!');
      } else {
        policyPayload.createdAt = serverTimestamp();
        await addDoc(
          collection(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies'),
          policyPayload
        );
        setPolicyFormSuccess('Policy added!');
      }
      setTimeout(() => handleClosePolicyModal(), 800);
    } catch (err) {
      console.error('Error saving policy:', err);
      setPolicyFormError('Failed to save policy. Please try again.');
    } finally {
      setPolicySubmitting(false);
    }
  }, [user, selectedClient, policyFormData, editingPolicy, handleClosePolicyModal]);

  const handleDeletePolicy = useCallback(async () => {
    if (!user || !selectedClient || !deleteConfirmPolicy) return;
    setDeleting(true);
    try {
      await deleteDoc(
        doc(db, 'agents', user.uid, 'clients', selectedClient.id, 'policies', deleteConfirmPolicy.id)
      );
      setDeleteConfirmPolicy(null);
    } catch (err) {
      console.error('Error deleting policy:', err);
    } finally {
      setDeleting(false);
    }
  }, [user, selectedClient, deleteConfirmPolicy]);

  // ─── Application Upload Handlers ─────────────────────────

  const handleApplicationExtracted = useCallback((data: ExtractedApplicationData) => {
    setIsUploadModalOpen(false);
    const mapped = mapExtractedApplicationToPolicyFormData(data);
    setPolicyFormData((prev) => ({ ...prev, ...mapped }));
    setIsPolicyModalOpen(true);
  }, []);

  const handleClientApplicationExtracted = useCallback((data: ExtractedApplicationData) => {
    setIsClientUploadModalOpen(false);
    setPendingClientApplicationData(data);
    // Pre-fill client form with extracted data
    setFormData((prev) => ({
      ...prev,
      name: data.insuredName || prev.name,
      email: data.insuredEmail || prev.email,
      phone: data.insuredPhone || prev.phone,
      dateOfBirth: data.insuredDateOfBirth || prev.dateOfBirth,
    }));
  }, []);

  // ─── CSV Import Handlers ─────────────────────────────────

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSuccess('');
    setImportData([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) {
          setImportError('CSV must have a header row and at least one data row.');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const nameIdx = headers.findIndex((h) => h === 'name' || h === 'full name' || h === 'client name');
        const emailIdx = headers.findIndex((h) => h === 'email' || h === 'email address');
        const phoneIdx = headers.findIndex((h) => h === 'phone' || h === 'phone number' || h === 'mobile');

        if (nameIdx === -1) {
          setImportError('CSV must have a "Name" column.');
          return;
        }

        const rows: ImportRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          const name = cols[nameIdx] || '';
          if (!name) continue;
          rows.push({
            name,
            email: emailIdx !== -1 ? (cols[emailIdx] || '') : '',
            phone: phoneIdx !== -1 ? (cols[phoneIdx] || '') : '',
          });
        }

        if (rows.length === 0) {
          setImportError('No valid rows found in CSV.');
          return;
        }

        setImportData(rows);
      } catch {
        setImportError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleImportClients = useCallback(async () => {
    if (!user || importData.length === 0) return;
    setImporting(true);
    setImportProgress(0);
    setImportError('');
    setImportSuccess('');

    try {
      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        const code = generateClientCode();
        const clientPayload = {
          name: row.name.trim(),
          email: row.email.trim(),
          phone: row.phone.trim(),
          clientCode: code,
          agentId: user.uid,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'agents', user.uid, 'clients'), clientPayload);
        await setDoc(doc(db, 'clients', docRef.id), clientPayload);
        setImportProgress(Math.round(((i + 1) / importData.length) * 100));
      }
      setImportSuccess(`Successfully imported ${importData.length} client${importData.length !== 1 ? 's' : ''}!`);
      setImportData([]);
    } catch (err) {
      console.error('Error importing clients:', err);
      setImportError('Failed to import some clients. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [user, importData]);

  // ─── Share Code Handler ──────────────────────────────────

  const handleShareCode = useCallback(async (client: Client) => {
    const firstName = client.name.split(' ')[0];
    const message = `Hey ${firstName}! Download the AgentForLife app and use code ${client.clientCode} to connect with me. https://agentforlife.app`;
    try {
      await navigator.clipboard.writeText(message);
      setCopiedClientId(client.id);
      setTimeout(() => setCopiedClientId(null), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedClientId(client.id);
      setTimeout(() => setCopiedClientId(null), 2000);
    }
  }, []);

  // ─── Loading State ───────────────────────────────────────

  if (loading) return null;

  // ─── Render ──────────────────────────────────────────────

  return (
    <div>
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Clients</h1>
        <p className="text-[#707070] text-sm mt-1">Manage your clients, policies, and applications.</p>
      </div>

      {/* Anniversary Alert Banner */}
      {anniversaryAlerts.length > 0 && !anniversaryDismissed && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-[5px] p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-[5px] flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Policy Anniversaries Coming Up</h3>
                <div className="mt-2 space-y-1">
                  {anniversaryAlerts.slice(0, 5).map((alert, i) => {
                    const days = daysUntilAnniversary(alert.anniversaryDate);
                    return (
                      <p key={i} className="text-sm text-amber-800">
                        <span className="font-medium">{alert.clientName}</span>
                        {' — '}
                        {alert.policy.policyType}
                        {' — '}
                        {days === 0 ? '1-year anniversary is today' : days === 1 ? '1-year anniversary tomorrow' : `1-year anniversary in ${days} days`}
                      </p>
                    );
                  })}
                  {anniversaryAlerts.length > 5 && (
                    <p className="text-xs text-amber-600">+{anniversaryAlerts.length - 5} more</p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setAnniversaryDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenModal}
            className="px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Client
          </button>
          <button
            onClick={() => {
              setIsImportModalOpen(true);
              setImportData([]);
              setImportError('');
              setImportSuccess('');
              setImportProgress(0);
            }}
            className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#000000] font-semibold rounded-[5px] border border-[#d0d0d0] transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
          />
        </div>
      </div>

      {/* Client Table */}
      {clientsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-[#707070]">Loading clients...</p>
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-12 text-center">
          <div className="w-16 h-16 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">No clients yet</h3>
          <p className="text-[#707070] text-sm mb-6 max-w-md mx-auto">
            Add your first client to get started. Each client gets a unique code to connect with you through the app.
          </p>
          <button
            onClick={handleOpenModal}
            className="px-6 py-3 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
          >
            Add Your First Client
          </button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">No results found</h3>
          <p className="text-[#707070] text-sm">
            No clients match &ldquo;{searchQuery}&rdquo;. Try a different search term.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#d0d0d0] bg-[#f8f8f8]">
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3 cursor-pointer select-none hover:text-[#005851] transition-colors" onClick={() => handleSort('name')}>
                    Name<SortIcon column="name" />
                  </th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3 cursor-pointer select-none hover:text-[#005851] transition-colors" onClick={() => handleSort('email')}>
                    Email<SortIcon column="email" />
                  </th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3 cursor-pointer select-none hover:text-[#005851] transition-colors" onClick={() => handleSort('createdAt')}>
                    Added<SortIcon column="createdAt" />
                  </th>
                  <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Code</th>
                  <th className="text-right text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {paginatedClients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-[#f8f8f8] transition-colors cursor-pointer"
                    onClick={() => handleSelectClient(client)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#005851] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#000000]">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#707070]">{client.email || '—'}</td>
                    <td className="px-5 py-3.5 text-sm text-[#707070]">{client.phone || '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-[#707070]">
                      {client.createdAt?.toDate ? client.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {client.clientCode ? (
                        <div className="relative inline-flex">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShareCode(client);
                            }}
                            className="px-3 py-1 bg-[#daf3f0] hover:bg-[#c0ebe4] text-[#005851] text-xs font-semibold rounded-[5px] transition-colors flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            Share
                          </button>
                          {copiedClientId === client.id && (
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#005851] text-white text-xs rounded-[5px] whitespace-nowrap shadow-lg animate-fade-in">
                              Copied!
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#707070] italic">No code</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditClient(client)}
                          className="p-1.5 rounded-[5px] hover:bg-gray-100 text-[#707070] hover:text-[#000000] transition-colors"
                          title="Edit client"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmClient(client)}
                          className="p-1.5 rounded-[5px] hover:bg-red-50 text-[#707070] hover:text-red-600 transition-colors"
                          title="Delete client"
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

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-[#f0f0f0]">
            {paginatedClients.map((client) => (
              <div
                key={client.id}
                className="p-4 hover:bg-[#f8f8f8] transition-colors cursor-pointer"
                onClick={() => handleSelectClient(client)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#005851] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#000000] truncate">{client.name}</p>
                    <p className="text-xs text-[#707070] truncate">{client.email || client.phone || 'No contact info'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {client.clientCode && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShareCode(client);
                          }}
                          className="px-2.5 py-1 bg-[#daf3f0] hover:bg-[#c0ebe4] text-[#005851] text-xs font-semibold rounded-[5px] transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          Share
                        </button>
                        {copiedClientId === client.id && (
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#005851] text-white text-xs rounded-[5px] whitespace-nowrap shadow-lg">
                            Copied!
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEditClient(client)}
                        className="p-1.5 rounded-[5px] hover:bg-gray-100 text-[#707070] hover:text-[#000000] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirmClient(client)}
                        className="p-1.5 rounded-[5px] hover:bg-red-50 text-[#707070] hover:text-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Table footer with pagination */}
          <div className="px-5 py-3 border-t border-[#d0d0d0] bg-[#f8f8f8] flex items-center justify-between">
            <p className="text-xs text-[#707070]">
              Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredClients.length)}&ndash;{Math.min(currentPage * PAGE_SIZE, filteredClients.length)} of {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
              {filteredClients.length !== clients.length && ` (filtered from ${clients.length})`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 text-xs font-medium rounded-[5px] border border-[#d0d0d0] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) { page = i + 1; }
                  else if (currentPage <= 3) { page = i + 1; }
                  else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                  else { page = currentPage - 2 + i; }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 text-xs font-medium rounded-[5px] transition-colors ${
                        currentPage === page
                          ? 'bg-[#005851] text-white'
                          : 'hover:bg-gray-100 text-[#707070]'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 text-xs font-medium rounded-[5px] border border-[#d0d0d0] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════ */}

      {/* ── Add/Edit Client Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative w-full max-w-md bg-white rounded-[5px] border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#000000]">
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitClient} className="p-6 space-y-4">
              {/* PDF Upload option for new clients */}
              {!editingClient && !pendingClientApplicationData && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => setIsClientUploadModalOpen(true)}
                    className="w-full px-4 py-3 border-2 border-dashed border-[#45bcaa]/40 hover:border-[#45bcaa] bg-[#daf3f0]/30 hover:bg-[#daf3f0]/60 rounded-[5px] text-sm font-medium text-[#005851] transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Application PDF to Auto-Fill
                  </button>
                </div>
              )}

              {pendingClientApplicationData && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#daf3f0] border border-[#45bcaa]/30 rounded-[5px] text-xs text-[#005851]">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Application data extracted! A policy will be auto-created.</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[5px] text-xs text-green-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {formSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : editingClient ? (
                    'Update Client'
                  ) : (
                    'Add Client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import Clients Modal ── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !importing && setIsImportModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-[#000000]">Import Clients from CSV</h3>
              <button
                onClick={() => !importing && setIsImportModalOpen(false)}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {importSuccess ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-[#000000] mb-2">{importSuccess}</p>
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-6 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors text-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-[#f8f8f8] border border-[#d0d0d0] rounded-[5px] p-4">
                    <p className="text-sm text-[#707070] mb-2">
                      Upload a CSV file with client data. Required column: <span className="font-semibold text-[#000000]">Name</span>. Optional: Email, Phone.
                    </p>
                    <p className="text-xs text-[#707070]">
                      Example: Name, Email, Phone
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-[#707070] file:mr-4 file:py-2 file:px-4 file:rounded-[5px] file:border-0 file:text-sm file:font-semibold file:bg-[#daf3f0] file:text-[#005851] hover:file:bg-[#c0ebe4] cursor-pointer"
                    />
                  </div>

                  {importError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {importError}
                    </div>
                  )}

                  {importData.length > 0 && (
                    <>
                      <div className="border border-[#d0d0d0] rounded-[5px] overflow-hidden">
                        <div className="bg-[#f8f8f8] px-4 py-2 border-b border-[#d0d0d0]">
                          <p className="text-xs font-semibold text-[#707070]">
                            Preview ({importData.length} client{importData.length !== 1 ? 's' : ''})
                          </p>
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-[#f0f0f0]">
                          {importData.slice(0, 50).map((row, i) => (
                            <div key={i} className="px-4 py-2 flex items-center gap-3">
                              <span className="text-xs text-[#707070] w-6">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#000000] truncate">{row.name}</p>
                                <p className="text-xs text-[#707070] truncate">{[row.email, row.phone].filter(Boolean).join(' · ') || 'No contact info'}</p>
                              </div>
                            </div>
                          ))}
                          {importData.length > 50 && (
                            <div className="px-4 py-2 text-xs text-[#707070] text-center">
                              +{importData.length - 50} more rows
                            </div>
                          )}
                        </div>
                      </div>

                      {importing && (
                        <div className="space-y-2">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#44bbaa] rounded-full transition-all duration-300"
                              style={{ width: `${importProgress}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#707070] text-center">{importProgress}% complete</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setImportData([]);
                            setImportError('');
                          }}
                          disabled={importing}
                          className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                        >
                          Clear
                        </button>
                        <button
                          onClick={handleImportClients}
                          disabled={importing}
                          className="flex-1 py-2.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          {importing ? (
                            <>
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Importing...
                            </>
                          ) : (
                            `Import ${importData.length} Client${importData.length !== 1 ? 's' : ''}`
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Policy Modal ── */}
      {isPolicyModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClosePolicyModal} />
          <div className="relative w-full max-w-lg bg-white rounded-[5px] border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-[#000000]">
                  {editingPolicy ? 'Edit Policy' : 'Add Policy'}
                </h3>
                <p className="text-gray-500 text-sm">For {selectedClient.name}</p>
              </div>
              <button
                onClick={handleClosePolicyModal}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitPolicy} className="p-6 space-y-4">
              {/* Upload Application Button */}
              {!editingPolicy && (
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="w-full px-4 py-3 border-2 border-dashed border-[#0099FF]/30 hover:border-[#0099FF] bg-[#0099FF]/5 hover:bg-[#0099FF]/10 rounded-[5px] text-sm font-medium text-[#0099FF] transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Application PDF to Auto-Fill
                </button>
              )}

              {/* Policy Type */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Type *</label>
                <select
                  value={policyFormData.policyType}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyType: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="">Select type...</option>
                  {POLICY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Policy Number */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Number</label>
                <input
                  type="text"
                  value={policyFormData.policyNumber}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyNumber: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="e.g. POL-123456"
                />
              </div>

              {/* Insurance Company */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Insurance Company</label>
                <select
                  value={policyFormData.insuranceCompany}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, insuranceCompany: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="">Select carrier...</option>
                  {KNOWN_CARRIERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>

              {policyFormData.insuranceCompany === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Carrier Name</label>
                  <input
                    type="text"
                    value={policyFormData.otherCarrier}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, otherCarrier: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="Enter carrier name"
                  />
                </div>
              )}

              {/* Policy Owner */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Policy Owner</label>
                <input
                  type="text"
                  value={policyFormData.policyOwner}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, policyOwner: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  placeholder="Owner name"
                />
              </div>

              {/* Beneficiaries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#000000]">Beneficiaries</label>
                  <button
                    type="button"
                    onClick={() =>
                      setPolicyFormData((f) => ({
                        ...f,
                        beneficiaries: [...f.beneficiaries, { name: '', type: 'primary', relationship: '', percentage: undefined }],
                      }))
                    }
                    className="text-xs text-[#005851] font-semibold hover:underline"
                  >
                    + Add Beneficiary
                  </button>
                </div>
                <div className="space-y-3">
                  {policyFormData.beneficiaries.map((ben, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-[#f8f8f8] rounded-[5px] border border-[#d0d0d0]">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={ben.name}
                          onChange={(e) => {
                            const newBens = [...policyFormData.beneficiaries];
                            newBens[idx] = { ...newBens[idx], name: e.target.value };
                            setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                          placeholder="Beneficiary name"
                        />
                        <div className="flex gap-2">
                          <select
                            value={ben.type}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = { ...newBens[idx], type: e.target.value as 'primary' | 'contingent' };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="flex-1 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                          >
                            <option value="primary">Primary</option>
                            <option value="contingent">Contingent</option>
                          </select>
                          <input
                            type="text"
                            value={ben.relationship || ''}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = { ...newBens[idx], relationship: e.target.value };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="flex-1 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                            placeholder="Relationship"
                          />
                          <input
                            type="number"
                            value={ben.percentage ?? ''}
                            onChange={(e) => {
                              const newBens = [...policyFormData.beneficiaries];
                              newBens[idx] = {
                                ...newBens[idx],
                                percentage: e.target.value ? Number(e.target.value) : undefined,
                              };
                              setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                            }}
                            className="w-16 px-2 py-1.5 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa]"
                            placeholder="%"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>
                      {policyFormData.beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newBens = policyFormData.beneficiaries.filter((_, i) => i !== idx);
                            setPolicyFormData((f) => ({ ...f, beneficiaries: newBens }));
                          }}
                          className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors mt-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Coverage & Premium */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Death Benefit ($)</label>
                  <input
                    type="number"
                    value={policyFormData.coverageAmount}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, coverageAmount: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="250000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Premium ($)</label>
                  <input
                    type="number"
                    value={policyFormData.premiumAmount}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, premiumAmount: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    placeholder="150"
                  />
                </div>
              </div>

              {/* Premium Frequency */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Premium Frequency</label>
                <select
                  value={policyFormData.premiumFrequency}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, premiumFrequency: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi-annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              {/* Renewal Date (Term Life) */}
              {policyFormData.policyType === 'Term Life' && (
                <div>
                  <label className="block text-sm font-medium text-[#000000] mb-1">Renewal Date</label>
                  <input
                    type="date"
                    value={policyFormData.renewalDate}
                    onChange={(e) => setPolicyFormData((f) => ({ ...f, renewalDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                  />
                </div>
              )}

              {/* Mortgage Protection fields */}
              {policyFormData.policyType === 'Mortgage Protection' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#000000] mb-1">Amount of Protection</label>
                    <input
                      type="number"
                      value={policyFormData.amountOfProtection}
                      onChange={(e) => setPolicyFormData((f) => ({ ...f, amountOfProtection: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                      placeholder="30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#000000] mb-1">Unit</label>
                    <select
                      value={policyFormData.protectionUnit}
                      onChange={(e) => setPolicyFormData((f) => ({ ...f, protectionUnit: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                    >
                      <option value="years">Years</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Status</label>
                <select
                  value={policyFormData.status}
                  onChange={(e) => setPolicyFormData((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors"
                >
                  {POLICY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {policyFormError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-600">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {policyFormError}
                </div>
              )}

              {policyFormSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[5px] text-xs text-green-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {policyFormSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePolicyModal}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={policySubmitting}
                  className="flex-1 py-2.5 px-4 bg-[#0099FF] hover:bg-[#0088DD] disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {policySubmitting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : editingPolicy ? (
                    'Update Policy'
                  ) : (
                    'Add Policy'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Policy Confirmation ── */}
      {deleteConfirmPolicy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmPolicy(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#000000] mb-2">Delete Policy</h3>
              <p className="text-sm text-[#707070] mb-6">
                Are you sure you want to delete the <span className="font-semibold">{deleteConfirmPolicy.policyType}</span> policy (#{deleteConfirmPolicy.policyNumber})? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmPolicy(null)}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePolicy}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {deleting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
        </div>
      )}

      {/* ── Delete Client Confirmation ── */}
      {deleteConfirmClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmClient(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[5px] border border-gray-200 shadow-2xl p-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#000000] mb-2">Delete Client</h3>
              <p className="text-sm text-[#707070] mb-6">
                Are you sure you want to delete <span className="font-semibold">{deleteConfirmClient.name}</span> and all their policies? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmClient(null)}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-[5px] border border-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={deletingClient}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold rounded-[5px] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {deletingClient ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
        </div>
      )}

      {/* ── Client Detail Modal ── */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          policies={policies}
          policiesLoading={policiesLoading}
          onClose={handleCloseClientView}
          onAddPolicy={handleOpenPolicyModal}
          onEditPolicy={(policy) => {
            setEditingPolicy(policy);
            setPolicyFormData({
              policyType: policy.policyType || '',
              policyNumber: policy.policyNumber || '',
              insuranceCompany: KNOWN_CARRIERS.includes(policy.insuranceCompany)
                ? policy.insuranceCompany
                : policy.insuranceCompany
                ? 'Other'
                : '',
              otherCarrier: !KNOWN_CARRIERS.includes(policy.insuranceCompany) ? (policy.insuranceCompany || '') : '',
              policyOwner: policy.policyOwner || '',
              beneficiaries:
                policy.beneficiaries && policy.beneficiaries.length > 0
                  ? policy.beneficiaries.map((b) => ({
                      name: b.name,
                      type: b.type,
                      relationship: b.relationship || '',
                      percentage: b.percentage,
                    }))
                  : [{ name: '', type: 'primary', relationship: '', percentage: undefined }],
              coverageAmount: policy.coverageAmount ? String(policy.coverageAmount) : '',
              premiumAmount: policy.premiumAmount ? String(policy.premiumAmount) : '',
              premiumFrequency: policy.premiumFrequency || 'monthly',
              renewalDate: policy.renewalDate || '',
              amountOfProtection: policy.amountOfProtection ? String(policy.amountOfProtection) : '',
              protectionUnit: policy.protectionUnit || 'years',
              status: policy.status || 'Active',
            });
            setPolicyFormError('');
            setPolicyFormSuccess('');
            setIsPolicyModalOpen(true);
          }}
          onDeletePolicy={(policy) => setDeleteConfirmPolicy(policy)}
          onUploadApplication={() => setIsUploadModalOpen(true)}
          onEditClient={handleEditClient}
          agentName={agentProfile.name}
          hasSchedulingUrl={!!agentProfile.schedulingUrl}
          clientPushToken={clientPushToken === undefined ? null : clientPushToken}
        />
      )}

      {/* ── Application Upload (for existing client / policy) ── */}
      {isUploadModalOpen && selectedClient && (
        <ApplicationUpload
          clientName={selectedClient.name}
          onExtracted={handleApplicationExtracted}
          onClose={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* ── Application Upload (for new client creation) ── */}
      {isClientUploadModalOpen && (
        <ApplicationUpload
          clientName="New Client"
          onExtracted={handleClientApplicationExtracted}
          onClose={() => setIsClientUploadModalOpen(false)}
        />
      )}

      {/* Inline style for the toast animation */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}
