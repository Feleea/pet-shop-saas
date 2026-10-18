import { expect, test, type Page } from "@playwright/test";
import { createServiceUi } from "./agenda-helpers";
import { addServiceToCart, configureCompanyUi, fillReturn, openReturnForm, setProductFiscalUi, setServiceFiscalUi } from "./fase5-helpers";
import { unique } from "./helpers";
import { addProductToCart, createProductUi, finalizeSale, quickSale } from "./pdv-helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

/** Pet shop com empresa completa, produto Shampoo e serviço Banho, os dois com dados fiscais. */
async function fiscalReadyShop(page: Page, label = "Loja Fiscal") {
  await newShopWithAdmin(page, label);
  await configureCompanyUi(page);
  const shampoo = await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "20" });
  await setProductFiscalUi(page, shampoo);
  await createServiceUi(page, "Banho", "60", "50,00");
  await setServiceFiscalUi(page, "Banho");
}

const fiscal = (page: Page) => page.getByTestId("fiscal-section");
const emit = (page: Page) => fiscal(page).getByRole("button", { name: "Emitir nota fiscal" }).click();

test("sem os dados da empresa, a emissão é recusada e diz o que falta", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await quickSale(page, "Shampoo", 1);

  await expect(fiscal(page)).toContainText("Nenhuma nota emitida.");
  await emit(page);
  await expect(fiscal(page).getByRole("alert")).toContainText("Dados da empresa incompletos: Razão social, CNPJ");
  await expect(fiscal(page).getByRole("alert")).toContainText("Inscrição estadual");
  await expect(fiscal(page).getByRole("alert")).toContainText('Produto "Shampoo": informe o NCM');
  await expect(fiscal(page)).toContainText("Nenhuma nota emitida.");
});

test("com a empresa configurada mas o produto sem NCM, recusa e aponta o produto", async ({ page }) => {
  await newShopWithAdmin(page);
  await configureCompanyUi(page);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await quickSale(page, "Shampoo", 1);
  await emit(page);
  await expect(fiscal(page).getByRole("alert")).toHaveText(
    'Produto "Shampoo": informe o NCM (8 dígitos); Produto "Shampoo": informe o CFOP (4 dígitos); Produto "Shampoo": informe o CSOSN (3 dígitos)',
  );
});

test("emite a NFC-e (provedor SIMULADO) e marca claramente que não tem validade fiscal", async ({ page }) => {
  await fiscalReadyShop(page);
  await quickSale(page, "Shampoo", 2, "PIX");
  await emit(page);

  await expect(fiscal(page).getByRole("status")).toHaveText("Nota emitida.");
  const doc = page.getByTestId("fiscal-doc");
  await expect(doc).toHaveCount(1);
  await expect(doc).toContainText("NFC-e (produtos)");
  await expect(doc.getByTestId("fiscal-status")).toHaveText("Autorizada");
  await expect(doc.getByTestId("fiscal-env")).toHaveText("SIMULADO — sem validade fiscal");
  await expect(doc).toContainText("Nº 1");
  await expect(doc).toContainText("R$ 60,00");
  await expect(doc.getByTestId("fiscal-key")).toHaveText("SIMULADO-NFCE-11222333000181-000000001");
});

test("venda de produto + serviço: duas notas (NFC-e e NFS-e), e não emite duas vezes", async ({ page }) => {
  await fiscalReadyShop(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 1);
  await addServiceToCart(page, "Banho");
  await finalizeSale(page, "CASH");
  await emit(page);

  const docs = page.getByTestId("fiscal-doc");
  await expect(docs).toHaveCount(2);
  await expect(docs.filter({ hasText: "NFC-e (produtos)" })).toContainText("R$ 30,00");
  await expect(docs.filter({ hasText: "NFS-e (serviços)" })).toContainText("R$ 50,00");

  await emit(page);
  await expect(fiscal(page).getByRole("alert")).toHaveText("Esta venda já possui nota fiscal emitida");
  await expect(docs).toHaveCount(2);
});

test("o comprovante passa a mostrar a nota emitida (e o aviso de simulação)", async ({ page }) => {
  await fiscalReadyShop(page);
  await quickSale(page, "Shampoo", 1);
  await emit(page);
  await expect(fiscal(page).getByRole("status")).toBeVisible();
  await page.getByRole("link", { name: "Comprovante" }).click();

  await expect(page.getByTestId("receipt-no-fiscal")).toHaveCount(0);
  await expect(page.getByTestId("receipt-fiscal")).toContainText("NFC-e (produtos) nº 1");
  await expect(page.getByTestId("receipt-fiscal")).toContainText("SIMULADO-NFCE-11222333000181-000000001");
  await expect(page.getByTestId("receipt-fiscal")).toContainText("SIMULADO — sem validade fiscal");
});

test("com nota autorizada, a venda não pode ser cancelada nem devolvida até cancelar a nota", async ({ page }) => {
  await fiscalReadyShop(page);
  await quickSale(page, "Shampoo", 2);
  const saleUrl = page.url();
  await emit(page);
  await expect(fiscal(page).getByRole("status")).toBeVisible();

  await expect(page.getByTestId("cancel-blocked")).toHaveText("Cancele a nota fiscal antes de cancelar a venda.");
  await expect(page.getByRole("button", { name: "Cancelar venda" })).toHaveCount(0);

  await page.goto(`${saleUrl}/devolucao`);
  await expect(page.getByRole("alert")).toHaveText("Esta venda possui nota fiscal emitida: cancele a nota antes de continuar.");
});

test("cancelar a nota exige justificativa de 15 a 255 caracteres e libera a venda", async ({ page }) => {
  await fiscalReadyShop(page);
  await quickSale(page, "Shampoo", 1);
  await emit(page);
  await expect(fiscal(page).getByTestId("fiscal-status")).toHaveText("Autorizada");

  page.once("dialog", (d) => d.accept());
  await fiscal(page).getByLabel("Justificativa do cancelamento da nota").fill("curta");
  await fiscal(page).getByRole("button", { name: "Cancelar nota" }).click();
  await expect(fiscal(page).getByRole("alert")).toHaveText("A justificativa deve ter de 15 a 255 caracteres");
  await expect(fiscal(page).getByTestId("fiscal-status")).toHaveText("Autorizada");

  page.once("dialog", (d) => d.accept());
  await fiscal(page).getByLabel("Justificativa do cancelamento da nota").fill("Emitida em duplicidade por engano");
  await fiscal(page).getByRole("button", { name: "Cancelar nota" }).click();
  await expect(fiscal(page).getByTestId("fiscal-status")).toHaveText("Cancelada");
  await expect(fiscal(page)).toContainText("Justificativa: Emitida em duplicidade por engano");
  await expect(fiscal(page).getByRole("button", { name: "Cancelar nota" })).toHaveCount(0);

  // depois de cancelada, a venda volta a poder ser cancelada ou receber nota nova
  await expect(page.getByRole("button", { name: "Cancelar venda" })).toBeVisible();
  await emit(page);
  await expect(page.getByTestId("fiscal-doc")).toHaveCount(2);
});

test("venda com devolução não recebe nota automática", async ({ page }) => {
  await fiscalReadyShop(page);
  await quickSale(page, "Shampoo", 2);
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await page.getByRole("button", { name: "Registrar devolução" }).click();
  await page.getByRole("link", { name: /← Venda #1/ }).click();

  await expect(page.getByTestId("fiscal-blocked")).toContainText("possui devoluções");
  await expect(fiscal(page).getByRole("button", { name: "Emitir nota fiscal" })).toHaveCount(0);
});

test("o atendente emite a nota, mas só o administrador cancela", async ({ page, browser }) => {
  await fiscalReadyShop(page);
  const att = await inviteAndAccept(browser, page, "Atendente Ana", `ana-${unique()}@mail.com`, "ATTENDANT");
  await quickSale(att.page, "Shampoo", 1);
  await emit(att.page);
  await expect(fiscal(att.page).getByTestId("fiscal-status")).toHaveText("Autorizada");
  await expect(fiscal(att.page).getByRole("button", { name: "Cancelar nota" })).toHaveCount(0);
  await att.ctx.close();
});

test("ISOLAMENTO: as notas de um pet shop não aparecem nem são acessíveis em outro", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await fiscalReadyShop(pageA, "Loja A");
  await quickSale(pageA, "Shampoo", 1);
  await emit(pageA);
  await expect(fiscal(pageA).getByRole("status")).toBeVisible();
  const urlA = pageA.url();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  expect((await pageB.goto(urlA))?.status()).toBe(404);
  await createProductUi(pageB, { name: "Shampoo", price: "30,00", initial: "5" });
  await quickSale(pageB, "Shampoo", 1);
  await expect(fiscal(pageB)).toContainText("Nenhuma nota emitida.");
  await ctxA.close();
  await ctxB.close();
});
