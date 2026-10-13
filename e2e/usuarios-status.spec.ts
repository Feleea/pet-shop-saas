import { expect, test, type Page } from "@playwright/test";
import { unique } from "./helpers";
import { inviteAndAccept, loginUi, newShopWithAdmin } from "./team-helpers";

const row = (admin: Page, email: string) => admin.getByTestId("team-users").getByRole("row", { name: new RegExp(email) });

async function setVacation(admin: Page, email: string, days: string) {
  await row(admin, email).getByLabel("Dias de férias").fill(days);
  await row(admin, email).getByRole("button", { name: /férias/ }).click();
}

const SUSPENDED = "Acesso desativado. Fale com o administrador do pet shop.";
const VACATION_MSG = "Seu acesso está suspenso (férias). Fale com o administrador do pet shop.";

test("desativar derruba o acesso na hora e ativar devolve", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const email = `carla-${unique()}@mail.com`;
  const carla = await inviteAndAccept(browser, page, "Carla", email);

  await page.goto("/equipe");
  await expect(row(page, email).getByTestId("user-status")).toHaveText("Ativo");
  await row(page, email).getByRole("button", { name: "Desativar" }).click();
  await expect(row(page, email).getByTestId("user-status")).toHaveText("Inativo");

  // a sessão que a Carla já tinha aberta deixa de funcionar imediatamente
  await carla.page.goto("/painel");
  await expect(carla.page).toHaveURL(/\/login$/);
  await carla.page.goto("/clientes");
  await expect(carla.page).toHaveURL(/\/login$/);

  // e ela não consegue entrar de novo
  await loginUi(carla.page, carla.slug, email);
  await expect(carla.page.getByRole("alert")).toHaveText(SUSPENDED);
  await expect(carla.page).toHaveURL(/\/login$/);

  // senha errada não revela a situação da conta
  await loginUi(carla.page, carla.slug, email, "senha-errada-9");
  await expect(carla.page.getByRole("alert")).toHaveText("Credenciais inválidas");

  // reativada, ela volta a entrar
  await row(page, email).getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(row(page, email).getByTestId("user-status")).toHaveText("Ativo");
  await loginUi(carla.page, carla.slug, email);
  await expect(carla.page).toHaveURL(/\/painel$/);
  await expect(carla.page.getByTestId("user-name")).toHaveText("Carla");
  await carla.ctx.close();
});

test("férias: mostra a data prevista de retorno, bloqueia o acesso e pode ser atualizada ou encerrada", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const email = `vet-${unique()}@mail.com`;
  const vet = await inviteAndAccept(browser, page, "Dr. Vet", email, "VET");

  await page.goto("/equipe");
  await setVacation(page, email, "10");
  await expect(row(page, email).getByTestId("user-status")).toHaveText(/^Férias \(volta em \d{2}\/\d{2}\/\d{4}\)$/);
  const firstDate = await row(page, email).getByTestId("user-status").textContent();

  await vet.page.goto("/painel");
  await expect(vet.page).toHaveURL(/\/login$/);
  await loginUi(vet.page, vet.slug, email);
  await expect(vet.page.getByRole("alert")).toHaveText(VACATION_MSG);

  // com o usuário de férias, o botão vira "Atualizar férias" e a data muda
  await row(page, email).getByLabel("Dias de férias").fill("40");
  await row(page, email).getByRole("button", { name: "Atualizar férias" }).click();
  await expect(row(page, email).getByTestId("user-status")).not.toHaveText(firstDate!);
  await expect(row(page, email).getByTestId("user-status")).toHaveText(/^Férias \(volta em /);

  // encerrar as férias manualmente (a reativação automática virá depois)
  await row(page, email).getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(row(page, email).getByTestId("user-status")).toHaveText("Ativo");
  await loginUi(vet.page, vet.slug, email);
  await expect(vet.page).toHaveURL(/\/painel$/);
  await vet.ctx.close();
});

test("dias de férias inválidos são recusados e nada muda", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  const email = `c-${unique()}@mail.com`;
  const guest = await inviteAndAccept(browser, page, "Carla", email);
  await page.goto("/equipe");

  for (const days of ["", "0", "366", "abc", "7.5"]) {
    await setVacation(page, email, days);
    await expect(row(page, email).getByRole("alert")).toHaveText("Informe quantos dias de férias (de 1 a 365)");
  }
  await expect(row(page, email).getByTestId("user-status")).toHaveText("Ativo");
  await guest.page.goto("/painel");
  await expect(guest.page).toHaveURL(/\/painel$/); // continua com acesso
  await guest.ctx.close();
});

test("o administrador não tem controles de situação (não dá para se trancar para fora)", async ({ page }) => {
  const adminEmail = await newShopWithAdmin(page);
  await page.goto("/equipe");
  await expect(row(page, adminEmail).getByTestId("user-status")).toHaveText("Ativo");
  await expect(row(page, adminEmail).getByRole("button")).toHaveCount(0);
});

test("ISOLAMENTO: desativar uma pessoa não afeta quem tem o mesmo e-mail em outro pet shop", async ({ browser }) => {
  const shared = `mesma-pessoa-${unique()}@mail.com`;

  const ctxA = await browser.newContext();
  const adminA = await ctxA.newPage();
  await newShopWithAdmin(adminA, "Loja A");
  const guestA = await inviteAndAccept(browser, adminA, "Pessoa na A", shared, "GROOMER");

  const ctxB = await browser.newContext();
  const adminB = await ctxB.newPage();
  await newShopWithAdmin(adminB, "Loja B");
  const guestB = await inviteAndAccept(browser, adminB, "Pessoa na B", shared, "GROOMER");

  await adminA.goto("/equipe");
  await row(adminA, shared).getByRole("button", { name: "Desativar" }).click();
  await expect(row(adminA, shared).getByTestId("user-status")).toHaveText("Inativo");

  await guestA.page.goto("/painel");
  await expect(guestA.page).toHaveURL(/\/login$/); // desativada na loja A

  await guestB.page.goto("/painel");
  await expect(guestB.page).toHaveURL(/\/painel$/); // intacta na loja B
  await adminB.goto("/equipe");
  await expect(row(adminB, shared).getByTestId("user-status")).toHaveText("Ativo");

  for (const c of [ctxA, ctxB, guestA.ctx, guestB.ctx]) await c.close();
});
