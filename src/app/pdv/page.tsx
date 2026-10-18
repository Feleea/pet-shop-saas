import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaCatalogRepo } from "@/lib/catalog-repo";
import { listServices } from "@/lib/catalog-service";
import { prismaCustomerRepo } from "@/lib/customer-repo";
import { listCustomers } from "@/lib/customer-service";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { prismaInventoryRepo } from "@/lib/inventory-repo";
import { listProducts } from "@/lib/inventory-service";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { APPOINTMENT_UNAVAILABLE_MESSAGE, listBillableAppointments } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { SaleForm } from "./sale-form";

export const dynamic = "force-dynamic";

export default async function PdvPage({ searchParams }: { searchParams: Promise<{ atendimento?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "sell")) redirect("/painel");
  const { atendimento } = await searchParams;

  const [products, services, appointments, customers] = await Promise.all([
    listProducts(prismaInventoryRepo, session),
    listServices(prismaCatalogRepo, session),
    listBillableAppointments(prismaSalesRepo, session),
    listCustomers(prismaCustomerRepo, session),
  ]);
  const preload = atendimento ? appointments.find((a) => a.id === atendimento) : undefined;

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>PDV — Nova venda</h1>
      <p>
        <Link href="/pdv/vendas">Vendas do dia</Link>
      </p>
      {atendimento && !preload && (
        <p role="alert" style={{ color: "crimson" }}>
          {APPOINTMENT_UNAVAILABLE_MESSAGE}
        </p>
      )}
      <SaleForm
        products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, stock: p.stockQuantity }))}
        services={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents }))}
        appointments={appointments.map((a) => ({
          id: a.id,
          label: `${a.petName} (${a.customerName}) — ${a.serviceName} — ${formatDateTimeBR(a.startsAt)} — ${formatBRL(a.priceCents)}`,
          priceCents: a.priceCents,
          customerId: a.customerId,
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        initialAppointmentId={preload?.id}
      />
    </main>
  );
}
