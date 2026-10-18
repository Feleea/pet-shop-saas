import { expect, type Browser, type Page } from "@playwright/test";
import { registerShop, unique } from "./helpers";

export type InvitableRole = "ATTENDANT" | "GROOMER" | "VET";

/** Cria um pet shop e devolve o e-mail do admin (para testes que precisam dele). */
export async function newShopWithAdmin(page: Page, label = "Loja") {
  const email = `admin-${unique()}@mail.com`;
  await registerShop(page, `${label} ${unique()}`, "Admin", email, "senha-forte-1");
  return email;
}

/** Gera o convite pela tela de equipe e devolve o link completo. */
export async function inviteUi(page: Page, name: string, email: string, role: InvitableRole = "ATTENDANT"): Promise<string> {
  await page.goto("/equipe");
  await page.getByLabel("Nome do convidado").fill(name);
  await page.getByLabel("E-mail do convidado").fill(email);
  await page.getByLabel("Papel").selectOption(role);
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = page.getByTestId("invite-link");
  await expect(link).toBeVisible();
  return (await link.textContent())!;
}

export async function acceptUi(page: Page, link: string, password = "senha-forte-1", confirm = password) {
  await page.goto(link);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(confirm);
  await page.getByRole("button", { name: "Aceitar convite" }).click();
}

/** Abre um contexto limpo (sem login), como a pessoa convidada faria. */
export async function guestPage(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

/** Convida, aceita em outro navegador e devolve a página da pessoa já logada em /painel. */
export async function inviteAndAccept(browser: Browser, adminPage: Page, name: string, email: string, role: InvitableRole = "ATTENDANT") {
  const link = await inviteUi(adminPage, name, email, role);
  const guest = await guestPage(browser);
  await acceptUi(guest.page, link);
  await expect(guest.page).toHaveURL(/\/painel$/);
  const slug = (await guest.page.getByTestId("tenant-slug").textContent())!;
  return { ...guest, slug };
}

export async function loginUi(page: Page, slug: string, email: string, password = "senha-forte-1") {
  await page.goto("/login");
  await page.getByLabel("Código do pet shop").fill(slug);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}
