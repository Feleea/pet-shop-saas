import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCep, formatCnpj } from "@/lib/br-validators";
import { prismaCompanyRepo } from "@/lib/company-repo";
import { getCompany } from "@/lib/company-service";
import { ENVIRONMENT_LABEL } from "@/lib/fiscal-constants";
import { getFiscalProvider } from "@/lib/fiscal-provider";
import { formatPhone } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const session = await requireSession();
  if (!can(session.role, "settings")) redirect("/painel");
  const c = await getCompany(prismaCompanyRepo, session);

  let providerInfo: { name: string; environment: string } | { error: string };
  try {
    const p = getFiscalProvider();
    providerInfo = { name: p.name, environment: ENVIRONMENT_LABEL[p.environment] };
  } catch (e) {
    providerInfo = { error: e instanceof Error ? e.message : "Provedor fiscal não configurado" };
  }

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Configurações</h1>
      <h2>Dados da empresa</h2>
      <p>Aparecem no comprovante e são exigidos para emitir nota fiscal.</p>

      <p data-testid="fiscal-provider" style={{ border: "1px solid #999", padding: "0.5rem" }}>
        Emissão de notas:{" "}
        {"error" in providerInfo ? (
          <strong style={{ color: "crimson" }}>{providerInfo.error}</strong>
        ) : (
          <>
            <strong>{providerInfo.name}</strong> — {providerInfo.environment}
          </>
        )}
      </p>

      <CompanyForm
        defaults={{
          name: c.name,
          legalName: c.legalName ?? "",
          cnpj: c.cnpj ? formatCnpj(c.cnpj) : "",
          stateRegistration: c.stateRegistration ?? "",
          municipalRegistration: c.municipalRegistration ?? "",
          taxRegime: c.taxRegime ?? "",
          addressLine: c.addressLine ?? "",
          city: c.city ?? "",
          state: c.state ?? "",
          zipCode: c.zipCode ? formatCep(c.zipCode) : "",
          phone: c.phone ? formatPhone(c.phone) : "",
        }}
      />
    </main>
  );
}
