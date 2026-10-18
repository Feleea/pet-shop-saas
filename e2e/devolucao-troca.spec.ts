import { expect, test, type Page } from "@playwright/test";
import { createServiceUi } from "./agenda-helpers";
import { addExchangeProduct, addServiceToCart, fillReturn, openReturnForm, saleIdFromUrl } from "./fase5-helpers";
import { unique } from "./helpers";
import { addProductToCart, createProductUi, finalizeSale, productRow, quickSale, stockOf } from "./pdv-helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

/** Pet shop novo com Shampoo (R$ 30, 10 un.) e Ração (R$ 120, 3 un.). */
async function shopWithProducts(page: Page, label = "Loja") {
  await newShopWithAdmin(page, label);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await createProductUi(page, { name: "Ração", price: "120,00", initial: "3" });
}

const submit = (page: Page, label = "Registrar devolução") => page.getByRole("button", { name: label }).click();

test("devolução parcial: devolve o dinheiro, volta ao estoque e aparece na venda", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 4, "PIX"); // R$ 120,00; estoque 6
  await openReturnForm(page);

  await fillReturn(page, { Shampoo: 1 });
  await expect(page.getByTestId("return-value")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("return-refund")).toHaveText("R$ 30,00");
  await submit(page);

  await expect(page).toHaveURL(/\/pdv\/devolucoes\/[^/?]+\?nova=1/);
  await expect(page.getByRole("status")).toHaveText("Devolução registrada com sucesso.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("COMPROVANTE DE DEVOLUÇÃO Nº 1");
  await expect(page.getByTestId("return-value")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("return-refund")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("receipt")).toContainText("Devolvido em Pix");

  await page.getByRole("link", { name: /← Venda #1/ }).click();
  await expect(page.getByTestId("item-returned")).toHaveText("1");
  await expect(page.getByTestId("sale-return")).toContainText("Devolução #1");
  await expect(page.getByTestId("sale-returned-total")).toHaveText("R$ 30,00");
  expect(await stockOf(page, "Shampoo")).toBe("7");
});

test("produto avariado: devolve o dinheiro mas não volta ao estoque", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 4);
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 2 }, "Produto vazando");
  await page.getByLabel("Devolver os produtos ao estoque").uncheck();
  await submit(page);

  await expect(page.getByTestId("receipt")).toContainText("não voltou ao estoque");
  expect(await stockOf(page, "Shampoo")).toBe("6");
});

test("a quantidade é limitada ao que ainda pode ser devolvido, e depois de devolver tudo o atalho some", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 4);
  await openReturnForm(page);

  await page.getByLabel("Quantidade a devolver de Shampoo").fill("9"); // só há 4
  await expect(page.getByTestId("return-value")).toHaveText("R$ 120,00");
  await page.getByLabel("Motivo da devolução").fill("Cliente desistiu");
  await submit(page);

  await page.getByRole("link", { name: /← Venda #1/ }).click();
  await expect(page.getByTestId("item-returned")).toHaveText("4");
  await expect(page.getByRole("link", { name: "Registrar devolução ou troca" })).toHaveCount(0);
});

test("validações da devolução", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2);
  await openReturnForm(page);

  await submit(page);
  await expect(page.getByRole("alert")).toHaveText("Escolha ao menos um item para devolver");

  await page.getByLabel("Quantidade a devolver de Shampoo").fill("1");
  await submit(page);
  await expect(page.getByRole("alert")).toHaveText("Informe o motivo da devolução");
  await expect(page.getByLabel("Quantidade a devolver de Shampoo")).toHaveValue("1"); // não perde o que foi digitado
});

test("o desconto da venda é rateado na devolução", async ({ page }) => {
  await shopWithProducts(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 2);
  await page.getByLabel("Desconto (R$)").fill("6");
  await finalizeSale(page, "PIX");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 54,00");

  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await expect(page.getByTestId("return-value")).toHaveText("R$ 27,00");
  await submit(page);
  await expect(page.getByTestId("return-value")).toHaveText("R$ 27,00");

  await page.getByRole("link", { name: /← Venda #1/ }).click();
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await expect(page.getByTestId("return-value")).toHaveText("R$ 27,00"); // a última acerta os centavos
});

test("troca por um produto mais caro: o cliente paga só a diferença", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2, "PIX"); // R$ 60,00
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await addExchangeProduct(page, "Ração", 1);

  await expect(page.getByTestId("exchange-line")).toHaveCount(1);
  await expect(page.getByTestId("exchange-total")).toHaveText("R$ 120,00");
  await expect(page.getByTestId("return-applied")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("return-due")).toHaveText("R$ 90,00");
  await expect(page.getByTestId("return-refund")).toHaveText("R$ 0,00");
  await page.getByLabel("Forma de pagamento da diferença").selectOption("CASH");
  await submit(page, "Registrar troca");

  await expect(page.getByRole("status")).toHaveText("Troca registrada com sucesso.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("COMPROVANTE DE TROCA Nº 1");
  await expect(page.getByTestId("return-applied")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("return-exchange")).toContainText("nova venda nº 2");

  await page.getByRole("link", { name: "ver venda" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Venda #2");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 120,00");
  await expect(page.getByTestId("sale-credit")).toContainText("R$ 30,00");
  await expect(page.getByTestId("sale-credit")).toContainText("Dinheiro: R$ 90,00");

  expect(await stockOf(page, "Shampoo")).toBe("9"); // 10 − 2 + 1
  expect(await stockOf(page, "Ração")).toBe("2");
});

test("troca por algo mais barato: a diferença volta ao cliente", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Ração", 1, "PIX"); // R$ 120,00
  await openReturnForm(page);
  await fillReturn(page, { Ração: 1 }, "Cliente preferiu outro");
  await addExchangeProduct(page, "Shampoo", 1);
  await expect(page.getByTestId("return-refund")).toHaveText("R$ 90,00");
  await expect(page.getByTestId("return-due")).toHaveText("R$ 0,00");
  await page.getByLabel("Forma de devolução do dinheiro").selectOption("CASH");
  await submit(page, "Registrar troca");

  await expect(page.getByTestId("return-refund")).toHaveText("R$ 90,00");
  await expect(page.getByTestId("receipt")).toContainText("Devolvido em Dinheiro");
});

test("É TUDO OU NADA: se a troca falha por falta de estoque, a devolução também não acontece", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2);
  const saleUrl = page.url();
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await addExchangeProduct(page, "Ração", 5); // só há 3
  await submit(page, "Registrar troca");
  await expect(page.getByRole("alert")).toHaveText("Estoque insuficiente para Ração (disponível: 3)");

  await page.goto(saleUrl);
  await expect(page.getByTestId("item-returned")).toHaveText("—");
  await expect(page.getByTestId("sale-return")).toHaveCount(0);
  expect(await stockOf(page, "Shampoo")).toBe("8");
  expect(await stockOf(page, "Ração")).toBe("3");
});

test("devolução de um serviço avulso devolve o valor, sem mexer no estoque", async ({ page }) => {
  await shopWithProducts(page);
  await createServiceUi(page, "Banho", "60", "50,00");
  await page.goto("/pdv");
  await addServiceToCart(page, "Banho");
  await finalizeSale(page, "PIX");

  await openReturnForm(page);
  await fillReturn(page, { Banho: 1 }, "Serviço não realizado");
  await expect(page.getByLabel("Devolver os produtos ao estoque")).toHaveCount(0); // não há produtos na venda
  await submit(page);
  await expect(page.getByTestId("return-value")).toHaveText("R$ 50,00");
  expect(await stockOf(page, "Shampoo")).toBe("10");
});

test("o resumo do dia desconta o que foi devolvido, pela forma de pagamento escolhida", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2, "PIX"); // R$ 60,00
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await page.getByLabel("Forma de devolução do dinheiro").selectOption("CASH");
  await submit(page);

  await page.goto("/pdv/vendas");
  await expect(page.getByTestId("sales-total")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("refunded-total")).toHaveText("R$ 30,00");
  await expect(page.getByTestId("method-PIX")).toHaveText("Pix: R$ 60,00");
  await expect(page.getByTestId("method-CASH")).toHaveText("Dinheiro: -R$ 30,00");
  await expect(page.getByTestId("return-row")).toHaveCount(1);
});

test("venda com devolução não pode mais ser cancelada", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2);
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 1 });
  await submit(page);
  await page.getByRole("link", { name: /← Venda #1/ }).click();

  await expect(page.getByTestId("cancel-blocked")).toHaveText("Esta venda possui devoluções e não pode ser cancelada.");
  await expect(page.getByRole("button", { name: "Cancelar venda" })).toHaveCount(0);
});

test("o atendente registra devoluções e o nome dele fica no comprovante", async ({ page, browser }) => {
  await shopWithProducts(page);
  const att = await inviteAndAccept(browser, page, "Atendente Ana", `ana-${unique()}@mail.com`, "ATTENDANT");
  await quickSale(att.page, "Shampoo", 2);
  await openReturnForm(att.page);
  await fillReturn(att.page, { Shampoo: 1 });
  await submit(att.page);
  await expect(att.page.getByTestId("receipt")).toContainText("Atendente: Atendente Ana");
  await att.ctx.close();
});

test("rotas de devolução e comprovante exigem login", async ({ page }) => {
  for (const path of ["/pdv/vendas/x/devolucao", "/pdv/vendas/x/comprovante", "/pdv/devolucoes/x", "/configuracoes"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: devolução, comprovante e formulário de outro pet shop respondem 404", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await shopWithProducts(pageA, "Loja A");
  await quickSale(pageA, "Shampoo", 2);
  const saleId = saleIdFromUrl(pageA);
  await openReturnForm(pageA);
  await fillReturn(pageA, { Shampoo: 1 });
  await submit(pageA);
  const returnId = new URL(pageA.url()).pathname.split("/")[3];

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  for (const path of [`/pdv/devolucoes/${returnId}`, `/pdv/vendas/${saleId}/devolucao`, `/pdv/vendas/${saleId}/comprovante`]) {
    expect((await pageB.goto(path))?.status()).toBe(404);
  }
  await ctxA.close();
  await ctxB.close();
});

test("a lista de produtos do estoque reflete a devolução", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 3);
  await openReturnForm(page);
  await fillReturn(page, { Shampoo: 3 });
  await submit(page);
  await page.goto("/estoque");
  await expect(productRow(page, "Shampoo").getByTestId("product-stock")).toHaveText("10");
});
