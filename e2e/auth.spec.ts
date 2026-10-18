import { expect, test } from "@playwright/test";
import { registerShop, unique } from "./helpers";

test("cadastro cria o pet shop e leva ao painel", async ({ page }) => {
  const shop = `Au Au ${unique()}`;
  await registerShop(page, shop, "Ana", `ana-${unique()}@mail.com`, "senha-forte-1");
  await expect(page.getByTestId("tenant-name")).toHaveText(shop);
  await expect(page.getByTestId("user-name")).toHaveText("Ana");
});

test("painel sem login redireciona para /login", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login$/);
});

test("login com senha errada mostra erro genérico", async ({ page }) => {
  const shop = `Miau ${unique()}`;
  const email = `m-${unique()}@mail.com`;
  await registerShop(page, shop, "Maria", email, "senha-forte-1");
  const slug = (await page.getByTestId("tenant-slug").textContent())!;
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Código do pet shop").fill(slug);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-errada-9");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Credenciais inválidas");
});

test("logout encerra a sessão", async ({ page }) => {
  await registerShop(page, `Logout ${unique()}`, "Lia", `l-${unique()}@mail.com`, "senha-forte-1");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login$/);
});

test("ISOLAMENTO: dois pet shops com o mesmo e-mail enxergam apenas os próprios dados", async ({ browser }) => {
  const email = `mesmo-${unique()}@mail.com`;
  const shopA = `Loja A ${unique()}`;
  const shopB = `Loja B ${unique()}`;

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await registerShop(pageA, shopA, "Admin A", email, "senha-da-loja-A");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await registerShop(pageB, shopB, "Admin B", email, "senha-da-loja-B");

  await expect(pageA.getByTestId("tenant-name")).toHaveText(shopA);
  await expect(pageB.getByTestId("tenant-name")).toHaveText(shopB);
  await expect(pageA.getByTestId("user-name")).toHaveText("Admin A");
  await expect(pageB.getByTestId("user-name")).toHaveText("Admin B");

  await ctxA.close();
  await ctxB.close();
});
