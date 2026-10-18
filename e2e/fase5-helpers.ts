import { expect, type Page } from "@playwright/test";
import { selectByText } from "./agenda-helpers";

export const VALID_CNPJ = "11.222.333/0001-81";

export interface CompanyInput {
  legalName?: string;
  cnpj?: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  taxRegime?: "MEI" | "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
  addressLine?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
}

/** Preenche e salva os dados da empresa (por padrão, um cadastro completo e válido para emitir nota). */
export async function configureCompanyUi(page: Page, over: CompanyInput = {}) {
  const c = {
    legalName: "Pet Shop Teste Comércio LTDA",
    cnpj: VALID_CNPJ,
    stateRegistration: "123456789",
    municipalRegistration: "98765",
    taxRegime: "SIMPLES_NACIONAL",
    addressLine: "Rua das Flores, 100",
    city: "Salvador",
    state: "BA",
    zipCode: "40010-000",
    phone: "7132221234",
    ...over,
  };
  await page.goto("/configuracoes");
  await page.getByLabel("Razão social").fill(c.legalName);
  await page.getByLabel("CNPJ").fill(c.cnpj);
  await page.getByLabel("Inscrição estadual").fill(c.stateRegistration);
  await page.getByLabel("Inscrição municipal").fill(c.municipalRegistration);
  await page.getByLabel("Regime tributário").selectOption(c.taxRegime);
  await page.getByLabel("Endereço").fill(c.addressLine);
  await page.getByLabel("Cidade").fill(c.city);
  await page.getByLabel("UF").selectOption(c.state);
  await page.getByLabel("CEP").fill(c.zipCode);
  await page.getByLabel("Telefone").fill(c.phone);
  await page.getByRole("button", { name: "Salvar dados da empresa" }).click();
  await expect(page.getByRole("status")).toHaveText("Dados salvos.");
}

export async function setProductFiscalUi(page: Page, productId: string, f = { ncm: "3305.10.00", cfop: "5102", csosn: "102" }) {
  await page.goto(`/estoque/${productId}`);
  await page.getByLabel("NCM").fill(f.ncm);
  await page.getByLabel("CFOP").fill(f.cfop);
  await page.getByLabel("CSOSN").fill(f.csosn);
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dados salvos." })).toBeVisible();
}

export async function setServiceFiscalUi(page: Page, serviceName: string, code = "05.08", iss = "5") {
  await page.goto("/servicos");
  await page.getByRole("row", { name: new RegExp(serviceName) }).getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Código do serviço (LC 116)").fill(code);
  await page.getByLabel("Alíquota do ISS (%)").fill(iss);
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(page).toHaveURL(/\/servicos$/);
}

export async function addServiceToCart(page: Page, serviceText: string, quantity = 1) {
  await selectByText(page.getByTestId("service-select"), serviceText);
  await page.getByTestId("service-quantity").fill(String(quantity));
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await expect(page.getByTestId("cart-line").filter({ hasText: serviceText })).toHaveCount(1);
}

/** A partir do detalhe da venda, abre a tela de devolução/troca. */
export async function openReturnForm(page: Page) {
  await page.getByRole("link", { name: "Registrar devolução ou troca" }).click();
  await expect(page).toHaveURL(/\/devolucao$/);
}

/** Informa as quantidades a devolver (por descrição do item) e o motivo. */
export async function fillReturn(page: Page, quantities: Record<string, number>, reason = "Embalagem danificada") {
  for (const [description, qty] of Object.entries(quantities)) {
    await page.getByLabel(`Quantidade a devolver de ${description}`).fill(String(qty));
  }
  await page.getByLabel("Motivo da devolução").fill(reason);
}

export async function addExchangeProduct(page: Page, productText: string, quantity = 1) {
  await selectByText(page.getByTestId("exchange-product-select"), productText);
  await page.getByTestId("exchange-product-qty").fill(String(quantity));
  await page.getByRole("button", { name: "Adicionar produto à troca" }).click();
}

export const saleIdFromUrl = (page: Page) => new URL(page.url()).pathname.split("/")[3];
