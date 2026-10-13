import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaAgendaRepo } from "@/lib/agenda-repo";
import { listProfessionals } from "@/lib/agenda-service";
import { prismaCatalogRepo } from "@/lib/catalog-repo";
import { listServices } from "@/lib/catalog-service";
import { prismaCustomerRepo } from "@/lib/customer-repo";
import { getCustomer, listCustomers } from "@/lib/customer-service";
import { NotFoundError } from "@/lib/errors";
import { formatBRL, formatDuration } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { localDateString } from "@/lib/timezone";
import { AppointmentForm } from "./appointment-form";

export const dynamic = "force-dynamic";

export default async function NovoAgendamentoPage({ searchParams }: { searchParams: Promise<{ clienteId?: string; data?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "write")) redirect("/agenda");
  const { clienteId, data } = await searchParams;
  const defaultDate = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : localDateString(new Date());

  const back = (
    <p>
      <Link href="/agenda">← Agenda</Link>
    </p>
  );

  // Passo 1: escolher o cliente (assim os pets listados no passo 2 são só os dele).
  if (!clienteId) {
    const customers = await listCustomers(prismaCustomerRepo, session);
    return (
      <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
        {back}
        <h1>Novo agendamento</h1>
        {customers.length === 0 ? (
          <p>
            Nenhum cliente cadastrado. <Link href="/clientes/novo">Cadastrar cliente</Link>
          </p>
        ) : (
          <form method="get" action="/agenda/novo" style={{ display: "grid", gap: "0.75rem" }}>
            <input type="hidden" name="data" value={defaultDate} />
            <label>
              Cliente
              <select name="clienteId" required style={{ display: "block", width: "100%" }}>
                <option value="">Selecione</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Continuar</button>
          </form>
        )}
      </main>
    );
  }

  // Passo 2: dados do agendamento.
  const customer = await getCustomer(prismaCustomerRepo, session, clienteId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [services, professionals] = await Promise.all([
    listServices(prismaCatalogRepo, session),
    listProfessionals(prismaAgendaRepo, session),
  ]);

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      {back}
      <h1>Novo agendamento</h1>
      <p>
        Cliente: <strong>{customer.name}</strong>
      </p>
      {customer.pets.length === 0 ? (
        <p>
          Este cliente ainda não tem pets. <Link href={`/clientes/${customer.id}`}>Cadastrar pet</Link>
        </p>
      ) : services.length === 0 ? (
        <p>
          Nenhum serviço ativo no catálogo. <Link href="/servicos">Ver serviços</Link>
        </p>
      ) : (
        <AppointmentForm
          customerId={customer.id}
          pets={customer.pets.map((p) => ({ id: p.id, label: p.name }))}
          services={services.map((s) => ({
            id: s.id,
            label: `${s.name} — ${formatDuration(s.durationMinutes)} — ${formatBRL(s.priceCents)}`,
          }))}
          professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
          defaultDate={defaultDate}
        />
      )}
    </main>
  );
}
