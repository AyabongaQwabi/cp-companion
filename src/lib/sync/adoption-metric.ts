import type { Db } from 'mongodb';
import type { AdoptionMetric } from '../types';

/**
 * Platform-wide Companion-vs-direct appointment volume split — the single clearest adoption
 * signal, surfaced prominently on the superadmin view. companionCreatedAppointments counts
 * distinct appointmentIds in cp_companion.appointmentLog (written once per Companion-created
 * appointment, see /api/appointments POST) rather than trusting any flag on the production
 * document itself, since production has no such marker.
 */
export async function syncAdoptionMetric(
  prodDb: Db,
  companionDb: Db
): Promise<{ processed: number; errors: number }> {
  try {
    const [totalAppointments, companionCreatedAppointments] = await Promise.all([
      prodDb.collection('appointments').countDocuments({}),
      companionDb.collection('appointmentLog').distinct('appointmentId').then((ids) => ids.length),
    ]);

    const adoptionRate = totalAppointments > 0 ? companionCreatedAppointments / totalAppointments : 0;

    await companionDb.collection<AdoptionMetric>('adoptionMetrics').insertOne({
      computedAt: new Date(),
      totalAppointments,
      companionCreatedAppointments,
      adoptionRate: Math.round(adoptionRate * 10000) / 10000,
    });

    return { processed: 1, errors: 0 };
  } catch {
    return { processed: 0, errors: 1 };
  }
}
