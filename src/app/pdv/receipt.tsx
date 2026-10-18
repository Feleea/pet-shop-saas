import { formatCep, formatCnpj } from "@/lib/br-validators";
import type { CompanyData } from "@/lib/company-service";
import { formatPhone } from "@/lib/format";

/** Estilo do comprovante: largura de bobina (80 mm) na tela e na impressão, sem menus nem botões ao imprimir. */
const CSS = `
.receipt{max-width:80mm;margin:1rem auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.35}
.receipt h1,.receipt h2{font-size:13px;text-align:center;margin:.4rem 0}
.receipt hr{border:0;border-top:1px dashed #000;margin:.5rem 0}
.receipt table{width:100%;border-collapse:collapse}
.receipt td{padding:1px 0;vertical-align:top}
.receipt .right{text-align:right;white-space:nowrap}
.receipt .center{text-align:center}
.receipt .warn{border:1px solid #000;padding:3px;text-align:center;font-weight:bold;margin:.5rem 0}
.receipt p{margin:.15rem 0}
@page{margin:5mm}
@media print{.no-print{display:none!important}body{margin:0}.receipt{margin:0 auto;max-width:none;width:72mm}}
`;

export function ReceiptStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export function CompanyHeader({ company }: { company: CompanyData }) {
  const where = [company.addressLine, [company.city, company.state].filter(Boolean).join("/"), company.zipCode ? formatCep(company.zipCode) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="center" data-testid="receipt-company">
      <h2>{company.name}</h2>
      {company.legalName && <p>{company.legalName}</p>}
      {company.cnpj && <p>CNPJ {formatCnpj(company.cnpj)}</p>}
      {company.stateRegistration && <p>IE {company.stateRegistration}</p>}
      {where && <p>{where}</p>}
      {company.phone && <p>Tel. {formatPhone(company.phone)}</p>}
    </header>
  );
}
