import { expect, test, type Browser, type Page } from "@playwright/test";
import { registerShop, unique } from "./helpers";

type Role = "ATTENDANT" | "GROOMER" | "VET";

/** Cria um pet shop e devolve o e-mail do admin (para testes que precisam dele). */
async function newShopWithAdmin(page: Page, label = "Loja") {
  const email = `admin-${unique()}@mail.com`;
  await registerShop(page, `${label} ${unique()}`, "Admin", email, "senha-forte-1");
  return email;
}

/** Gera o convite pela tela de equipe e devolve o link completo. */
async function inviteUi(page: Page, name: string, email: string, role: Role = "ATTENDANT"): Promise<string> {
  await page.goto("/equipe");
  await page.getByLabel("Nome do convidado").fill(name);
  await page.getByLabel("E-mail do convidado").fill(email);
  await page.getByLabel("Papel").selectOption(role);
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = page.getByTestId("invite-link");
  await expect(link).toBeVisible();
  return (await link.textContent())!;
}

async function acceptUi(page: Page, link: string, password = "senha-forte-1", confirm = password) {
  await page.goto(link);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(confirm);
  await page.getByRole("button", { name: "Aceitar convite" }).click();
}

/** Abre um contexto limpo (sem login), como a pessoa convidada faria. */
async function guestPage(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test("admin convida um atendente, que aceita o convite e entra no pet shop", async ({ page, browser }) => {
  await newShopWithAdmin(page, "Loja Convites");
  const shopName = (await page.getByTestId("tenant-name").textContent())!;
  const email = `carla-${unique()}@mail.com`;
  const link = await inviteUi(page, "Carla Atendente", email, "ATTENDANT");

  await expect(page.getByTestId("pending-invites")).toContainText("Carla Atendente");
  await expect(page.getByTestId("pending-invites")).toContainText("Atendente");

  const guest = await guestPage(browser);
  await guest.page.goto(link);
  await expect(guest.page.getByRole("heading", { name: "Você foi convidado" })).toBeVisible();
  await expect(guest.page.getByText(shopName)).toBeVisible();
  await acceptUi(guest.page, link);

  await expect(guest.page).toHaveURL(/\/painel$/);
  await expect(guest.page.getByTestId("tenant-name")).toHaveText(shopName);
  await expect(guest.page.getByTestId("user-name")).toHaveText("Carla Atendente");
  await expect(guest.page.getByText("(ATTENDANT)")).toBeVisible();

  // depois de aceito: usuário na lista e convite fora dos pendentes
  await page.goto("/equipe");
  await expect(page.getByTestId("team-users")).toContainText(email);
  await expect(page.getByTestId("pending-invites")).not.toContainText(email);
  await guest.ctx.close();
});

test("o convidado entra depois pelo login normal, com o código do pet shop", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const slug = (await page.getByTestId("tenant-slug").textContent())!;
  const email = `vet-${unique()}@mail.com`;
  const link = await inviteUi(page, "Dr. Vet", email, "VET");

  const guest = await guestPage(browser);
  await acceptUi(guest.page, link, "senha-do-vet-1");
  await expect(guest.page).toHaveURL(/\/painel$/);
  await guest.page.getByRole("button", { name: "Sair" }).click();

  await guest.page.getByLabel("Código do pet shop").fill(slug);
  await guest.page.getByLabel("E-mail").fill(email);
  await guest.page.getByLabel("Senha").fill("senha-do-vet-1");
  await guest.page.getByRole("button", { name: "Entrar" }).click();
  await expect(guest.page).toHaveURL(/\/painel$/);
  await expect(guest.page.getByText("(VET)")).toBeVisible();
  await guest.ctx.close();
});

test("atendente aceito tem acesso limitado: sem equipe e sem gerenciar serviços", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  await expect(page.getByRole("link", { name: "Equipe" })).toBeVisible(); // admin vê o atalho

  const link = await inviteUi(page, "Carla", `c-${unique()}@mail.com`, "ATTENDANT");
  const guest = await guestPage(browser);
  await acceptUi(guest.page, link);
  await expect(guest.page).toHaveURL(/\/painel$/);

  await expect(guest.page.getByRole("link", { name: "Equipe" })).toHaveCount(0);
  await guest.page.goto("/equipe");
  await expect(guest.page).toHaveURL(/\/painel$/);

  await guest.page.goto("/servicos");
  await expect(guest.page.getByRole("link", { name: "Novo serviço" })).toHaveCount(0);
  await guest.page.goto("/clientes");
  await expect(guest.page.getByRole("link", { name: "Novo cliente" })).toBeVisible();
  await guest.ctx.close();
});

test("validações ao convidar: e-mail já é usuário e convite pendente repetido", async ({ page }) => {
  const adminEmail = await newShopWithAdmin(page);

  await page.goto("/equipe");
  await page.getByLabel("Nome do convidado").fill("Fulano");
  await page.getByLabel("E-mail do convidado").fill(adminEmail.toUpperCase());
  await page.getByRole("button", { name: "Gerar convite" }).click();
  await expect(page.getByRole("alert")).toHaveText("Já existe um usuário com este e-mail");
  await expect(page.getByLabel("Nome do convidado")).toHaveValue("Fulano"); // não perde o que foi digitado

  const email = `dup-${unique()}@mail.com`;
  await inviteUi(page, "Beltrano", email);
  await page.getByLabel("Nome do convidado").fill("Beltrano");
  await page.getByLabel("E-mail do convidado").fill(email);
  await page.getByRole("button", { name: "Gerar convite" }).click();
  await expect(page.getByRole("alert")).toHaveText("Já existe um convite pendente para este e-mail");

  await page.getByLabel("E-mail do convidado").fill("sem-arroba");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  await expect(page.getByRole("alert")).toHaveText("E-mail inválido");
});

test("ao aceitar: senha curta e senhas diferentes são recusadas, e o convite continua válido", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const link = await inviteUi(page, "Carla", `c-${unique()}@mail.com`);

  const guest = await guestPage(browser);
  await acceptUi(guest.page, link, "123");
  await expect(guest.page.getByRole("alert")).toHaveText("A senha deve ter ao menos 8 caracteres");

  await guest.page.getByLabel("Senha", { exact: true }).fill("senha-forte-1");
  await guest.page.getByLabel("Confirmar senha").fill("outra-senha-1");
  await guest.page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(guest.page.getByRole("alert")).toHaveText("As senhas não conferem");

  await guest.page.getByLabel("Confirmar senha").fill("senha-forte-1");
  await guest.page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(guest.page).toHaveURL(/\/painel$/);
  await guest.ctx.close();
});

test("revogar o convite invalida o link", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const link = await inviteUi(page, "Carla", `c-${unique()}@mail.com`);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revogar convite" }).click();
  await expect(page.getByText("Nenhum convite pendente.")).toBeVisible();

  const guest = await guestPage(browser);
  await guest.page.goto(link);
  await expect(guest.page.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
  await expect(guest.page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  await guest.ctx.close();
});

test("o link só pode ser usado uma vez", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const link = await inviteUi(page, "Carla", `c-${unique()}@mail.com`);

  const first = await guestPage(browser);
  await acceptUi(first.page, link);
  await expect(first.page).toHaveURL(/\/painel$/);

  const second = await guestPage(browser);
  await second.page.goto(link);
  await expect(second.page.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
  await first.ctx.close();
  await second.ctx.close();
});

test("token inexistente mostra a mesma mensagem genérica", async ({ page }) => {
  await page.goto("/convite/token-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
});

test("a tela de equipe exige login", async ({ page }) => {
  await page.goto("/equipe");
  await expect(page).toHaveURL(/\/login$/);
});

test("ISOLAMENTO: convites de pet shops diferentes não se misturam, mesmo com o mesmo e-mail", async ({ browser }) => {
  const shared = `compartilhado-${unique()}@mail.com`;

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShopWithAdmin(pageA, "Loja A");
  const shopA = (await pageA.getByTestId("tenant-name").textContent())!;
  const linkA = await inviteUi(pageA, "Convidado A", shared, "VET");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  const shopB = (await pageB.getByTestId("tenant-name").textContent())!;
  const linkB = await inviteUi(pageB, "Convidado B", shared, "GROOMER"); // mesmo e-mail: sem conflito

  // cada admin só vê os convites do próprio pet shop
  await expect(pageB.getByTestId("pending-invites")).toContainText("Convidado B");
  await expect(pageB.getByTestId("pending-invites")).not.toContainText("Convidado A");
  await pageA.goto("/equipe");
  await expect(pageA.getByTestId("pending-invites")).toContainText("Convidado A");
  await expect(pageA.getByTestId("pending-invites")).not.toContainText("Convidado B");

  // cada link leva ao pet shop certo, com o papel certo
  const guestA = await guestPage(browser);
  await acceptUi(guestA.page, linkA);
  await expect(guestA.page.getByTestId("tenant-name")).toHaveText(shopA);
  await expect(guestA.page.getByText("(VET)")).toBeVisible();

  const guestB = await guestPage(browser);
  await acceptUi(guestB.page, linkB);
  await expect(guestB.page.getByTestId("tenant-name")).toHaveText(shopB);
  await expect(guestB.page.getByText("(GROOMER)")).toBeVisible();

  for (const c of [ctxA, ctxB, guestA.ctx, guestB.ctx]) await c.close();
});
