'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Save, Tags, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { MEDICAL_SERVICES } from '@/lib/clinicplus-constants';
import type { EmployeeGroup, RosterEmployee } from '@/lib/types';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import Pagination from '@/components/Pagination';
import { useChargedAction } from '@/lib/useChargedAction';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import dashboardPages from '../../../../config/dashboard-pages.json';

export default function GroupsPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<EmployeeGroup | null>(null);
  const [members, setMembers] = useState<RosterEmployee[]>([]);
  const [candidatePage, setCandidatePage] = useState<RosterEmployee[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [addSearch, setAddSearch] = useState('');
  const [addPage, setAddPage] = useState(1);
  const [addPageSize, setAddPageSize] = useState(20);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const loadGroups = useCallback(async (uid: string) => {
    const res = await fetch(`/api/employee-groups?userId=${encodeURIComponent(uid)}`);
    setGroups(await res.json());
  }, []);

  const loadCandidates = useCallback(
    async (uid: string, search: string, page: number, pageSize: number) => {
      const params = new URLSearchParams({
        userId: uid,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/employees?${params.toString()}`);
      const data = await res.json();
      setCandidatePage(data.employees ?? []);
      setCandidateTotal(data.total ?? 0);
    },
    []
  );

  const loadMembers = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/employee-groups/${groupId}/members`);
    setMembers(await res.json());
  }, []);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Data fetch triggered on mount once session resolves.
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGroups(session.id);
    }
  }, [session, loadGroups]);

  useEffect(() => {
    // Data fetch triggered by selectedGroup changing.
    if (selectedGroup?._id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadMembers(selectedGroup._id);
      setRenameValue(selectedGroup.name);
    }
  }, [selectedGroup, loadMembers]);

  useEffect(() => {
    // Data fetch triggered by search/page/pageSize changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadCandidates(session.id, addSearch, addPage, addPageSize);
  }, [session, addSearch, addPage, addPageSize, loadCandidates]);

  const memberIds = useMemo(() => new Set(members.map((m) => m._id)), [members]);

  // Members can appear in the fetched page since exclusion isn't server-side; filter them out of
  // the rendered rows without affecting the reported total (a rare, cosmetic under-count on a
  // page shared with a just-added member).
  const candidates = useMemo(
    () => candidatePage.filter((e) => !memberIds.has(e._id)),
    [candidatePage, memberIds]
  );

  const changeAddSearch = (value: string) => {
    setAddSearch(value);
    setAddPage(1);
  };

  const changeAddPageSize = (size: number) => {
    setAddPageSize(size);
    setAddPage(1);
  };

  const createGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !session) return;
    requestAction(
      'group.create',
      'Create employee group',
      async () => {
        await fetch('/api/employee-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.id, name: newGroupName }),
        });
        setNewGroupName('');
        loadGroups(session.id);
      },
      { chargeSeparately: true }
    );
  };

  const deleteGroup = async (id: string) => {
    if (!session) return;
    requestAction(
      'group.delete',
      'Delete employee group',
      async () => {
        await fetch(`/api/employee-groups?_id=${id}&userId=${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        if (selectedGroup?._id === id) setSelectedGroup(null);
        loadGroups(session.id);
      },
      { chargeSeparately: true }
    );
  };

  const renameGroup = async () => {
    if (!selectedGroup?._id || !renameValue.trim() || !session) return;
    requestAction(
      'group.rename',
      'Rename employee group',
      async () => {
        setRenaming(true);
        try {
          await fetch('/api/employee-groups', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _id: selectedGroup._id, userId: session.id, name: renameValue.trim() }),
          });
          loadGroups(session.id);
          setSelectedGroup((prev) => (prev ? { ...prev, name: renameValue.trim() } : prev));
        } finally {
          setRenaming(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  const toggleDefaultService = (serviceId: string) => {
    if (!selectedGroup?._id || !session) return;
    const has = selectedGroup.defaultServiceIds?.includes(serviceId);
    const next = has
      ? selectedGroup.defaultServiceIds.filter((s) => s !== serviceId)
      : [...(selectedGroup.defaultServiceIds || []), serviceId];
    requestAction(
      'group.setDefaultServices',
      'Set group default services',
      async () => {
        await fetch('/api/employee-groups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: selectedGroup._id, userId: session.id, defaultServiceIds: next }),
        });
        setSelectedGroup((prev) => (prev ? { ...prev, defaultServiceIds: next } : prev));
        setGroups((prev) =>
          prev.map((g) => (g._id === selectedGroup._id ? { ...g, defaultServiceIds: next } : g))
        );
      },
      { chargeSeparately: true }
    );
  };

  const addMembers = (employeeIds: string[]) => {
    if (!selectedGroup?._id || employeeIds.length === 0 || !session) return;
    requestAction(
      'group.addRemoveEmployee',
      `Add ${employeeIds.length} employee(s) to group`,
      async () => {
        await fetch(`/api/employee-groups/${selectedGroup._id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.id, employeeIds }),
        });
        loadMembers(selectedGroup._id!);
        loadCandidates(session.id, addSearch, addPage, addPageSize);
      },
      { chargeSeparately: true, quantity: employeeIds.length }
    );
  };

  const removeMember = (employeeId: string) => {
    if (!selectedGroup?._id || !session) return;
    requestAction(
      'group.addRemoveEmployee',
      'Remove employee from group',
      async () => {
        await fetch(
          `/api/employee-groups/${selectedGroup._id}/members?employeeId=${employeeId}&userId=${encodeURIComponent(session.id)}`,
          { method: 'DELETE' }
        );
        loadMembers(selectedGroup._id!);
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.groups.title}
        description={dashboardPages.groups.description}
        icon={UsersRound}
      />

      <Link href="/roster" className="text-sm text-red-500 hover:text-red-600 transition-colors mb-6 inline-block">
        ← Back to roster
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Your groups ({groups.length})</h2>
          <p className="text-xs text-gray-500 mb-3">{dashboardPages.groups.helpers.groups}</p>
          <form onSubmit={createGroup} className="flex gap-2 mb-3">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New group"
              className="flex-1 min-w-0"
            />
            <Button type="submit" variant="primary" className="text-sm px-3 py-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </Button>
          </form>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
            {groups.map((g) => (
              <li
                key={g._id}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                  selectedGroup?._id === g._id ? 'bg-red-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedGroup(g)}
              >
                <span className="text-gray-800">{g.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGroup(g._id!);
                  }}
                  className="text-red-600 text-xs hover:text-red-700 transition-colors"
                >
                  <Trash2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Delete
                </button>
              </li>
            ))}
            {groups.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500">No groups yet.</li>
            )}
          </ul>
        </section>

        <section>
          {!selectedGroup && (
            <p className="text-sm text-gray-500">Select a group to manage it.</p>
          )}

          {selectedGroup && (
            <>
              <div className="flex gap-2 mb-6 items-center">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={renameGroup}
                  disabled={renaming || renameValue.trim() === selectedGroup.name}
                  variant="secondary"
                  className="text-sm px-3 py-1.5"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  {renaming ? 'Saving…' : 'Rename'}
                </Button>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Default services for this group
                </h3>
                <p className="text-xs text-gray-500 mb-2">
                  When employees are bulk-added to an appointment by this group, these services
                  are pre-filled automatically.
                </p>
                <div className="flex flex-wrap gap-3 text-xs border border-gray-200 rounded-card p-3 bg-white">
                  {Object.values(MEDICAL_SERVICES).map((svc) => (
                    <label key={svc.id} className="flex items-center gap-1 text-gray-700">
                      <Tags className="h-3 w-3 text-gray-400" aria-hidden="true" />
                      <input
                        type="checkbox"
                        checked={selectedGroup.defaultServiceIds?.includes(svc.id) || false}
                        onChange={() => toggleDefaultService(svc.id)}
                        className="accent-red-500"
                      />
                      {svc.title}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Members ({members.length})</h3>
                <p className="text-xs text-gray-500 mb-2">{dashboardPages.groups.helpers.members}</p>
                <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
                  {members.map((m) => (
                    <li
                      key={m._id}
                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-gray-800">
                        {m.name}{' '}
                        <span className="text-gray-500">
                          {m.idNumber} · {m.occupation}
                        </span>
                      </span>
                      <button
                        onClick={() => removeMember(m._id!)}
                        className="text-red-600 text-xs hover:text-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {members.length === 0 && (
                    <li className="px-3 py-4 text-sm text-gray-500">No members yet.</li>
                  )}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Add employees to this group</h3>
                <Input
                  value={addSearch}
                  onChange={(e) => changeAddSearch(e.target.value)}
                  placeholder="Search name, ID, occupation…"
                  className="w-56 mb-2 text-xs"
                />
                <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
                  {candidates.map((c) => (
                    <li
                      key={c._id}
                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-gray-800">
                        {c.name}{' '}
                        <span className="text-gray-500">
                          {c.idNumber} · {c.occupation}
                        </span>
                      </span>
                      <button
                        onClick={() => addMembers([c._id!])}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add
                      </button>
                    </li>
                  ))}
                  {candidates.length === 0 && (
                    <li className="px-3 py-4 text-sm text-gray-500">
                      No matching employees.
                    </li>
                  )}
                </ul>
                <Pagination
                  page={addPage}
                  pageSize={addPageSize}
                  total={candidateTotal}
                  onPageChange={setAddPage}
                  onPageSizeChange={changeAddPageSize}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {pending && balance !== null && (
        <ConfirmSpendModal
          actionLabel={pending.label}
          creditCost={pending.creditCost}
          currentBalance={balance}
          onConfirm={confirm}
          onCancel={cancel}
          confirming={confirming}
        />
      )}
    </main>
  );
}
