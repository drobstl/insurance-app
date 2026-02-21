'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useDashboard } from './DashboardContext';
import { getAnniversaryDate, daysUntilAnniversary, formatCurrency } from '../../lib/policyUtils';

interface Client {
  id: string;
  name: string;
  createdAt: Timestamp;
}

interface Policy {
  id: string;
  policyType: string;
  policyNumber: string;
  coverageAmount: number;
  premiumAmount: number;
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

interface ConservationAlert {
  id: string;
  clientName: string;
  carrier: string;
  reason: string;
  priority: string;
  status: string;
  isChargebackRisk: boolean;
  policyType: string | null;
  aiInsight: string | null;
  createdAt: Timestamp;
}

interface Referral {
  id: string;
  referralName: string;
  clientName: string;
  status: string;
  appointmentBooked: boolean;
  createdAt: unknown;
}

interface AnniversaryAlert {
  clientName: string;
  clientId: string;
  policy: Policy;
  anniversaryDate: Date;
}

export default function DashboardHomePage() {
  const router = useRouter();
  const { user, loading } = useDashboard();

  const [clients, setClients] = useState<Client[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [conservationAlerts, setConservationAlerts] = useState<ConservationAlert[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [anniversaryAlerts, setAnniversaryAlerts] = useState<AnniversaryAlert[]>([]);

  // Fetch clients
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'clients'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
    });
  }, [user]);

  // Fetch policies across all clients for stats + anniversary detection
  useEffect(() => {
    if (!user || clients.length === 0) {
      setTotalActive(0);
      setTotalPending(0);
      setAnniversaryAlerts([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const policyCounts: Record<string, { active: number; pending: number }> = {};
    const anniversaryMap: Record<string, AnniversaryAlert[]> = {};

    clients.forEach((client) => {
      policyCounts[client.id] = { active: 0, pending: 0 };
      anniversaryMap[client.id] = [];

      const policiesRef = collection(db, 'agents', user.uid, 'clients', client.id, 'policies');
      const unsub = onSnapshot(policiesRef, (snap) => {
        policyCounts[client.id] = {
          active: snap.docs.filter((d) => d.data().status === 'Active').length,
          pending: snap.docs.filter((d) => d.data().status === 'Pending').length,
        };

        const clientAnniv: AnniversaryAlert[] = [];
        snap.docs.forEach((d) => {
          const p = { id: d.id, ...d.data() } as Policy;
          const annivDate = getAnniversaryDate(p.createdAt);
          if (annivDate) {
            clientAnniv.push({ clientName: client.name, clientId: client.id, policy: p, anniversaryDate: annivDate });
          }
        });
        anniversaryMap[client.id] = clientAnniv;

        setTotalActive(Object.values(policyCounts).reduce((s, c) => s + c.active, 0));
        setTotalPending(Object.values(policyCounts).reduce((s, c) => s + c.pending, 0));
        setAnniversaryAlerts(Object.values(anniversaryMap).flat().sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime()));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, [user, clients]);

  // Fetch conservation alerts
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'conservationAlerts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setConservationAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConservationAlert)));
    });
  }, [user]);

  // Fetch referrals
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'agents', user.uid, 'referrals'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setReferrals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Referral)));
    });
  }, [user]);

  const activeConservation = conservationAlerts.filter((a) => a.status !== 'saved' && a.status !== 'lost');
  const chargebackCount = activeConservation.filter((a) => a.isChargebackRisk).length;
  const activeReferrals = referrals.filter((r) => r.status === 'active' || r.status === 'outreach-sent' || r.status === 'drip-1' || r.status === 'drip-2');
  const bookedReferrals = referrals.filter((r) => r.status === 'booked' || r.appointmentBooked);

  // Action items: things that need the agent's attention right now
  const actionItems = useMemo(() => {
    const items: { type: string; label: string; sublabel: string; urgent: boolean; route: string }[] = [];

    activeConservation.forEach((a) => {
      if (a.status === 'new' || a.priority === 'high') {
        items.push({
          type: 'conservation',
          label: `${a.clientName} — ${a.carrier}`,
          sublabel: a.isChargebackRisk ? 'Chargeback risk — act now' : a.reason === 'lapsed_payment' ? 'Lapsed payment' : 'Policy at risk',
          urgent: a.isChargebackRisk,
          route: '/dashboard/conservation',
        });
      }
    });

    activeReferrals.forEach((r) => {
      if (r.status === 'active') {
        items.push({
          type: 'referral',
          label: `${r.referralName}`,
          sublabel: `Referred by ${r.clientName} — in conversation`,
          urgent: false,
          route: '/dashboard/referrals',
        });
      }
    });

    anniversaryAlerts.slice(0, 3).forEach((a) => {
      const days = daysUntilAnniversary(a.anniversaryDate);
      items.push({
        type: 'anniversary',
        label: `${a.clientName} — ${a.policy.policyType}`,
        sublabel: days === 0 ? '1-year anniversary is today' : days === 1 ? '1-year anniversary tomorrow' : `1-year anniversary in ${days} days`,
        urgent: days <= 3,
        route: '/dashboard/clients',
      });
    });

    items.sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1));
    return items;
  }, [activeConservation, activeReferrals, anniversaryAlerts]);

  if (loading) return null;

  return (
    <div>
      {/* Welcome / Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000000]">Dashboard</h1>
        <p className="text-[#707070] text-sm mt-1">Here&rsquo;s what needs your attention today.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <button onClick={() => router.push('/dashboard/clients')} className="bg-white rounded-[5px] border border-[#d0d0d0] p-4 hover:border-[#45bcaa] transition-colors text-left">
          <p className="text-xs text-[#707070] mb-1">Total Clients</p>
          <p className="text-2xl font-bold text-[#000000]">{clients.length}</p>
        </button>
        <button onClick={() => router.push('/dashboard/clients')} className="bg-white rounded-[5px] border border-[#d0d0d0] p-4 hover:border-[#45bcaa] transition-colors text-left">
          <p className="text-xs text-[#707070] mb-1">Active Policies</p>
          <p className="text-2xl font-bold text-[#45bcaa]">{totalActive}</p>
        </button>
        <button onClick={() => router.push('/dashboard/referrals')} className="bg-white rounded-[5px] border border-[#d0d0d0] p-4 hover:border-[#45bcaa] transition-colors text-left">
          <p className="text-xs text-[#707070] mb-1">Active Referrals</p>
          <p className="text-2xl font-bold text-[#0099FF]">{activeReferrals.length}</p>
        </button>
        <button onClick={() => router.push('/dashboard/conservation')} className="bg-white rounded-[5px] border border-[#d0d0d0] p-4 hover:border-[#45bcaa] transition-colors text-left">
          <p className="text-xs text-[#707070] mb-1">At-Risk Policies</p>
          <p className={`text-2xl font-bold ${activeConservation.length > 0 ? 'text-red-600' : 'text-[#000000]'}`}>{activeConservation.length}</p>
        </button>
      </div>

      {/* Action Required */}
      {actionItems.length > 0 && (
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] mb-6">
          <div className="px-5 py-4 border-b border-[#d0d0d0]">
            <h2 className="text-sm font-semibold text-[#000000]">Action Required</h2>
            <p className="text-xs text-[#707070] mt-0.5">{actionItems.length} item{actionItems.length !== 1 ? 's' : ''} need{actionItems.length === 1 ? 's' : ''} your attention</p>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {actionItems.map((item, i) => (
              <button
                key={i}
                onClick={() => router.push(item.route)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#f8f8f8] transition-colors text-left"
              >
                <div className={`w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0 ${
                  item.type === 'conservation' ? (item.urgent ? 'bg-red-100' : 'bg-amber-100') :
                  item.type === 'referral' ? 'bg-blue-100' : 'bg-amber-100'
                }`}>
                  {item.type === 'conservation' ? (
                    <svg className={`w-4.5 h-4.5 ${item.urgent ? 'text-red-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : item.type === 'referral' ? (
                    <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  ) : (
                    <svg className="w-4.5 h-4.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#000000] truncate">{item.label}</p>
                  <p className="text-xs text-[#707070] truncate">{item.sublabel}</p>
                </div>
                {item.urgent && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold shrink-0">Urgent</span>
                )}
                <svg className="w-4 h-4 text-[#d0d0d0] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Referrals Summary */}
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#000000]">Referral Pipeline</h3>
            <button onClick={() => router.push('/dashboard/referrals')} className="text-xs text-[#005851] font-medium hover:underline">
              View All
            </button>
          </div>
          {referrals.length === 0 ? (
            <p className="text-sm text-[#707070]">No referrals yet. When your clients refer someone through the app, they&rsquo;ll appear here.</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center">
                <p className="text-xl font-bold text-[#000000]">{referrals.filter((r) => r.status === 'pending' || r.status === 'outreach-sent').length}</p>
                <p className="text-xs text-[#707070]">Outreach</p>
              </div>
              <div className="w-px h-10 bg-[#d0d0d0]" />
              <div className="flex-1 text-center">
                <p className="text-xl font-bold text-blue-600">{activeReferrals.length}</p>
                <p className="text-xs text-[#707070]">Active</p>
              </div>
              <div className="w-px h-10 bg-[#d0d0d0]" />
              <div className="flex-1 text-center">
                <p className="text-xl font-bold text-green-600">{bookedReferrals.length}</p>
                <p className="text-xs text-[#707070]">Booked</p>
              </div>
            </div>
          )}
        </div>

        {/* Conservation Summary */}
        <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#000000]">Conservation Status</h3>
            <button onClick={() => router.push('/dashboard/conservation')} className="text-xs text-[#005851] font-medium hover:underline">
              View All
            </button>
          </div>
          {conservationAlerts.length === 0 ? (
            <p className="text-sm text-[#707070]">No at-risk policies. When a carrier sends a lapse notice, paste it in Conservation to track it.</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center">
                <p className={`text-xl font-bold ${activeConservation.length > 0 ? 'text-amber-600' : 'text-[#000000]'}`}>{activeConservation.length}</p>
                <p className="text-xs text-[#707070]">Active</p>
              </div>
              <div className="w-px h-10 bg-[#d0d0d0]" />
              <div className="flex-1 text-center">
                <p className={`text-xl font-bold ${chargebackCount > 0 ? 'text-red-600' : 'text-[#000000]'}`}>{chargebackCount}</p>
                <p className="text-xs text-[#707070]">Chargeback Risk</p>
              </div>
              <div className="w-px h-10 bg-[#d0d0d0]" />
              <div className="flex-1 text-center">
                <p className="text-xl font-bold text-green-600">{conservationAlerts.filter((a) => a.status === 'saved').length}</p>
                <p className="text-xs text-[#707070]">Saved</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state for brand new agents */}
      {clients.length === 0 && referrals.length === 0 && conservationAlerts.length === 0 && (
        <div className="mt-8 bg-white rounded-[5px] border border-[#d0d0d0] p-8 text-center">
          <div className="w-16 h-16 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#000000] mb-2">Welcome to AgentForLife</h3>
          <p className="text-[#707070] text-sm mb-6 max-w-md mx-auto">
            Start by adding your clients. Each one gets a unique code to download your branded app. From there, referrals and policy tracking happen automatically.
          </p>
          <button
            onClick={() => router.push('/dashboard/clients')}
            className="px-6 py-3 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
          >
            Add Your First Client
          </button>
        </div>
      )}
    </div>
  );
}
