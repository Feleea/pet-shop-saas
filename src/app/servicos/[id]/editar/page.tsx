import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaCatalogRepo } from "@/lib/catalog-repo";
import { getService } from "@/lib/catalog-service";
import { NotFoundError } from "@/lib/errors";
import { centsToInput } from "@/lib/money";
import { bpToInput } from "@/lib/percent";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { updateServiceAction } from "../../actions";
import { ServiceForm } from "../../service-form";

export const dynamic = "force-dynamic";

export default async function EditarServicoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "catalog")) redirect("/servicos");
  const { id } = await params;

  const service = await getService(prismaCatalogRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/servicos">← Serviços</Link>
      </p>
      <h1>Editar serviço</h1>
      <ServiceForm
        action={updateServiceAction.bind(null, service.id)}
        submitLabel="Salvar serviço"
        defaults={{
          name: service.name,
          description: service.description ?? "",
          durationMinutes: String(service.durationMinutes),
          price: centsToInput(service.priceCents),
          serviceCode: service.serviceCode ?? "",
          issRate: service.issRateBp != null ? bpToInput(service.issRateBp) : "",
        }}
      />
    </main>
  );
}
