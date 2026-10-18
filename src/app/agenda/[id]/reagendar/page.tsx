import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaAgendaRepo } from "@/lib/agenda-repo";
import { MSG } from "@/lib/agenda-constants";
import { getAppointment, listProfessionals } from "@/lib/agenda-service";
import { NotFoundError } from "@/lib/errors";
import { formatDuration } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { localDateString, localTimeString } from "@/lib/timezone";
import { RescheduleForm } from "./reschedule-form";

export const dynamic = "force-dynamic";

export default async function ReagendarPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "write")) redirect("/agenda");
  const { id } = await params;

  const appt = await getAppointment(prismaAgendaRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const professionals = await listProfessionals(prismaAgendaRepo, session);

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href={`/agenda?data=${localDateString(appt.startsAt)}`}>← Agenda</Link>
      </p>
      <h1>Reagendar</h1>
      <p>
        <strong>{appt.petName}</strong> ({appt.customerName}) · {appt.serviceName} · {formatDuration(appt.durationMinutes)}
      </p>
      {appt.status !== "SCHEDULED" ? (
        <p role="alert">{MSG.notScheduled}.</p>
      ) : (
        <RescheduleForm
          id={appt.id}
          professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
          defaults={{
            professionalId: appt.professionalId,
            date: localDateString(appt.startsAt),
            time: localTimeString(appt.startsAt),
          }}
        />
      )}
    </main>
  );
}
