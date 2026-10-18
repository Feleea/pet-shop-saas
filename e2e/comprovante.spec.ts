import { expect, test, type Page } from "@playwright/test";
import { addExchangeProduct, configureCompanyUi, fillReturn, openReturnForm } from "./fase5-helpers";
import { addProductToCart, createProductUi, finalizeSale, quickSale } from "./pdv-helpers";
import { newShopWithAdmin } from "./team-helpers";

async function shopWithProducts(page: Page, label = "Loja") {
  await newShopWithAdmin(page, label);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await createProductUi(page, { name: "Ração", price: "120,00", initial: "3" });
}

const openReceipt = async (page: Page) => {
  await page.getByRole("link", { name: "Comprovante" }).click();
  await expect(page).toHaveURL(/\/comprovante$/);
};

test("comprovante da venda com os dados da empresa, itens, totais e aviso de que não tem valor fiscal", async ({ page }) => {
  await shopWithProducts(page);
  await configureCompanyUi(page);
  await quickSale(page, "Shampoo", 2, "PIX");
  await openReceipt(page);

  const company = page.getByTestId("receipt-company");
  await expect(company).toContainText("Pet Shop Teste Comércio LTDA");
  await expect(company).toContainText("CNPJ 11.222.333/0001-81");
  await expect(company).toContainText("Salvador/BA");
  await expect(company).toContainText("40010-000");
  await expect(company).toContainText("(71) 3222-1234");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("COMPROVANTE DE VENDA Nº 1");
  await expect(page.getByTestId("receipt-item")).toHaveCount(1);
  await expect(page.getByTestId("receipt-item")).toContainText("2 x Shampoo");
  await expect(page.getByTestId("receipt-total")).toHaveText("R$ 60,00");
  await expect(page.getByTestId("receipt-paid")).toHaveText("R$ 60,00");
  await expect(page.getByTestId("receipt")).toContainText("Pago em Pix");
  await expect(page.getByTestId("receipt-no-fiscal")).toHaveText("DOCUMENTO SEM VALOR FISCAL");
});

test("sem dados da empresa, o comprovante mostra só o nome do pet shop", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 1);
  await openReceipt(page);
  await expect(page.getByTestId("receipt-company")).not.toContainText("CNPJ");
  await expect(page.getByTestId("receipt-total")).toHaveText("R$ 30,00");
});

test("ao imprimir, somem os botões e os links e fica só o comprovante", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 1);
  await openReceipt(page);

  await expect(page.getByRole("button", { name: "Imprimir" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Imprimir" })).toBeHidden();
  await expect(page.getByRole("link", { name: /← Venda #1/ })).toBeHidden();
  await expect(page.getByTestId("receipt")).toBeVisible();
});

test("o botão Imprimir chama a impressão do navegador", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __prints: number };
    w.__prints = 0;
    window.print = () => {
      w.__prints++;
    };
  });
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 1);
  await openReceipt(page);
  await page.getByRole("button", { name: "Imprimir" }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
});

test("comprovante com desconto e com devolução", async ({ page }) => {
  await shopWithProducts(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 2);
  await page.getByLabel("Desconto (R$)").fill("6");
  await finalizeSale(page, "CASH");
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await page.getByRole("button", { name: "Registrar devolução" }).click();
  await page.getByRole("link", { name: /← Venda #1/ }).click();
  await openReceipt(page);

  await expect(page.getByTestId("receipt")).toContainText("Desconto");
  await expect(page.getByTestId("receipt")).toContainText("-R$ 6,00");
  await expect(page.getByTestId("receipt-total")).toHaveText("R$ 54,00");
  await expect(page.getByTestId("receipt-return")).toContainText("Devolução #1: R$ 27,00");
});

test("comprovante de uma venda de troca mostra o crédito aplicado", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2, "PIX");
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await addExchangeProduct(page, "Ração", 1);
  await page.getByLabel("Forma de pagamento da diferença").selectOption("CASH");
  await page.getByRole("button", { name: "Registrar troca" }).click();
  await page.getByRole("link", { name: "ver venda" }).click();
  await openReceipt(page);

  await expect(page.getByTestId("receipt-total")).toHaveText("R$ 120,00");
  await expect(page.getByTestId("receipt")).toContainText("Crédito de troca");
  await expect(page.getByTestId("receipt-paid")).toHaveText("R$ 90,00");
  await expect(page.getByTestId("receipt")).toContainText("Pago em Dinheiro");
});

test("venda cancelada: o comprovante avisa", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 1);
  await page.getByLabel("Motivo do cancelamento").fill("Erro de digitação");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByTestId("sale-status")).toHaveText("Cancelada");
  await openReceipt(page);
  await expect(page.getByTestId("receipt-canceled")).toHaveText("VENDA CANCELADA");
});

test("ISOLAMENTO: o comprovante de outro pet shop responde 404", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await shopWithProducts(pageA, "Loja A");
  await quickSale(pageA, "Shampoo", 1);
  await openReceipt(pageA);
  const url = pageA.url();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  expect((await pageB.goto(url))?.status()).toBe(404);
  await ctxA.close();
  await ctxB.close();
});
