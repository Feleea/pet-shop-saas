import { expect, type Page } from "@playwright/test";

export const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export async function registerShop(page: Page, shopName: string, adminName: string, email: string, password: string) {
  await page.goto("/cadastro");
  await page.getByLabel("Nome do pet shop").fill(shopName);
  await page.getByLabel("Seu nome").fill(adminName);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/painel$/);
}

/** Cadastra um pet shop novo e deixa a página em /painel. */
export async function newShop(page: Page, label = "Loja") {
  await registerShop(page, `${label} ${unique()}`, "Admin", `admin-${unique()}@mail.com`, "senha-forte-1");
}

/** Cria um cliente pela interface e termina na página de detalhe dele. */
export async function createCustomerUi(page: Page, name: string, phone = "", email = "") {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do cliente").fill(name);
  if (phone) await page.getByLabel("Telefone").fill(phone);
  if (email) await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

export async function addPetUi(page: Page, name: string, species: "DOG" | "CAT" | "BIRD" | "OTHER" = "DOG", breed = "") {
  await page.getByLabel("Nome do pet").fill(name);
  await page.getByLabel("Espécie").selectOption(species);
  if (breed) await page.getByLabel("Raça").fill(breed);
  await page.getByRole("button", { name: "Adicionar pet" }).click();
  await expect(page.getByTestId("pet-list")).toContainText(name);
}
