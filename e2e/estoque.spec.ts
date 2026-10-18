import { expect, test, type Page } from "@playwright/test";
import { unique } from "./helpers";
import { createProductUi, productRow } from "./pdv-helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

const entryForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("button", { name: "Registrar entrada" }) });
const adjustForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("button", { name: "Registrar ajuste" }) });

test("cria um produto com estoque inicial e vê na lista e no histórico", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Shampoo Neutro", price: "30,00", min: "5", initial: "10" });

  await expect(page.getByTestId("product-stock")).toHaveText("10");
  await expect(page.getByTestId("stock-level")).toHaveText("Normal");
  await expect(page.getByTestId("movement-row")).toHaveCount(1);
  await expect(page.getByTestId("movement-row")).toContainText("Estoque inicial");
  await expect(page.getByTestId("movement-row")).toContainText("+10");

  await page.goto("/estoque");
  await expect(productRow(page, "Shampoo Neutro")).toContainText("R$ 30,00");
  await expect(productRow(page, "Shampoo Neutro").getByTestId("product-stock")).toHaveText("10");
  await expect(page.getByTestId("low-stock-alert")).toHaveCount(0);
});

test("validações do cadastro de produto e nome repetido", async ({ page }) => {
  await newShopWithAdmin(page);
  await page.goto("/estoque/novo");
  await page.getByLabel("Nome do produto").fill("Shampoo");
  await page.getByLabel("Preço (R$)").fill("abc");
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Preço inválido");
  await expect(page.getByLabel("Nome do produto")).toHaveValue("Shampoo"); // não perde o que foi digitado

  await page.getByLabel("Preço (R$)").fill("0");
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("O preço deve ser maior que zero");

  await page.getByLabel("Preço (R$)").fill("30");
  await page.getByLabel("Estoque inicial").fill("abc");
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Informe o estoque inicial (número inteiro, de 0 a 999999)");

  await page.getByLabel("Estoque inicial").fill("");
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page).toHaveURL(/\/estoque\/[^/]+$/);

  await page.goto("/estoque/novo");
  await page.getByLabel("Nome do produto").fill("shampoo");
  await page.getByLabel("Preço (R$)").fill("10");
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Já existe um produto com este nome");
});

test("entrada soma, ajuste corrige, e o estoque nunca fica negativo", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Ração", price: "120", initial: "5" });
  const stock = page.getByTestId("product-stock");

  await entryForm(page).getByLabel("Quantidade").fill("7");
  await entryForm(page).getByLabel("Observação da entrada").fill("Fornecedor X");
  await entryForm(page).getByRole("button", { name: "Registrar entrada" }).click();
  await expect(entryForm(page).getByRole("status")).toHaveText("Entrada registrada.");
  await expect(stock).toHaveText("12");
  await expect(page.getByTestId("movement-row").first()).toContainText("Entrada");
  await expect(page.getByTestId("movement-row").first()).toContainText("+7");
  await expect(page.getByTestId("movement-row").first()).toContainText("Fornecedor X");

  await adjustForm(page).getByLabel("Ajuste (use negativo para baixa)").fill("-3");
  await adjustForm(page).getByLabel("Motivo do ajuste").fill("Embalagem rasgada");
  await adjustForm(page).getByRole("button", { name: "Registrar ajuste" }).click();
  await expect(adjustForm(page).getByRole("status")).toHaveText("Ajuste registrado.");
  await expect(stock).toHaveText("9");
  await expect(page.getByTestId("movement-row").first()).toContainText("-3");

  // baixa maior que o saldo: recusada, nada muda
  await adjustForm(page).getByLabel("Ajuste (use negativo para baixa)").fill("-50");
  await adjustForm(page).getByLabel("Motivo do ajuste").fill("Contagem");
  await adjustForm(page).getByRole("button", { name: "Registrar ajuste" }).click();
  await expect(adjustForm(page).getByRole("alert")).toHaveText("O ajuste deixaria o estoque negativo");
  await expect(stock).toHaveText("9");

  await adjustForm(page).getByLabel("Motivo do ajuste").fill("");
  await adjustForm(page).getByLabel("Ajuste (use negativo para baixa)").fill("-1");
  await adjustForm(page).getByRole("button", { name: "Registrar ajuste" }).click();
  await expect(adjustForm(page).getByRole("alert")).toHaveText("Informe o motivo do ajuste");

  await entryForm(page).getByLabel("Quantidade").fill("0");
  await entryForm(page).getByRole("button", { name: "Registrar entrada" }).click();
  await expect(entryForm(page).getByRole("alert")).toHaveText("Informe a quantidade (número inteiro, de 1 a 999999)");
  await expect(stock).toHaveText("9");
});

test("alerta de estoque baixo, filtro e busca", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Brinquedo", price: "15", min: "5", initial: "3" });
  await createProductUi(page, { name: "Osso", price: "8", min: "2", initial: "0" });
  await createProductUi(page, { name: "Shampoo", price: "30", min: "5", initial: "20" });

  await page.goto("/estoque");
  await expect(productRow(page, "Brinquedo").getByTestId("stock-level")).toHaveText("Estoque baixo");
  await expect(productRow(page, "Osso").getByTestId("stock-level")).toHaveText("Sem estoque");
  await expect(productRow(page, "Shampoo").getByTestId("stock-level")).toHaveText("Normal");
  await expect(page.getByTestId("low-stock-alert")).toContainText("2 produtos com estoque baixo ou zerado");

  await page.getByLabel("Somente estoque baixo").check();
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByTestId("product-row")).toHaveCount(2);
  await expect(productRow(page, "Shampoo")).toHaveCount(0);

  await page.getByLabel("Somente estoque baixo").uncheck();
  await page.getByLabel("Buscar produto").fill("OSS");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  await expect(productRow(page, "Osso")).toBeVisible();
});

test("editar o produto e desativar/reativar", async ({ page }) => {
  await newShopWithAdmin(page);
  await createProductUi(page, { name: "Shampoo", price: "30", min: "2", initial: "10" });

  await page.getByLabel("Preço (R$)").fill("35,50");
  await page.getByLabel("Estoque mínimo").fill("4");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dados salvos." })).toBeVisible();
  await page.goto("/estoque");
  await expect(productRow(page, "Shampoo")).toContainText("R$ 35,50");

  await productRow(page, "Shampoo").getByRole("link", { name: "Detalhes" }).click();
  await page.getByRole("button", { name: "Desativar produto" }).click();
  await expect(page.getByTestId("stock-level")).toHaveText("Inativo");
  await page.getByRole("button", { name: "Reativar produto" }).click();
  await expect(page.getByTestId("stock-level")).toHaveText("Normal");
});

test("permissões: atendente só dá entrada; tosador só consulta", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const id = await createProductUi(page, { name: "Shampoo", price: "30", initial: "10" });
  const att = await inviteAndAccept(browser, page, "Atendente Ana", `ana-${unique()}@mail.com`, "ATTENDANT");
  const groomer = await inviteAndAccept(browser, page, "Tosador Beto", `beto-${unique()}@mail.com`, "GROOMER");

  await att.page.goto(`/estoque/${id}`);
  await expect(att.page.getByRole("button", { name: "Registrar ajuste" })).toHaveCount(0);
  await expect(att.page.getByRole("button", { name: "Salvar produto" })).toHaveCount(0);
  await expect(att.page.getByRole("button", { name: "Desativar produto" })).toHaveCount(0);
  await entryForm(att.page).getByLabel("Quantidade").fill("5");
  await entryForm(att.page).getByRole("button", { name: "Registrar entrada" }).click();
  await expect(entryForm(att.page).getByRole("status")).toHaveText("Entrada registrada.");
  await expect(att.page.getByTestId("product-stock")).toHaveText("15");
  await expect(att.page.getByTestId("movement-row").first()).toContainText("Atendente Ana");
  await att.page.goto("/estoque");
  await expect(att.page.getByRole("link", { name: "Novo produto" })).toHaveCount(0);
  await att.page.goto("/estoque/novo");
  await expect(att.page).toHaveURL(/\/estoque$/);

  await groomer.page.goto(`/estoque/${id}`);
  await expect(groomer.page.getByTestId("product-stock")).toHaveText("15"); // pode consultar
  await expect(groomer.page.getByRole("button", { name: "Registrar entrada" })).toHaveCount(0);
  await expect(groomer.page.getByRole("button", { name: "Registrar ajuste" })).toHaveCount(0);

  await att.ctx.close();
  await groomer.ctx.close();
});

test("rotas de estoque exigem login", async ({ page }) => {
  for (const path of ["/estoque", "/estoque/novo", "/estoque/qualquer-id"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: cada pet shop tem o seu estoque, e nomes iguais não conflitam", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShopWithAdmin(pageA, "Loja A");
  const idA = await createProductUi(pageA, { name: "Shampoo", price: "30", initial: "10" });

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  await pageB.goto("/estoque");
  await expect(pageB.getByText("Nenhum produto encontrado.")).toBeVisible();
  expect((await pageB.goto(`/estoque/${idA}`))?.status()).toBe(404);

  await createProductUi(pageB, { name: "Shampoo", price: "99", initial: "1" }); // mesmo nome, sem conflito
  await pageB.goto("/estoque");
  await expect(pageB.getByTestId("product-row")).toHaveCount(1);
  await expect(productRow(pageB, "Shampoo")).toContainText("R$ 99,00");

  await pageA.goto("/estoque");
  await expect(productRow(pageA, "Shampoo")).toContainText("R$ 30,00");
  await expect(productRow(pageA, "Shampoo").getByTestId("product-stock")).toHaveText("10");
  await ctxA.close();
  await ctxB.close();
});
