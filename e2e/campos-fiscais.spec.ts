import { expect, test } from "@playwright/test";
import { createServiceUi } from "./agenda-helpers";
import { createProductUi } from "./pdv-helpers";
import { newShopWithAdmin } from "./team-helpers";

test("produto: dados fiscais são normalizados, validados e podem ser apagados", async ({ page }) => {
  await newShopWithAdmin(page);
  const id = await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  const save = () => page.getByRole("button", { name: "Salvar produto" }).click();

  await page.getByLabel("NCM").fill("123");
  await save();
  await expect(page.getByRole("alert")).toHaveText("NCM inválido (8 dígitos)");

  await page.getByLabel("NCM").fill("3305.10.00");
  await page.getByLabel("CFOP").fill("12");
  await save();
  await expect(page.getByRole("alert")).toHaveText("CFOP inválido (4 dígitos)");

  await page.getByLabel("CFOP").fill("5.102");
  await page.getByLabel("CSOSN").fill("102");
  await page.getByLabel("Unidade").fill("kg");
  await save();
  await expect(page.getByRole("status").filter({ hasText: "Dados salvos." })).toBeVisible();

  await page.goto(`/estoque/${id}`);
  await expect(page.getByLabel("NCM")).toHaveValue("33051000");
  await expect(page.getByLabel("CFOP")).toHaveValue("5102");
  await expect(page.getByLabel("Unidade")).toHaveValue("KG");

  await page.getByLabel("NCM").fill("");
  await save();
  await expect(page.getByRole("status").filter({ hasText: "Dados salvos." })).toBeVisible();
  await page.goto(`/estoque/${id}`);
  await expect(page.getByLabel("NCM")).toHaveValue("");
});

test("serviço: código da LC 116 e alíquota do ISS", async ({ page }) => {
  await newShopWithAdmin(page);
  await createServiceUi(page, "Banho", "60", "50,00");
  await page.getByRole("row", { name: /Banho/ }).getByRole("link", { name: "Editar" }).click();
  const save = () => page.getByRole("button", { name: "Salvar serviço" }).click();

  await page.getByLabel("Código do serviço (LC 116)").fill("5.8");
  await save();
  await expect(page.getByRole("alert")).toHaveText("Código do serviço inválido (ex.: 05.08)");

  await page.getByLabel("Código do serviço (LC 116)").fill("05.08");
  await page.getByLabel("Alíquota do ISS (%)").fill("6");
  await save();
  await expect(page.getByRole("alert")).toHaveText("A alíquota do ISS deve ficar entre 0% e 5%");

  await page.getByLabel("Alíquota do ISS (%)").fill("2,5");
  await save();
  await expect(page).toHaveURL(/\/servicos$/);

  await page.getByRole("row", { name: /Banho/ }).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Código do serviço (LC 116)")).toHaveValue("05.08");
  await expect(page.getByLabel("Alíquota do ISS (%)")).toHaveValue("2,50");
});
