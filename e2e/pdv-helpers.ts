import { expect, type Page } from "@playwright/test";
import { selectByText } from "./agenda-helpers";

export interface NewProduct {
  name: string;
  price: string;
  min?: string;
  initial?: string;
}

/** Cria o produto pela interface e devolve o id (a tela do produto abre em /estoque/<id>). */
export async function createProductUi(page: Page, p: NewProduct): Promise<string> {
  await page.goto("/estoque/novo");
  await page.getByLabel("Nome do produto").fill(p.name);
  await page.getByLabel("Preço (R$)").fill(p.price);
  if (p.min) await page.getByLabel("Estoque mínimo").fill(p.min);
  if (p.initial) await page.getByLabel("Estoque inicial").fill(p.initial);
  await page.getByRole("button", { name: "Criar produto" }).click();
  await expect(page).toHaveURL(/\/estoque\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: p.name })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

export const productRow = (page: Page, name: string) => page.getByTestId("product-row").filter({ hasText: name });

/** Estoque atual de um produto, lido na listagem. */
export async function stockOf(page: Page, name: string): Promise<string> {
  await page.goto("/estoque");
  return (await productRow(page, name).getByTestId("product-stock").textContent())!.trim();
}

export async function addProductToCart(page: Page, productText: string, quantity = 1) {
  await selectByText(page.getByLabel("Produto"), productText);
  await page.getByLabel("Quantidade", { exact: true }).fill(String(quantity));
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await expect(page.getByTestId("cart-line").filter({ hasText: productText })).toHaveCount(1);
}

export async function finalizeSale(page: Page, payment: "CASH" | "PIX" | "DEBIT" | "CREDIT" = "PIX"): Promise<string> {
  await page.getByLabel("Forma de pagamento").selectOption(payment);
  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page).toHaveURL(/\/pdv\/vendas\/[^/?]+/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Venda rápida de um produto: abre o PDV, adiciona, finaliza e devolve o id da venda. */
export async function quickSale(page: Page, productText: string, quantity = 1, payment: "CASH" | "PIX" | "DEBIT" | "CREDIT" = "PIX") {
  await page.goto("/pdv");
  await addProductToCart(page, productText, quantity);
  return finalizeSale(page, payment);
}
