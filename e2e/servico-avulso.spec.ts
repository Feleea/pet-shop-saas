import { expect, test, type Page } from "@playwright/test";
import { createServiceUi, selectByText } from "./agenda-helpers";
import { addProductToCart, createProductUi, finalizeSale } from "./pdv-helpers";
import { addServiceToCart } from "./fase5-helpers";
import { newShopWithAdmin } from "./team-helpers";

async function shopWithCatalog(page: Page, label = "Loja") {
  await newShopWithAdmin(page, label);
  await createProductUi(page, { name: "Shampoo", price: "30,00", initial: "10" });
  await createServiceUi(page, "Banho", "60", "50,00");
  await createServiceUi(page, "Tosa", "90", "80,00");
}

test("vende um serviço avulso, sem agendamento, e ele aparece na venda como Serviço", async ({ page }) => {
  await shopWithCatalog(page);
  await page.goto("/pdv");
  await addServiceToCart(page, "Banho");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 50,00");
  await finalizeSale(page, "PIX");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Venda #1");
  await expect(page.getByTestId("sale-item")).toHaveCount(1);
  await expect(page.getByTestId("sale-item")).toContainText("Banho");
  await expect(page.getByTestId("sale-item")).toContainText("Serviço");
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 50,00");
});

test("quantidade, mistura com produto e soma na mesma linha", async ({ page }) => {
  await shopWithCatalog(page);
  await page.goto("/pdv");
  await addServiceToCart(page, "Banho", 2);
  await addProductToCart(page, "Shampoo", 1);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 130,00"); // 2 × 50 + 30

  await selectByText(page.getByTestId("service-select"), "Banho");
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(2); // continua uma linha por serviço
  await expect(page.getByLabel("Quantidade de Banho")).toHaveValue("3");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("R$ 180,00");

  await finalizeSale(page, "CASH");
  await expect(page.getByTestId("sale-item")).toHaveCount(2);
  await expect(page.getByTestId("sale-total")).toHaveText("R$ 180,00");
});

test("validações do serviço avulso", async ({ page }) => {
  await shopWithCatalog(page);
  await page.goto("/pdv");

  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escolha um serviço");

  await selectByText(page.getByTestId("service-select"), "Tosa");
  await page.getByTestId("service-quantity").fill("0");
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await expect(page.getByRole("alert")).toHaveText("Quantidade inválida (de 1 a 9999)");
});

test("serviço desativado não aparece no PDV", async ({ page }) => {
  await shopWithCatalog(page);
  await page.goto("/servicos");
  await page.getByRole("row", { name: /Tosa/ }).getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByRole("row", { name: /Tosa/ })).toContainText("Inativo");

  await page.goto("/pdv");
  const options = await page.getByTestId("service-select").locator("option").allTextContents();
  expect(options.join("|")).toContain("Banho");
  expect(options.join("|")).not.toContain("Tosa");
});

test("ISOLAMENTO: os serviços de um pet shop não aparecem no PDV de outro", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await shopWithCatalog(pageA, "Loja A");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");
  await pageB.goto("/pdv");
  const options = await pageB.getByTestId("service-select").locator("option").allTextContents();
  expect(options).toEqual(["Selecione"]);
  await ctxA.close();
  await ctxB.close();
});
