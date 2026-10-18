import { expect, test } from "@playwright/test";
import { configureCompanyUi } from "./fase5-helpers";
import { unique } from "./helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

test("salva os dados da empresa e mostra com máscara depois de recarregar", async ({ page }) => {
  await newShopWithAdmin(page);
  await configureCompanyUi(page);
  await page.reload();
  await expect(page.getByLabel("Razão social")).toHaveValue("Pet Shop Teste Comércio LTDA");
  await expect(page.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-81");
  await expect(page.getByLabel("CEP")).toHaveValue("40010-000");
  await expect(page.getByLabel("Telefone")).toHaveValue("(71) 3222-1234");
  await expect(page.getByLabel("UF")).toHaveValue("BA");
  await expect(page.getByLabel("Regime tributário")).toHaveValue("SIMPLES_NACIONAL");
});

test("validações: CNPJ, CEP, telefone e inscrição, sem perder o que foi digitado", async ({ page }) => {
  await newShopWithAdmin(page);
  await page.goto("/configuracoes");
  const save = () => page.getByRole("button", { name: "Salvar dados da empresa" }).click();

  await page.getByLabel("CNPJ").fill("11.222.333/0001-82");
  await save();
  await expect(page.getByRole("alert")).toHaveText("CNPJ inválido");
  await expect(page.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-82");

  await page.getByLabel("CNPJ").fill("11.222.333/0001-81");
  await page.getByLabel("CEP").fill("123");
  await save();
  await expect(page.getByRole("alert")).toHaveText("CEP inválido");

  await page.getByLabel("CEP").fill("");
  await page.getByLabel("Telefone").fill("123");
  await save();
  await expect(page.getByRole("alert")).toHaveText("Telefone inválido");

  await page.getByLabel("Telefone").fill("");
  await page.getByLabel("Inscrição estadual").fill("12 34!");
  await save();
  await expect(page.getByRole("alert")).toHaveText("Inscrição estadual inválida");
});

test("limpar um campo apaga o valor", async ({ page }) => {
  await newShopWithAdmin(page);
  await configureCompanyUi(page);
  await page.getByLabel("Telefone").fill("");
  await page.getByLabel("CNPJ").fill("");
  await page.getByRole("button", { name: "Salvar dados da empresa" }).click();
  await expect(page.getByRole("status")).toHaveText("Dados salvos.");
  await page.reload();
  await expect(page.getByLabel("Telefone")).toHaveValue("");
  await expect(page.getByLabel("CNPJ")).toHaveValue("");
});

test("mudar o nome do pet shop aparece no painel", async ({ page }) => {
  await newShopWithAdmin(page);
  await page.goto("/configuracoes");
  const name = `Au Au Pet ${unique()}`;
  await page.getByLabel("Nome do pet shop").fill(name);
  await page.getByRole("button", { name: "Salvar dados da empresa" }).click();
  await expect(page.getByRole("status")).toHaveText("Dados salvos.");
  await page.goto("/painel");
  await expect(page.getByTestId("tenant-name")).toHaveText(name);
});

test("a tela deixa claro que o provedor de notas é o SIMULADO", async ({ page }) => {
  await newShopWithAdmin(page);
  await page.goto("/configuracoes");
  await expect(page.getByTestId("fiscal-provider")).toContainText("Simulado (sem validade fiscal)");
  await expect(page.getByTestId("fiscal-provider")).toContainText("SIMULADO — sem validade fiscal");
});

test("só o administrador acessa as configurações", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  await page.goto("/painel");
  await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();

  const att = await inviteAndAccept(browser, page, "Atendente Ana", `ana-${unique()}@mail.com`, "ATTENDANT");
  await expect(att.page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
  await att.page.goto("/configuracoes");
  await expect(att.page).toHaveURL(/\/painel$/);
  await att.ctx.close();
});

test("ISOLAMENTO: cada pet shop tem os seus próprios dados de empresa", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShopWithAdmin(pageA, "Loja A");
  await configureCompanyUi(pageA);

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  await pageB.goto("/configuracoes");
  await expect(pageB.getByLabel("CNPJ")).toHaveValue("");
  await expect(pageB.getByLabel("Razão social")).toHaveValue("");
  await ctxA.close();
  await ctxB.close();
});
