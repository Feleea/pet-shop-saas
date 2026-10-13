import Link from "next/link";
import { prismaAgendaRepo } from "@/lib/agenda-repo";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/agenda-constants";
import { listAgenda, listProfessionals } from "@/lib/agenda-service";
import { ValidationError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { formatDateBR } from "@/lib/team-format";
import { addDays, localDateString, localTimeString } from "@/lib/timezone";
import { AppointmentControls } from "./appointment-controls";

export const dynamic = "force-dynamic";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ data?: string; profissional?: string }> }) {
  const session = await requireSession();
  const { data, profissional } = await searchParams;

  let error: string | undefined;
  let agenda;
  try {
    agenda = await listAgenda(prismaAgendaRepo, session, { date: data, professionalId: profissional });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    error = e.message;
    agenda = await listAgenda(prismaAgendaRepo, session, { professionalId: profissional });
  }
  const professionals = await listProfessionals(prismaAgendaRepo, session);
  const canWrite = can(session.role, "write");

  const link = (d: string) => `/agenda?data=${d}${profissional ? `&profissional=${profissional}` : ""}`;
  const today = localDateString(new Date());

  return (
    <main style={{ maxWidth: 980, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Agenda</h1>
      <h2 data-testid="agenda-date">{formatDateBR(new Date(`${agenda.date}T00:00:00Z`))}</h2>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={link(addDays(agenda.date, -1))}>← Dia anterior</Link>
        <Link href={link(today)}>Hoje</Link>
        <Link href={link(addDays(agenda.date, 1))}>Próximo dia →</Link>
      </nav>

      <form method="get" style={{ display: "flex", gap: "0.75rem", alignItems: "end", margin: "1rem 0" }}>
        <label>
          Data <input type="date" name="data" defaultValue={agenda.date} />
        </label>
        <label>
          Profissional
          <select name="profissional" defaultValue={profissional ?? ""}>
            <option value="">Todos</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>

      {canWrite && (
        <p>
          <Link href={`/agenda/novo?data=${agenda.date}`}>Novo agendamento</Link>
        </p>
      )}

      {agenda.items.length === 0 ? (
        <p>Nenhum agendamento neste dia.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Horário</th>
              <th align="left">Pet</th>
              <th align="left">Serviço</th>
              <th align="left">Profissional</th>
              <th align="left">Situação</th>
              <th align="left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {agenda.items.map((a) => (
              <tr key={a.id} data-testid="appointment-row" style={{ opacity: a.status === "SCHEDULED" ? 1 : 0.6 }}>
                <td>
                  {localTimeString(a.startsAt)}–{localTimeString(a.endsAt)}
                </td>
                <td>
                  <strong>{a.petName}</strong> <small>({a.customerName})</small>
                </td>
                <td>
                  {a.serviceName} · {formatBRL(a.priceCents)}
                </td>
                <td>{a.professionalName}</td>
                <td data-testid="appointment-status">{APPOINTMENT_STATUS_LABEL[a.status]}</td>
                <td>
                  {a.status === "SCHEDULED" ? (
                    <AppointmentControls
                      id={a.id}
                      canManage={canWrite}
                      canComplete={canWrite || a.professionalId === session.userId}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
