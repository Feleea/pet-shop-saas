import { expect, test } from "@playwright/test";
import { addPetUi, createCustomerUi, newShop, unique } from "./helpers";

test("cadastra cliente, adiciona pet e vê o total na listagem", async ({ page }) => {
  await newShop(page);
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Novo cliente" }).click();
  await page.getByLabel("Nome do cliente").fill("Carlos Silva");
  await page.getByLabel("Telefone").fill("71991234567");
  await page.getByLabel("E-mail").fill("carlos@mail.com");
  await page.getByRole("button", { name: "Criar cliente" }).click();

  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carlos Silva");
  await expect(page.getByText("(71) 99123-4567")).toBeVisible();
  await expect(page.getByText("Nenhum pet cadastrado.")).toBeVisible();

  await page.getByLabel("Nome do pet").fill("Thor");
  await page.getByLabel("Espécie").selectOption("DOG");
  await page.getByLabel("Raça").fill("Labrador");
  await page.getByLabel("Porte").selectOption("LARGE");
  await page.getByRole("button", { name: "Adicionar pet" }).click();
  await expect(page.getByTestId("pet-list")).toContainText("Thor");
  await expect(page.getByTestId("pet-list")).toContainText("Cachorro · Labrador · Grande");

  await page.goto("/clientes");
  await expect(page.getByRole("link", { name: "Carlos Silva" })).toBeVisible();
  await expect(page.getByTestId("pet-count")).toHaveText("1");
});

test("a busca filtra os clientes pelo nome", async ({ page }) => {
  await newShop(page);
  await createCustomerUi(page, "Ana Souza");
  await createCustomerUi(page, "Bruno Lima");

  await page.goto("/clientes?q=ana");
  await expect(page.getByRole("link", { name: "Ana Souza" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bruno Lima" })).toHaveCount(0);

  await page.goto("/clientes?q=zzz");
  await expect(page.getByText("Nenhum cliente encontrado.")).toBeVisible();
});

test("validações: telefone inválido e data de nascimento no futuro", async ({ page }) => {
  await newShop(page);

  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do cliente").fill("Carlos Silva");
  await page.getByLabel("Telefone").fill("123");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page.getByRole("alert")).toHaveText("Telefone inválido");
  await expect(page).toHaveURL(/\/clientes\/novo$/);
  await expect(page.getByLabel("Nome do cliente")).toHaveValue("Carlos Silva"); // não perde o que foi digitado

  await page.getByLabel("Telefone").fill("");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);

  await page.getByLabel("Nome do pet").fill("Thor");
  await page.getByLabel("Espécie").selectOption("DOG");
  await page.getByLabel("Data de nascimento").fill("2999-01-01");
  await page.getByRole("button", { name: "Adicionar pet" }).click();
  await expect(page.getByRole("alert")).toHaveText("A data de nascimento não pode ser no futuro");
  await expect(page.getByText("Nenhum pet cadastrado.")).toBeVisible();
});

test("edita o cliente e limpa o telefone", async ({ page }) => {
  await newShop(page);
  await createCustomerUi(page, "Carlos Silva", "71991234567");

  await page.getByLabel("Nome do cliente").fill("Carlos Souza");
  await page.getByLabel("Telefone").fill("");
  await page.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page.getByRole("status")).toHaveText("Dados salvos.");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carlos Souza");
  await expect(page.getByText("Sem telefone")).toBeVisible();
});

test("edita e exclui um pet", async ({ page }) => {
  await newShop(page);
  await createCustomerUi(page, "Carlos Silva");
  await addPetUi(page, "Thor", "DOG");

  await page.getByRole("link", { name: "Editar pet" }).click();
  await page.getByLabel("Nome do pet").fill("Thor Jr");
  await page.getByLabel("Espécie").selectOption("CAT");
  await page.getByRole("button", { name: "Salvar pet" }).click();
  await expect(page.getByTestId("pet-list")).toContainText("Thor Jr");
  await expect(page.getByTestId("pet-list")).toContainText("Gato");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir pet" }).click();
  await expect(page.getByText("Nenhum pet cadastrado.")).toBeVisible();
});

test("excluir o cliente remove também os pets", async ({ page }) => {
  await newShop(page);
  await createCustomerUi(page, "Carlos Silva");
  await addPetUi(page, "Thor");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir cliente" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByText("Nenhum cliente encontrado.")).toBeVisible();
});

test("cancelar a confirmação não exclui o cliente", async ({ page }) => {
  await newShop(page);
  await createCustomerUi(page, "Carlos Silva");

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Excluir cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carlos Silva");
});

test("rotas de clientes exigem login", async ({ page }) => {
  for (const path of ["/clientes", "/clientes/novo", "/clientes/qualquer-id"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: um pet shop não vê nem acessa clientes de outro", async ({ browser }) => {
  const secretName = `Cliente Secreto ${unique()}`;

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShop(pageA, "Loja A");
  await createCustomerUi(pageA, secretName);
  await addPetUi(pageA, "Rex");
  const urlA = pageA.url();
  const petEditHref = await pageA.getByRole("link", { name: "Editar pet" }).getAttribute("href");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShop(pageB, "Loja B");

  // listagem e busca
  await pageB.goto("/clientes");
  await expect(pageB.getByText("Nenhum cliente encontrado.")).toBeVisible();
  await pageB.goto("/clientes?q=Secreto");
  await expect(pageB.getByText("Nenhum cliente encontrado.")).toBeVisible();

  // acesso direto por URL: 404, como se não existisse
  const detail = await pageB.goto(urlA);
  expect(detail?.status()).toBe(404);
  const petEdit = await pageB.goto(petEditHref!);
  expect(petEdit?.status()).toBe(404);

  // a loja A continua enxergando os próprios dados
  await pageA.reload();
  await expect(pageA.getByRole("heading", { level: 1 })).toHaveText(secretName);
  await expect(pageA.getByTestId("pet-list")).toContainText("Rex");

  await ctxA.close();
  await ctxB.close();
});
