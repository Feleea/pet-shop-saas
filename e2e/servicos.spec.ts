import { expect, test, type Page } from "@playwright/test";
import { newShop } from "./helpers";

async function fillService(page: Page, name: string, duration: string, price: string, description = "") {
  await page.getByLabel("Nome do serviço").fill(name);
  if (description) await page.getByLabel("Descrição").fill(description);
  await page.getByLabel("Duração (minutos)").fill(duration);
  await page.getByLabel("Preço (R$)").fill(price);
}

async function createServiceUi(page: Page, name: string, duration: string, price: string, description = "") {
  await page.goto("/servicos/novo");
  await fillService(page, name, duration, price, description);
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page).toHaveURL(/\/servicos$/);
}

const row = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });

test("cria serviços e vê duração e preço formatados na lista", async ({ page }) => {
  await newShop(page);
  await page.goto("/servicos");
  await expect(page.getByText("Nenhum serviço cadastrado.")).toBeVisible();

  await page.getByRole("link", { name: "Novo serviço" }).click();
  await fillService(page, "Banho", "60", "50,00", "Banho completo");
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page).toHaveURL(/\/servicos$/);
  await expect(row(page, "Banho")).toContainText("1h");
  await expect(row(page, "Banho")).toContainText("R$ 50,00");
  await expect(row(page, "Banho")).toContainText("Banho completo");

  await createServiceUi(page, "Tosa higiênica", "90", "1.250,5");
  await expect(row(page, "Tosa higiênica")).toContainText("1h30");
  await expect(row(page, "Tosa higiênica")).toContainText("R$ 1.250,50");
});

test("validações: preço, duração e nome repetido", async ({ page }) => {
  await newShop(page);
  await createServiceUi(page, "Banho", "60", "50");

  await page.goto("/servicos/novo");
  await fillService(page, "Tosa", "60", "abc");
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page.getByRole("alert")).toHaveText("Preço inválido");
  await expect(page.getByLabel("Nome do serviço")).toHaveValue("Tosa"); // não perde o que foi digitado

  await page.getByLabel("Preço (R$)").fill("30");
  await page.getByLabel("Duração (minutos)").fill("7");
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page.getByRole("alert")).toHaveText("A duração deve ser múltipla de 5 minutos");

  await page.getByLabel("Nome do serviço").fill("banho");
  await page.getByLabel("Duração (minutos)").fill("60");
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page.getByRole("alert")).toHaveText("Já existe um serviço com este nome");
  await expect(page).toHaveURL(/\/servicos\/novo$/);
});

test("edita preço e duração de um serviço", async ({ page }) => {
  await newShop(page);
  await createServiceUi(page, "Banho", "60", "50,00");

  await row(page, "Banho").getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Preço (R$)")).toHaveValue("50,00");
  await expect(page.getByLabel("Duração (minutos)")).toHaveValue("60");
  await page.getByLabel("Duração (minutos)").fill("75");
  await page.getByLabel("Preço (R$)").fill("65,00");
  await page.getByRole("button", { name: "Salvar serviço" }).click();

  await expect(page).toHaveURL(/\/servicos$/);
  await expect(row(page, "Banho")).toContainText("1h15");
  await expect(row(page, "Banho")).toContainText("R$ 65,00");
});

test("salvar sem mudar o nome não acusa nome repetido", async ({ page }) => {
  await newShop(page);
  await createServiceUi(page, "Banho", "60", "50");
  await row(page, "Banho").getByRole("link", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(page).toHaveURL(/\/servicos$/);
});

test("desativa e reativa um serviço", async ({ page }) => {
  await newShop(page);
  await createServiceUi(page, "Banho", "60", "50");
  await expect(row(page, "Banho")).toContainText("Ativo");

  await row(page, "Banho").getByRole("button", { name: "Desativar" }).click();
  await expect(row(page, "Banho")).toContainText("Inativo");
  await expect(row(page, "Banho").getByRole("button", { name: "Reativar" })).toBeVisible();

  await row(page, "Banho").getByRole("button", { name: "Reativar" }).click();
  await expect(row(page, "Banho")).toContainText("Ativo");
});

test("rotas de serviços exigem login", async ({ page }) => {
  for (const path of ["/servicos", "/servicos/novo", "/servicos/qualquer-id/editar"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: cada pet shop tem o seu catálogo, e nomes iguais não conflitam", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShop(pageA, "Loja A");
  await createServiceUi(pageA, "Banho", "60", "50,00");
  const editHref = await pageA.getByRole("link", { name: "Editar" }).getAttribute("href");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShop(pageB, "Loja B");

  await pageB.goto("/servicos");
  await expect(pageB.getByText("Nenhum serviço cadastrado.")).toBeVisible();

  // mesmo nome na outra loja é permitido
  await createServiceUi(pageB, "Banho", "45", "99,00");
  await expect(pageB.getByRole("row", { name: /Banho/ })).toHaveCount(1);
  await expect(row(pageB, "Banho")).toContainText("R$ 99,00");

  // a loja B não alcança o serviço da loja A por URL direta
  const res = await pageB.goto(editHref!);
  expect(res?.status()).toBe(404);

  // a loja A segue com o preço dela
  await pageA.goto("/servicos");
  await expect(row(pageA, "Banho")).toContainText("R$ 50,00");
  await expect(row(pageA, "Banho")).not.toContainText("R$ 99,00");

  await ctxA.close();
  await ctxB.close();
});
