import Link from "next/link";
import { notFound } from "next/navigation";
import { prismaCustomerRepo } from "@/lib/customer-repo";
import { getCustomer } from "@/lib/customer-service";
import { NotFoundError } from "@/lib/errors";
import { formatAge, formatPhone, SIZE_LABEL, SPECIES_LABEL } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { ConfirmSubmit } from "../../confirm-submit";
import { addPetAction, deleteCustomerAction, deletePetAction, updateCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";
import { PetForm } from "../pet-form";

export const dynamic = "force-dynamic";

export default async function ClienteDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { erro } = await searchParams;
  const customer = await getCustomer(prismaCustomerRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canWrite = can(session.role, "write");
  const canDelete = can(session.role, "delete");

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/clientes">← Clientes</Link>
      </p>
      <h1>{customer.name}</h1>
      {erro === "agendamentos" && (
        <p role="alert" style={{ color: "crimson" }}>
          Não é possível excluir: há agendamentos (mesmo cancelados ou concluídos) vinculados a este cadastro, que ficam guardados no histórico.
        </p>
      )}
      {canWrite && (
        <p>
          <Link href={`/agenda/novo?clienteId=${customer.id}`}>Agendar</Link>
        </p>
      )}
      <p>
        {customer.phone ? formatPhone(customer.phone) : "Sem telefone"}
        {customer.email ? ` · ${customer.email}` : ""}
      </p>
      {customer.notes && <p>{customer.notes}</p>}

      <h2>Pets</h2>
      {customer.pets.length === 0 ? (
        <p>Nenhum pet cadastrado.</p>
      ) : (
        <ul data-testid="pet-list">
          {customer.pets.map((p) => (
            <li key={p.id} style={{ marginBottom: "0.75rem" }}>
              <strong>{p.name}</strong> · {SPECIES_LABEL[p.species]}
              {p.breed ? ` · ${p.breed}` : ""}
              {p.size ? ` · ${SIZE_LABEL[p.size]}` : ""}
              {p.birthDate ? ` · ${formatAge(p.birthDate)}` : ""}
              {canWrite && (
                <>
                  {" "}
                  <Link href={`/clientes/${customer.id}/pets/${p.id}/editar`}>Editar pet</Link>
                </>
              )}
              {canDelete && (
                <form action={deletePetAction} style={{ display: "inline", marginLeft: "0.5rem" }}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="customerId" value={customer.id} />
                  <ConfirmSubmit message={`Excluir o pet ${p.name}?`}>Excluir pet</ConfirmSubmit>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <>
          <h2>Adicionar pet</h2>
          <PetForm action={addPetAction.bind(null, customer.id)} submitLabel="Adicionar pet" />

          <h2>Dados do cliente</h2>
          <CustomerForm
            action={updateCustomerAction.bind(null, customer.id)}
            submitLabel="Salvar cliente"
            defaults={{
              name: customer.name,
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              notes: customer.notes ?? "",
            }}
          />
        </>
      )}

      {canDelete && (
        <form action={deleteCustomerAction} style={{ marginTop: "2rem" }}>
          <input type="hidden" name="id" value={customer.id} />
          <ConfirmSubmit message="Excluir este cliente e todos os seus pets?">Excluir cliente</ConfirmSubmit>
        </form>
      )}
    </main>
  );
}
