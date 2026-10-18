import { expect, test, type Page } from "@playwright/test";
import { bookUi, futureDate, selectByText, setupBasics } from "./agenda-helpers";
import { createCustomerUi, unique } from "./helpers";
import { addProductToCart, createProductUi, finalizeSale, productRow, quickSale, stockOf } from "./pdv-helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

/** Pet shop novo com dois produtos: Shampoo (R$ 30, 10 un.) e Ração (R$ 120, 3 un.). */
async function shopWithProducts(page: Page, label = "Loja") {
  await newShopWithAdmin(page, label);
  const shampoo = await createProductUi(page, { name: "Shampoo", price: "30,00", min: "2", initial: "10" });
  const racao = await createProductUi(page, { name: "Ração", price: "120,00", min: "1", initial: "3" });
  return { shampoo, racao };
}

test("venda simples: baixa o estoque e mostra o comprovante", async ({ page }) => {
  const { shampoo } = await shopWithProducts(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 2);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 60,00");
  await expect(page.getByTestId("cart-total")).toHaveText("R$ 60,00");
  await finalizeSale(page, "PIX");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Venda #1");
  await expect(page.getByRole("status").filter({ hasText: "Venda registrada com sucesso." })).toBeVisible();
  await expect(page.getByTestId("sale-status")).toHaveText("Concluída");
  await expect(page.getByTestId("sale-payment")).toHaveText("Pix");
  await expect(page.getByTestId("sale-item")).toHaveCount(1);
  await expect(page.getByTestId("sale-item")).toContainText("Shampoo");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 60,00");

  expect(await stockOf(page, "Shampoo")).toBe("8");
  await page.goto(`/estoque/${shampoo}`);
  await expect(page.getByTestId("movement-row").first()).toContainText("Venda");
  await expect(page.getByTestId("movement-row").first()).toContainText("-2");
  await expect(page.getByTestId("movement-row").first()).toContainText("Venda #1");
});

test("carrinho: soma ao vivo, edita quantidade, remove itens e aplica desconto", async ({ page }) => {
  await shopWithProducts(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 1);
  await addProductToCart(page, "Ração", 1);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 150,00");

  await page.getByLabel("Quantidade de Shampoo").fill("3");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 210,00");

  // adicionar o mesmo produto de novo soma na mesma linha
  await page.getByLabel("Produto").selectOption({ label: "Shampoo — R$ 30,00 — estoque 10" });
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByLabel("Quantidade de Shampoo")).toHaveValue("4");

  await page.getByRole("button", { name: "Remover Ração" }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 120,00");

  await page.getByLabel("Desconto (R$)").fill("10,50");
  await expect(page.getByTestId("cart-discount")).toHaveText("R$ 10,50");
  await expect(page.getByTestId("cart-total")).toHaveText("R$ 109,50");

  await finalizeSale(page, "CASH");
  await expect(page.getByTestId("sale-subtotal")).toHaveText("R$ 120,00");
  await expect(page.getByTestId("sale-discount")).toHaveText("R$ 10,50");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 109,50");
  await expect(page.getByTestId("sale-payment")).toHaveText("Dinheiro");
});

test("validações do PDV", async ({ page }) => {
  await shopWithProducts(page);
  await page.goto("/pdv");

  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page.getByRole("alert")).toHaveText("Adicione ao menos um item");

  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escolha um produto");

  await selectByText(page.getByLabel("Produto"), "Shampoo");
  await page.getByLabel("Quantidade", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Quantidade inválida (de 1 a 9999)");

  await page.getByLabel("Quantidade", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escolha a forma de pagamento");

  await page.getByLabel("Forma de pagamento").selectOption("PIX");
  await page.getByLabel("Desconto (R$)").fill("abc");
  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page.getByRole("alert")).toHaveText("Desconto inválido");

  await page.getByLabel("Desconto (R$)").fill("999");
  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page.getByRole("alert")).toHaveText("O desconto não pode ser maior que o total da venda");

  expect(await stockOf(page, "Shampoo")).toBe("10"); // nada foi vendido
});

test("estoque insuficiente: recusa, mantém o carrinho e aceita depois de corrigir", async ({ page }) => {
  await shopWithProducts(page);
  await page.goto("/pdv");
  await addProductToCart(page, "Ração", 5); // só há 3
  await finalizeSaleExpectingError(page);
  await expect(page.getByRole("alert")).toHaveText("Estoque insuficiente para Ração (disponível: 3)");
  await expect(page.getByTestId("cart-line")).toHaveCount(1); // o carrinho continua

  await page.getByLabel("Quantidade de Ração").fill("3");
  await finalizeSale(page, "PIX");
  await expect(page.getByTestId("sale-status")).toHaveText("Concluída");

  await page.goto("/estoque");
  await expect(productRow(page, "Ração").getByTestId("product-stock")).toHaveText("0");
  await expect(productRow(page, "Ração").getByTestId("stock-level")).toHaveText("Sem estoque");
});

async function finalizeSaleExpectingError(page: Page) {
  await page.getByLabel("Forma de pagamento").selectOption("PIX");
  await page.getByRole("button", { name: "Finalizar venda" }).click();
}

test("produto desativado não aparece no PDV", async ({ page }) => {
  const { shampoo } = await shopWithProducts(page);
  await page.goto(`/estoque/${shampoo}`);
  await page.getByRole("button", { name: "Desativar produto" }).click();
  await expect(page.getByTestId("stock-level")).toHaveText("Inativo");

  await page.goto("/pdv");
  const options = await page.getByLabel("Produto").locator("option").allTextContents();
  expect(options.join("|")).not.toContain("Shampoo");
  expect(options.join("|")).toContain("Ração");
});

test("cobrar um atendimento concluído (com produto junto) e não cobrar duas vezes", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await setupBasics(page);
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });

  // só depois de concluído aparece o atalho "Cobrar"
  await expect(page.getByRole("link", { name: "Cobrar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByTestId("appointment-status")).toHaveText("Concluído");
  await page.getByRole("link", { name: "Cobrar" }).click();

  await expect(page).toHaveURL(/\/pdv\?atendimento=/);
  await expect(page.getByTestId("cart-line")).toContainText("Banho");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 50,00");
  await expect(page.getByLabel("Cliente (opcional)")).toBeDisabled(); // o cliente vem do atendimento

  await addProductToCart(page, "Shampoo", 1);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 80,00");
  await finalizeSale(page, "PIX");

  await expect(page.getByTestId("sale-item")).toHaveCount(2);
  await expect(page.getByTestId("sale-item").first()).toContainText("Shampoo");
  await expect(page.locator("main")).toContainText("Banho — Thor");
  await expect(page.locator("main")).toContainText("cliente: Carlos Silva");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 80,00");

  // já cobrado: some das opções e o atalho avisa
  await page.goto("/pdv");
  const options = await page.getByLabel("Atendimento concluído").locator("option").allTextContents();
  expect(options.join("|")).not.toContain("Thor");
  await page.goto(`/pdv?atendimento=${await atendimentoIdFromAgenda(page, date)}`);
  await expect(page.getByRole("alert")).toHaveText("Este atendimento já foi cobrado ou não está concluído");
});

async function atendimentoIdFromAgenda(page: Page, date: string): Promise<string> {
  await page.goto(`/agenda?data=${date}`);
  const href = await page.getByRole("link", { name: "Cobrar" }).getAttribute("href");
  return new URL(href!, "http://x").searchParams.get("atendimento")!;
}

test("cancelar a venda devolve o estoque e exige motivo", async ({ page }) => {
  const { shampoo } = await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2);
  expect(await stockOf(page, "Shampoo")).toBe("8");

  await page.goto("/pdv/vendas");
  await page.getByRole("link", { name: "Ver" }).click();

  // sem motivo: recusado, mesmo depois de confirmar
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByRole("alert")).toHaveText("Informe o motivo do cancelamento");
  await expect(page.getByTestId("sale-status")).toHaveText("Concluída");

  // desistir na confirmação não cancela
  await page.getByLabel("Motivo do cancelamento").fill("Cliente desistiu");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByTestId("sale-status")).toHaveText("Concluída");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByTestId("sale-status")).toHaveText("Cancelada");
  await expect(page.getByTestId("sale-cancel-info")).toContainText("Cliente desistiu");
  await expect(page.getByRole("button", { name: "Cancelar venda" })).toHaveCount(0);

  expect(await stockOf(page, "Shampoo")).toBe("10");
  await page.goto(`/estoque/${shampoo}`);
  await expect(page.getByTestId("movement-row").first()).toContainText("Devolução");
  await expect(page.getByTestId("movement-row").first()).toContainText("+2");
});

test("resumo do dia por forma de pagamento (cancelada não entra no total)", async ({ page }) => {
  await shopWithProducts(page);
  await quickSale(page, "Shampoo", 2, "PIX"); // R$ 60,00
  await quickSale(page, "Shampoo", 1, "CASH"); // R$ 30,00
  await quickSale(page, "Shampoo", 1, "CREDIT"); // R$ 30,00

  await page.goto("/pdv/vendas");
  await expect(page.getByTestId("sales-total")).toHaveText("R$ 120,00");
  await expect(page.getByTestId("method-PIX")).toHaveText("Pix: R$ 60,00");
  await expect(page.getByTestId("method-CASH")).toHaveText("Dinheiro: R$ 30,00");
  await expect(page.getByTestId("method-CREDIT")).toHaveText("Cartão de crédito: R$ 30,00");
  await expect(page.getByTestId("method-DEBIT")).toHaveText("Cartão de débito: R$ 0,00");
  await expect(page.getByTestId("sale-row")).toHaveCount(3);
  await expect(page.getByTestId("sale-row").first()).toContainText("#3"); // mais recente primeiro

  await page.getByTestId("sale-row").filter({ hasText: "#1" }).getByRole("link", { name: "Ver" }).click();
  await page.getByLabel("Motivo do cancelamento").fill("Erro de digitação");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByTestId("sale-status")).toHaveText("Cancelada");

  await page.goto("/pdv/vendas");
  await expect(page.getByTestId("sales-total")).toHaveText("R$ 60,00");
  await expect(page.getByTestId("method-PIX")).toHaveText("Pix: R$ 0,00");
  await expect(page.getByTestId("sale-row")).toHaveCount(3); // continua na lista, como cancelada

  await page.getByRole("link", { name: "← Dia anterior" }).click();
  await expect(page.getByText("Nenhuma venda neste dia.")).toBeVisible();
  await expect(page.getByTestId("sales-total")).toHaveText("R$ 0,00");
});

test("permissões: atendente vende mas não cancela; tosador não vê o PDV, só o estoque", async ({ page, browser }) => {
  await shopWithProducts(page);
  await page.goto("/painel");
  await expect(page.getByRole("link", { name: "PDV" })).toBeVisible(); // o ADMIN vê o atalho
  const att = await inviteAndAccept(browser, page, "Atendente Ana", `ana-${unique()}@mail.com`, "ATTENDANT");
  const groomer = await inviteAndAccept(browser, page, "Tosador Beto", `beto-${unique()}@mail.com`, "GROOMER");

  await quickSale(att.page, "Shampoo", 1, "DEBIT");
  await expect(att.page.locator("main")).toContainText("vendedor: Atendente Ana");
  await expect(att.page.getByLabel("Motivo do cancelamento")).toHaveCount(0);
  await expect(att.page.getByRole("button", { name: "Cancelar venda" })).toHaveCount(0);

  await expect(groomer.page.getByRole("link", { name: "PDV" })).toHaveCount(0);
  for (const path of ["/pdv", "/pdv/vendas"]) {
    await groomer.page.goto(path);
    await expect(groomer.page).toHaveURL(/\/painel$/);
  }
  await groomer.page.goto("/estoque");
  await expect(groomer.page.getByTestId("product-row")).toHaveCount(2); // consulta permitida

  await att.ctx.close();
  await groomer.ctx.close();
});

test("cliente com vendas não pode ser excluído", async ({ page }) => {
  await shopWithProducts(page);
  await createCustomerUi(page, "Carlos Silva");
  const customerId = new URL(page.url()).pathname.split("/").pop()!;

  await page.goto("/pdv");
  await addProductToCart(page, "Shampoo", 1);
  await page.getByLabel("Cliente (opcional)").selectOption({ label: "Carlos Silva" });
  await finalizeSale(page, "PIX");
  await expect(page.locator("main")).toContainText("cliente: Carlos Silva");

  await page.goto(`/clientes/${customerId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir cliente" }).click();
  await expect(page.getByRole("alert")).toContainText("Não é possível excluir");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carlos Silva");
});

test("rotas do PDV exigem login", async ({ page }) => {
  for (const path of ["/pdv", "/pdv/vendas", "/pdv/vendas/qualquer-id"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: cada pet shop tem as suas vendas, com numeração própria", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await shopWithProducts(pageA, "Loja A");
  await quickSale(pageA, "Shampoo", 1, "PIX");
  const urlA = pageA.url();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  await createProductUi(pageB, { name: "Shampoo", price: "35,00", initial: "5" });

  expect((await pageB.goto(urlA))?.status()).toBe(404);
  await pageB.goto("/pdv/vendas");
  await expect(pageB.getByText("Nenhuma venda neste dia.")).toBeVisible();

  await quickSale(pageB, "Shampoo", 1, "CASH");
  await expect(pageB.getByRole("heading", { level: 1 })).toHaveText("Venda #1"); // numeração própria
  await expect(pageB.getByTestId("sale-total")).toHaveText("R$ 35,00");

  await pageA.goto(urlA);
  await expect(pageA.getByRole("heading", { level: 1 })).toHaveText("Venda #1");
  await expect(pageA.getByTestId("sale-total")).toHaveText("R$ 30,00");
  await ctxA.close();
  await ctxB.close();
});
