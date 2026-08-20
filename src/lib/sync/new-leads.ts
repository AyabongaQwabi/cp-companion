import type { Db } from 'mongodb';
import type { Company, CompanionUser, ClinicPlusUserDocument, NewCompanyLead } from '../types';

/**
 * Flags any production.companies document that has never had a newCompanyLeads row before —
 * insert-only, so a company flagged once stays a permanent record even if it later becomes a
 * real Companion user (isOnCompanion flips to true instead of the row disappearing). Superadmin
 * running list, not client-facing.
 */
export async function syncNewCompanyLeads(
  prodDb: Db,
  companionDb: Db,
  companyIds: string[]
): Promise<{ processed: number; errors: number }> {
  if (companyIds.length === 0) return { processed: 0, errors: 0 };

  const leads = companionDb.collection<NewCompanyLead>('newCompanyLeads');
  const existingIds = new Set(
    (await leads.find({ companyId: { $in: companyIds } }).project({ companyId: 1 }).toArray()).map(
      (r) => (r as { companyId: string }).companyId
    )
  );

  const newIds = companyIds.filter((id) => !existingIds.has(id));
  const now = new Date();
  let processed = 0;
  let errors = 0;

  if (newIds.length > 0) {
    const companies = await prodDb
      .collection<Company>('companies')
      .find({ id: { $in: newIds } })
      .toArray();

    const newLeadDocs: NewCompanyLead[] = companies.map((company) => {
      const firstTracking = company.tracking?.[0]?.date;
      return {
        companyId: company.id,
        companyName: company.details?.name || '',
        firstSeenAt: firstTracking ? new Date(firstTracking) : now,
        isOnCompanion: false,
      };
    });

    if (newLeadDocs.length > 0) {
      try {
        await leads.insertMany(newLeadDocs, { ordered: false });
        processed += newLeadDocs.length;
      } catch {
        errors += newLeadDocs.length;
      }
    }
  }

  // Refresh isOnCompanion for every lead — a company graduates to "on Companion" once any
  // production.users document managing/editing it has a companionUsers row.
  const allLeads = await leads.find({ isOnCompanion: false }).toArray();
  if (allLeads.length > 0) {
    const leadCompanyIds = allLeads.map((l) => l.companyId);
    const managingUsers = await prodDb
      .collection<ClinicPlusUserDocument>('users')
      .find({
        $or: [
          { 'companiesManaging.id': { $in: leadCompanyIds } },
          { 'companiesCanEdit.id': { $in: leadCompanyIds } },
        ],
      })
      .toArray();

    const managingUserIds = managingUsers.map((u) => u.id);
    const companionUserIds = new Set(
      (
        await companionDb
          .collection<CompanionUser>('companionUsers')
          .find({ productionUserId: { $in: managingUserIds } })
          .project({ productionUserId: 1 })
          .toArray()
      ).map((r) => (r as { productionUserId: string }).productionUserId)
    );

    const onCompanionCompanyIds = new Set<string>();
    for (const user of managingUsers) {
      if (!companionUserIds.has(user.id)) continue;
      for (const c of [...(user.companiesManaging || []), ...(user.companiesCanEdit || [])]) {
        onCompanionCompanyIds.add(c.id);
      }
    }

    if (onCompanionCompanyIds.size > 0) {
      try {
        await leads.updateMany(
          { companyId: { $in: Array.from(onCompanionCompanyIds) } },
          { $set: { isOnCompanion: true } }
        );
      } catch {
        errors += onCompanionCompanyIds.size;
      }
    }
  }

  return { processed, errors };
}
