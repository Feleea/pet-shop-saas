import { expect, type Locator, type Page } from "@playwright/test";
import { addPetUi, createCustomerUi } from "./helpers";

/** Uma data bem à frente: a agenda não aceita horários no passado. */
export const futureDate = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Escolhe a opção cujo texto contém `text` (os valores das opções são ids gerados). */
export async function selectByText(select: Locator, text: string) {
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  expect(value, `opção "${text}" não encontrada`).toBeTruthy();
  await select.selectOption(value!);
}

export async function createServiceUi(page: Page, name: string, duration: string, price: string) {
  await page.goto("/servicos/novo");
  await page.getByLabel("Nome do serviço").fill(name);
  await page.getByLabel("Duração (minutos)").fill(duration);
  await page.getByLabel("Preço (R$)").fill(price);
  await page.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page).toHaveURL(/\/servicos$/);
}

/** Cenário base: serviço "Banho" (60 min, R$ 50), cliente "Carlos Silva" com os pets Thor (cachorro) e Mia (gata). */
export async function setupBasics(page: Page) {
  await createServiceUi(page, "Banho", "60", "50,00");
  await createCustomerUi(page, "Carlos Silva");
  const customerId = page.url().split("/").pop()!;
  await addPetUi(page, "Thor", "DOG");
  await addPetUi(page, "Mia", "CAT");
  return { customerId };
}

export interface Booking {
  pet: string;
  professional: string;
  date: string;
  time: string;
  service?: string;
  customer?: string;
}

export async function openBookingForm(page: Page, customer = "Carlos Silva") {
  await page.goto("/agenda/novo");
  await selectByText(page.getByLabel("Cliente"), customer);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Pet")).toBeVisible();
}

export async function fillBooking(page: Page, b: Booking) {
  await selectByText(page.getByLabel("Pet"), b.pet);
  await selectByText(page.getByLabel("Serviço"), b.service ?? "Banho");
  await selectByText(page.getByLabel("Profissional"), b.professional);
  await page.getByLabel("Data").fill(b.date);
  await page.getByLabel("Horário").fill(b.time);
}

export const submitBooking = (page: Page) => page.getByRole("button", { name: "Agendar" }).click();

/** Agenda pela interface e confirma que voltou para a agenda do dia. */
export async function bookUi(page: Page, b: Booking) {
  await openBookingForm(page, b.customer);
  await fillBooking(page, b);
  await submitBooking(page);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${b.date}`));
}
