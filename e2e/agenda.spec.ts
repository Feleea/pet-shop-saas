import { expect, test, type Page } from "@playwright/test";
import { addPetUi, createCustomerUi, unique } from "./helpers";
import { bookUi, createServiceUi, fillBooking, futureDate, openBookingForm, selectByText, setupBasics, submitBooking } from "./agenda-helpers";
import { inviteAndAccept, newShopWithAdmin } from "./team-helpers";

const rows = (page: Page) => page.getByTestId("appointment-row");
const BUSY_PRO = "O profissional já tem um agendamento neste horário";
const BUSY_PET = "O pet já tem um agendamento neste horário";

test("agenda um serviço e vê o horário na agenda do dia", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const date = futureDate();

  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });

  await expect(rows(page)).toHaveCount(1);
  const r = rows(page).first();
  await expect(r).toContainText("10:00–11:00");
  await expect(r).toContainText("Thor");
  await expect(r).toContainText("Carlos Silva");
  await expect(r).toContainText("Banho");
  await expect(r).toContainText("R$ 50,00");
  await expect(r).toContainText("Admin");
  await expect(r.getByTestId("appointment-status")).toHaveText("Agendado");

  await page.getByRole("link", { name: "Próximo dia →" }).click();
  await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();
});

test("o atalho 'Agendar' do cliente abre o formulário já com o cliente escolhido", async ({ page }) => {
  await newShopWithAdmin(page);
  const { customerId } = await setupBasics(page);
  await page.goto(`/clientes/${customerId}`);
  await page.getByRole("link", { name: "Agendar" }).click();
  await expect(page).toHaveURL(new RegExp(`/agenda/novo\\?clienteId=${customerId}`));
  await expect(page.getByText("Carlos Silva")).toBeVisible();
  await expect(page.getByLabel("Pet")).toBeVisible();
});

test("conflito do profissional: sobreposição é recusada, encostar nas pontas é permitido", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" }); // 10:00–11:00

  await openBookingForm(page);
  await fillBooking(page, { pet: "Mia", professional: "Admin", date, time: "10:30" });
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText(BUSY_PRO);

  await page.getByLabel("Horário").fill("09:30"); // termina às 10:30
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText(BUSY_PRO);

  await page.getByLabel("Horário").fill("11:00"); // começa quando o outro termina
  await submitBooking(page);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${date}`));
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText("11:00–12:00");
});

test("conflito do pet: o mesmo pet não pode estar com dois profissionais ao mesmo tempo", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const ana = await inviteAndAccept(browser, page, "Ana Tosadora", `ana-${unique()}@mail.com`, "GROOMER");
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });

  await openBookingForm(page);
  await fillBooking(page, { pet: "Thor", professional: "Ana Tosadora", date, time: "10:30" });
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText(BUSY_PET);

  // outro pet, outro profissional, mesmo horário: sem problema
  await selectByText(page.getByLabel("Pet"), "Mia");
  await submitBooking(page);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${date}`));
  await expect(rows(page)).toHaveCount(2);
  await ana.ctx.close();
});

test("validações do formulário de agendamento", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const date = futureDate();

  await openBookingForm(page);
  await page.getByLabel("Data").fill(date);
  await page.getByLabel("Horário").fill("10:00");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("Escolha o pet");

  await selectByText(page.getByLabel("Pet"), "Thor");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("Escolha o serviço");

  await selectByText(page.getByLabel("Serviço"), "Banho");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("Escolha o profissional");

  await selectByText(page.getByLabel("Profissional"), "Admin");
  await page.getByLabel("Data").fill("");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("Informe a data");

  await page.getByLabel("Data").fill(date);
  await page.getByLabel("Horário").fill("");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("Informe o horário");

  await page.getByLabel("Horário").fill("10:03");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("O horário deve ser em múltiplos de 5 minutos");

  await page.getByLabel("Horário").fill("10:00");
  await page.getByLabel("Data").fill("2000-01-01");
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText("O horário não pode estar no passado");

  await expect(page.getByLabel("Pet")).toHaveValue(/.+/); // nada do que foi escolhido se perdeu
  await page.goto(`/agenda?data=${date}`);
  await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();
});

test("cancelar pede confirmação e libera o horário", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });

  page.once("dialog", (d) => d.dismiss());
  await rows(page).first().getByRole("button", { name: "Cancelar agendamento" }).click();
  await expect(rows(page).first().getByTestId("appointment-status")).toHaveText("Agendado"); // desistiu

  page.once("dialog", (d) => d.accept());
  await rows(page).first().getByRole("button", { name: "Cancelar agendamento" }).click();
  await expect(rows(page).first().getByTestId("appointment-status")).toHaveText("Cancelado");
  await expect(rows(page).first().getByRole("button")).toHaveCount(0);

  // o mesmo horário volta a ficar livre
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });
  await expect(page.getByTestId("appointment-status")).toHaveText(["Cancelado", "Agendado"]);
});

test("marcar falta antes do horário é recusado", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  await bookUi(page, { pet: "Thor", professional: "Admin", date: futureDate(), time: "10:00" });

  await rows(page).first().getByRole("button", { name: "Faltou" }).click();
  await expect(rows(page).first().getByRole("alert")).toHaveText("Só é possível marcar falta depois do horário do agendamento");
  await expect(rows(page).first().getByTestId("appointment-status")).toHaveText("Agendado");
});

test("o profissional conclui o próprio atendimento, mas não mexe no resto", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const ana = await inviteAndAccept(browser, page, "Ana Tosadora", `ana-${unique()}@mail.com`, "GROOMER");
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Ana Tosadora", date, time: "10:00" });
  await bookUi(page, { pet: "Mia", professional: "Admin", date, time: "12:00" });

  await ana.page.goto(`/agenda?data=${date}`);
  const mine = rows(ana.page).filter({ hasText: "10:00–11:00" });
  const others = rows(ana.page).filter({ hasText: "12:00–13:00" });
  await expect(mine.getByRole("button", { name: "Concluir" })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Cancelar agendamento" })).toHaveCount(0);
  await expect(mine.getByRole("button", { name: "Faltou" })).toHaveCount(0);
  await expect(mine.getByRole("link", { name: "Reagendar" })).toHaveCount(0);
  await expect(others.getByRole("button")).toHaveCount(0); // atendimento de outro profissional

  await ana.page.goto("/agenda/novo");
  await expect(ana.page).toHaveURL(/\/agenda$/); // quem não agenda é levado de volta
  await expect(ana.page.getByRole("link", { name: "Novo agendamento" })).toHaveCount(0);

  await ana.page.goto(`/agenda?data=${date}`);
  await mine.getByRole("button", { name: "Concluir" }).click();
  await expect(mine.getByTestId("appointment-status")).toHaveText("Concluído");

  // concluído continua ocupando o horário da Ana
  await openBookingForm(page);
  await fillBooking(page, { pet: "Mia", professional: "Ana Tosadora", date, time: "10:00" });
  await submitBooking(page);
  await expect(page.getByRole("alert")).toHaveText(BUSY_PRO);
  await ana.ctx.close();
});

test("reagendar: sem mudar nada funciona, conflito é recusado e um horário livre é aceito", async ({ page }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  const date = futureDate();
  await bookUi(page, { pet: "Thor", professional: "Admin", date, time: "10:00" });
  await bookUi(page, { pet: "Mia", professional: "Admin", date, time: "11:00" });

  const thor = () => rows(page).filter({ hasText: "Thor" });
  await thor().getByRole("link", { name: "Reagendar" }).click();
  await expect(page.getByLabel("Horário")).toHaveValue("10:00");
  await expect(page.getByLabel("Data")).toHaveValue(date);
  await page.getByRole("button", { name: "Reagendar" }).click(); // não conflita consigo mesmo
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${date}`));

  await thor().getByRole("link", { name: "Reagendar" }).click();
  await page.getByLabel("Horário").fill("11:30"); // bate com a Mia (11:00–12:00)
  await page.getByRole("button", { name: "Reagendar" }).click();
  await expect(page.getByRole("alert")).toHaveText(BUSY_PRO);

  await page.getByLabel("Horário").fill("14:00");
  await page.getByRole("button", { name: "Reagendar" }).click();
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${date}`));
  await expect(thor()).toContainText("14:00–15:00");
  await expect(page.getByText("10:00–11:00")).toHaveCount(0);
});

test("profissional inativo ou de férias e serviço desativado não aparecem para agendar", async ({ page, browser }) => {
  await newShopWithAdmin(page);
  await setupBasics(page);
  await createServiceUi(page, "Tosa", "90", "80");
  const anaEmail = `ana-${unique()}@mail.com`;
  const ana = await inviteAndAccept(browser, page, "Ana Tosadora", anaEmail, "GROOMER");

  const options = async (label: string) => {
    await openBookingForm(page);
    return page.getByLabel(label).locator("option").allTextContents();
  };
  expect(await options("Profissional")).toContain("Ana Tosadora");
  expect((await options("Serviço")).join("|")).toContain("Tosa");

  const anaRow = () => page.getByTestId("team-users").getByRole("row", { name: new RegExp(anaEmail) });
  await page.goto("/equipe");
  await anaRow().getByRole("button", { name: "Desativar" }).click();
  await expect(anaRow().getByTestId("user-status")).toHaveText("Inativo");
  expect(await options("Profissional")).not.toContain("Ana Tosadora");

  await page.goto("/equipe");
  await anaRow().getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(anaRow().getByTestId("user-status")).toHaveText("Ativo");
  expect(await options("Profissional")).toContain("Ana Tosadora");

  await anaRow().getByLabel("Dias de férias").fill("5");
  await anaRow().getByRole("button", { name: "Colocar de férias" }).click();
  await expect(anaRow().getByTestId("user-status")).toHaveText(/^Férias/);
  expect(await options("Profissional")).not.toContain("Ana Tosadora");

  await page.goto("/servicos");
  await page.getByRole("row", { name: /Tosa/ }).getByRole("button", { name: "Desativar" }).click();
  expect((await options("Serviço")).join("|")).not.toContain("Tosa");
  await ana.ctx.close();
});

test("cliente ou pet com agendamento não pode ser excluído (o histórico fica guardado)", async ({ page }) => {
  await newShopWithAdmin(page);
  const { customerId } = await setupBasics(page);
  await bookUi(page, { pet: "Thor", professional: "Admin", date: futureDate(), time: "10:00" });

  await page.goto(`/clientes/${customerId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir cliente" }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${customerId}\\?erro=agendamentos`));
  await expect(page.getByRole("alert")).toContainText("Não é possível excluir");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carlos Silva");

  const thorItem = page.getByTestId("pet-list").locator("li", { hasText: "Thor" });
  page.once("dialog", (d) => d.accept());
  await thorItem.getByRole("button", { name: "Excluir pet" }).click();
  await expect(page.getByRole("alert")).toContainText("Não é possível excluir");
  await expect(page.getByTestId("pet-list")).toContainText("Thor");

  // a Mia não tem agendamentos: pode ser excluída
  const miaItem = page.getByTestId("pet-list").locator("li", { hasText: "Mia" });
  page.once("dialog", (d) => d.accept());
  await miaItem.getByRole("button", { name: "Excluir pet" }).click();
  await expect(page.getByTestId("pet-list")).not.toContainText("Mia");
});

test("rotas da agenda exigem login", async ({ page }) => {
  for (const path of ["/agenda", "/agenda/novo", "/agenda/qualquer-id/reagendar"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("ISOLAMENTO: cada pet shop tem a sua agenda, e o mesmo horário não conflita entre eles", async ({ browser }) => {
  const date = futureDate();

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await newShopWithAdmin(pageA, "Loja A");
  const { customerId } = await setupBasics(pageA);
  await bookUi(pageA, { pet: "Thor", professional: "Admin", date, time: "10:00" });
  const rescheduleHref = await pageA.getByRole("link", { name: "Reagendar" }).getAttribute("href");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await newShopWithAdmin(pageB, "Loja B");

  await pageB.goto(`/agenda?data=${date}`);
  await expect(pageB.getByText("Nenhum agendamento neste dia.")).toBeVisible();
  expect((await pageB.goto(rescheduleHref!))?.status()).toBe(404);
  expect((await pageB.goto(`/agenda/novo?clienteId=${customerId}`))?.status()).toBe(404);

  // a loja B agenda no mesmo dia e horário, com um "Admin" e um "Thor" dela, sem conflito
  await setupBasics(pageB);
  await bookUi(pageB, { pet: "Thor", professional: "Admin", date, time: "10:00" });
  await expect(rows(pageB)).toHaveCount(1);

  await pageA.goto(`/agenda?data=${date}`);
  await expect(rows(pageA)).toHaveCount(1);
  await ctxA.close();
  await ctxB.close();
});
