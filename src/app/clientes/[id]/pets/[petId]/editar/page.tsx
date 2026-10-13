import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaCustomerRepo } from "@/lib/customer-repo";
import { getCustomer } from "@/lib/customer-service";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { updatePetAction } from "../../../../actions";
import { PetForm } from "../../../../pet-form";

export const dynamic = "force-dynamic";

export default async function EditarPetPage({ params }: { params: Promise<{ id: string; petId: string }> }) {
  const session = await requireSession();
  const { id, petId } = await params;
  if (!can(session.role, "write")) redirect(`/clientes/${id}`);

  const customer = await getCustomer(prismaCustomerRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const pet = customer.pets.find((p) => p.id === petId);
  if (!pet) notFound();

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href={`/clientes/${customer.id}`}>← {customer.name}</Link>
      </p>
      <h1>Editar pet</h1>
      <PetForm
        action={updatePetAction.bind(null, customer.id, pet.id)}
        submitLabel="Salvar pet"
        defaults={{
          name: pet.name,
          species: pet.species,
          breed: pet.breed ?? "",
          size: pet.size ?? "",
          birthDate: pet.birthDate ? pet.birthDate.toISOString().slice(0, 10) : "",
          notes: pet.notes ?? "",
        }}
      />
    </main>
  );
}
