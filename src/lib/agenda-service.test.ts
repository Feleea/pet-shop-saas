import { describe, expect, it } from "vitest";
import { BLOCKING_STATUSES, ELIGIBLE_PROFESSIONAL_ROLES, MSG } from "./agenda-constants";
import {
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  listAgenda,
  listProfessionals,
  rescheduleAppointment,
  type AgendaRepo,
  type AppointmentRecord,
  type ProfessionalInfo,
  type ServiceInfo,
} from "./agenda-service";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { hasConflict } from "./scheduling";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";
import { zonedLocalToUtc } from "./timezone";

// ---------- "mundo" em memória: dois pet shops, como o Prisma repo respeitando o tenantId ----------
function world() {
  const customers = [
    { id: "cA1", tenantId: "A", name: "Carlos" },
    { id: "cA2", tenantId: "A", name: "Dora" },
    { id: "cB1", tenantId: "B", name: "Beto" },
  ];
  const pets = [
    { id: "pA1", tenantId: "A", customerId: "cA1", name: "Thor" },
    { id: "pA2", tenantId: "A", customerId: "cA1", name: "Mia" },
    { id: "pA3", tenantId: "A", customerId: "cA2", name: "Rex" },
    { id: "pB1", tenantId: "B", customerId: "cB1", name: "Bidu" },
  ];
  const services: (ServiceInfo & { tenantId: string })[] = [
    { id: "sA1", tenantId: "A", name: "Banho", durationMinutes: 60, priceCents: 5000, active: true },
    { id: "sA2", tenantId: "A", name: "Tosa", durationMinutes: 90, priceCents: 8000, active: false },
    { id: "sA3", tenantId: "A", name: "Consulta", durationMinutes: 45, priceCents: 12000, active: true },
    { id: "sB1", tenantId: "B", name: "Banho", durationMinutes: 60, priceCents: 6000, active: true },
  ];
  const person = (id: string, tenantId: string, name: string, role: Role, status: ProfessionalInfo["status"] = "ACTIVE") => ({
    id,
    tenantId,
    name,
    role,
    status,
  });
  const people = [
    person("admin-A", "A", "Dono", "ADMIN"),
    person("groomer-A", "A", "Ana", "GROOMER"),
    person("vet-A", "A", "Vitor", "VET"),
    person("att-A", "A", "Atendente", "ATTENDANT"),
    person("off-A", "A", "Inativa", "GROOMER", "INACTIVE"),
    person("vac-A", "A", "De Férias", "GROOMER", "VACATION"),
    person("admin-B", "B", "Dona B", "ADMIN"),
  ];
  const appts: AppointmentRecord[] = [];
  let seq = 0;

  const asBlocking = (s: string) => (BLOCKING_STATUSES as readonly string[]).includes(s);
  function findBusy(
    tenantId: string,
    slot: { professionalId: string; petId: string; startsAt: Date; endsAt: Date },
    excludeId?: string,
  ) {
    const s = { start: slot.startsAt, end: slot.endsAt };
    const others = appts.filter((a) => a.tenantId === tenantId && a.id !== excludeId && asBlocking(a.status));
    const clash = (a: AppointmentRecord) => hasConflict(s, { start: a.startsAt, end: a.endsAt });
    if (others.some((a) => a.professionalId === slot.professionalId && clash(a))) return "PROFESSIONAL_BUSY" as const;
    if (others.some((a) => a.petId === slot.petId && clash(a))) return "PET_BUSY" as const;
    return null;
  }
  const view = (a: AppointmentRecord) => ({
    ...a,
    customerName: customers.find((c) => c.id === a.customerId)!.name,
    petName: pets.find((p) => p.id === a.petId)!.name,
    professionalName: people.find((p) => p.id === a.professionalId)!.name,
  });

  const repo: AgendaRepo = {
    async findCustomerPet(tenantId, customerId, petId) {
      const pet = pets.find((p) => p.id === petId && p.customerId === customerId && p.tenantId === tenantId);
      const customer = customers.find((c) => c.id === customerId && c.tenantId === tenantId);
      return pet && customer ? { customerName: customer.name, petName: pet.name } : null;
    },
    async findService(tenantId, id) {
      const s = services.find((x) => x.id === id && x.tenantId === tenantId);
      return s ? { id: s.id, name: s.name, durationMinutes: s.durationMinutes, priceCents: s.priceCents, active: s.active } : null;
    },
    async findProfessional(tenantId, id) {
      const p = people.find((x) => x.id === id && x.tenantId === tenantId);
      return p ? { id: p.id, name: p.name, role: p.role, status: p.status } : null;
    },
    async listProfessionals(tenantId) {
      return people
        .filter((p) => p.tenantId === tenantId && p.status === "ACTIVE" && ELIGIBLE_PROFESSIONAL_ROLES.includes(p.role))
        .map(({ id, name, role, status }) => ({ id, name, role, status }));
    },
    async createAppointmentIfFree(tenantId, data) {
      const busy = findBusy(tenantId, data);
      if (busy) return { ok: false, reason: busy };
      const rec: AppointmentRecord = { id: `a${++seq}`, tenantId, status: "SCHEDULED", ...data };
      appts.push(rec);
      return { ok: true, value: rec };
    },
    async rescheduleIfFree(tenantId, id, { startsAt, endsAt, professionalId }) {
      const a = appts.find((x) => x.id === id && x.tenantId === tenantId);
      if (!a) return { ok: false, reason: "NOT_FOUND" };
      if (a.status !== "SCHEDULED") return { ok: false, reason: "NOT_SCHEDULED" };
      const busy = findBusy(tenantId, { professionalId, petId: a.petId, startsAt, endsAt }, id);
      if (busy) return { ok: false, reason: busy };
      Object.assign(a, { startsAt, endsAt, professionalId });
      return { ok: true, value: a };
    },
    async findAppointment(tenantId, id) {
      const a = appts.find((x) => x.id === id && x.tenantId === tenantId);
      return a ? view(a) : null;
    },
    async listAppointments(tenantId, { from, to, professionalId }) {
      return appts
        .filter(
          (a) =>
            a.tenantId === tenantId &&
            a.startsAt >= from &&
            a.startsAt < to &&
            (!professionalId || a.professionalId === professionalId),
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(view);
    },
    async setStatus(tenantId, id, to) {
      const a = appts.find((x) => x.id === id && x.tenantId === tenantId && x.status === "SCHEDULED");
      if (!a) return null;
      a.status = to;
      return a;
    },
  };
  return { repo, appts, services };
}

const NOW = new Date("2026-10-13T12:00:00.000Z"); // 09:00 em Brasília
const deps = { now: NOW };
const D = "2026-10-14";
const s = (role: Role, tenantId: string, userId: string): SessionPayload => ({ userId, tenantId, role });
const adminA = s("ADMIN", "A", "admin-A");
const attA = s("ATTENDANT", "A", "att-A");
const groomerA = s("GROOMER", "A", "groomer-A");
const vetA = s("VET", "A", "vet-A");
const adminB = s("ADMIN", "B", "admin-B");

const base = { customerId: "cA1", petId: "pA1", serviceId: "sA1", professionalId: "admin-A", date: D, time: "10:00" };
const book = (repo: AgendaRepo, over: Record<string, unknown> = {}, who = adminA) => createAppointment(repo, who, { ...base, ...over }, deps);
const at = (time: string, date = D) => zonedLocalToUtc(date, time)!.toISOString();

describe("agendar", () => {
  it("cria o agendamento com fim = início + duração do serviço, e guarda um snapshot do serviço", async () => {
    const { repo } = world();
    const a = await book(repo);
    expect(a).toMatchObject({
      tenantId: "A",
      status: "SCHEDULED",
      serviceName: "Banho",
      durationMinutes: 60,
      priceCents: 5000,
      professionalId: "admin-A",
      notes: null,
    });
    expect(a.startsAt.toISOString()).toBe(at("10:00"));
    expect(a.endsAt.toISOString()).toBe(at("11:00"));
  });

  it("a duração vem do serviço escolhido (45 min)", async () => {
    const { repo } = world();
    const a = await book(repo, { serviceId: "sA3" });
    expect(a.endsAt.getTime() - a.startsAt.getTime()).toBe(45 * 60_000);
  });

  it("interpreta o horário no fuso informado", async () => {
    const { repo } = world();
    const a = await createAppointment(repo, adminA, { ...base, time: "10:00" }, { ...deps, tz: "UTC" });
    expect(a.startsAt.toISOString()).toBe(`${D}T10:00:00.000Z`);
  });

  it("aceita observações e ignora um tenantId vindo da entrada", async () => {
    const { repo } = world();
    const a = await book(repo, { notes: "  Cuidado com as patas ", tenantId: "B" });
    expect(a).toMatchObject({ notes: "Cuidado com as patas", tenantId: "A" });
  });

  it("agendar exatamente agora é permitido; um minuto antes, não", async () => {
    const { repo } = world();
    await expect(book(repo, { date: "2026-10-13", time: "09:00" })).resolves.toBeTruthy();
    await expect(book(repo, { date: "2026-10-13", time: "08:55", petId: "pA2" })).rejects.toThrow(MSG.past);
  });

  it.each([
    [{ customerId: "" }, "Escolha o cliente"],
    [{ petId: "" }, "Escolha o pet"],
    [{ petId: null }, "Escolha o pet"],
    [{ serviceId: "" }, "Escolha o serviço"],
    [{ professionalId: "" }, "Escolha o profissional"],
    [{ date: "" }, "Informe a data"],
    [{ time: "" }, "Informe o horário"],
    [{ time: "9:00" }, "Horário inválido"],
    [{ date: "14/10/2026" }, "Data inválida"],
    [{ date: "2026-02-30" }, "Data inválida"],
    [{ time: "10:03" }, MSG.step5],
    [{ time: "10:59" }, MSG.step5],
    [{ date: "2000-01-01" }, MSG.past],
    [{ notes: "x".repeat(301) }, "Máximo de 300 caracteres nas observações"],
  ])("rejeita %j com a mensagem certa", async (over, message) => {
    const { repo, appts } = world();
    await expect(book(repo, over)).rejects.toThrow(new ValidationError(message));
    expect(appts).toHaveLength(0);
  });

  it("o pet precisa ser do cliente escolhido", async () => {
    const { repo } = world();
    await expect(book(repo, { petId: "pA3" })).rejects.toBeInstanceOf(NotFoundError); // Rex é da Dora
  });

  it("serviço desativado ou inexistente fica indisponível", async () => {
    const { repo } = world();
    await expect(book(repo, { serviceId: "sA2" })).rejects.toThrow(new ValidationError(MSG.serviceUnavailable));
    await expect(book(repo, { serviceId: "nao-existe" })).rejects.toThrow(MSG.serviceUnavailable);
  });

  it.each([
    ["groomer-A"],
    ["vet-A"],
    ["admin-A"],
  ])("aceita o profissional %s", async (professionalId) => {
    const { repo } = world();
    await expect(book(repo, { professionalId })).resolves.toMatchObject({ professionalId });
  });

  it.each([
    ["att-A", "atendente não executa serviços"],
    ["off-A", "profissional inativo"],
    ["vac-A", "profissional de férias"],
    ["nao-existe", "inexistente"],
  ])("recusa %s (%s)", async (professionalId) => {
    const { repo } = world();
    await expect(book(repo, { professionalId })).rejects.toThrow(new ValidationError(MSG.professionalUnavailable));
  });
});

describe("conflito de horário do profissional", () => {
  async function withBooked() {
    const w = world();
    await book(w.repo); // 10:00–11:00, Thor, admin-A
    return w;
  }

  it.each([
    ["10:00", "mesmo horário"],
    ["10:30", "começa no meio"],
    ["09:30", "termina no meio (09:30–10:30)"],
    ["10:55", "começa no fim"],
  ])("recusa %s (%s)", async (time) => {
    const { repo } = await withBooked();
    const err = await book(repo, { petId: "pA2", time }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(MSG.professionalBusy);
  });

  it.each([
    ["11:00", "começa quando o outro termina"],
    ["09:00", "termina quando o outro começa (09:00–10:00)"],
    ["15:00", "bem depois"],
  ])("aceita %s (%s): encostar nas pontas não é conflito", async (time) => {
    const { repo } = await withBooked();
    await expect(book(repo, { petId: "pA2", time })).resolves.toBeTruthy();
  });

  it("outro profissional pode atender no mesmo horário (pet diferente)", async () => {
    const { repo } = await withBooked();
    await expect(book(repo, { petId: "pA2", professionalId: "groomer-A", time: "10:00" })).resolves.toBeTruthy();
  });

  it("agendamento cancelado libera o horário", async () => {
    const { repo } = world();
    const first = await book(repo);
    await changeAppointmentStatus(repo, adminA, first.id, "CANCELED", deps);
    await expect(book(repo, { petId: "pA2" })).resolves.toBeTruthy();
  });

  it("agendamento concluído continua ocupando o horário", async () => {
    const { repo } = world();
    const first = await book(repo);
    await changeAppointmentStatus(repo, adminA, first.id, "COMPLETED", deps);
    await expect(book(repo, { petId: "pA2" })).rejects.toThrow(MSG.professionalBusy);
  });

  it("agendamentos de outro pet shop nunca bloqueiam este", async () => {
    const { repo } = await withBooked();
    const b = await createAppointment(
      repo,
      adminB,
      { customerId: "cB1", petId: "pB1", serviceId: "sB1", professionalId: "admin-B", date: D, time: "10:00" },
      deps,
    );
    expect(b.tenantId).toBe("B");
  });
});

describe("conflito de horário do pet", () => {
  it("o mesmo pet não pode estar em dois serviços ao mesmo tempo, mesmo com profissionais diferentes", async () => {
    const { repo } = world();
    await book(repo); // Thor 10:00–11:00 com admin-A
    const err = await book(repo, { professionalId: "groomer-A", time: "10:30" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(MSG.petBusy);
  });

  it("o mesmo pet pode ter serviços seguidos", async () => {
    const { repo } = world();
    await book(repo);
    await expect(book(repo, { professionalId: "groomer-A", time: "11:00" })).resolves.toBeTruthy();
  });

  it("quando os dois conflitam, a mensagem é a do profissional", async () => {
    const { repo } = world();
    await book(repo);
    await expect(book(repo, { time: "10:30" })).rejects.toThrow(MSG.professionalBusy);
  });
});

describe("reagendar", () => {
  it("muda o horário mantendo a duração original e o snapshot", async () => {
    const { repo, services } = world();
    const a = await book(repo);
    services[0].durationMinutes = 30; // catálogo mudou depois
    const r = await rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "14:00" }, deps);
    expect(r.startsAt.toISOString()).toBe(at("14:00"));
    expect(r.endsAt.toISOString()).toBe(at("15:00")); // continua 60 min
  });

  it("pode trocar de profissional e de dia", async () => {
    const { repo } = world();
    const a = await book(repo);
    const r = await rescheduleAppointment(repo, adminA, a.id, { professionalId: "groomer-A", date: "2026-10-15", time: "09:00" }, deps);
    expect(r).toMatchObject({ professionalId: "groomer-A" });
    expect(r.startsAt.toISOString()).toBe(at("09:00", "2026-10-15"));
  });

  it("reagendar para o próprio horário não conflita consigo mesmo", async () => {
    const { repo } = world();
    const a = await book(repo);
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "10:00" }, deps)).resolves.toBeTruthy();
  });

  it("encurtar a espera com sobreposição parcial de si mesmo é permitido (10:30 sobre 10:00–11:00)", async () => {
    const { repo } = world();
    const a = await book(repo);
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "10:30" }, deps)).resolves.toBeTruthy();
  });

  it("recusa conflito com outro agendamento e não altera nada", async () => {
    const { repo } = world();
    const a = await book(repo);
    await book(repo, { petId: "pA2", time: "11:00" });
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "11:30" }, deps)).rejects.toThrow(
      MSG.professionalBusy,
    );
    expect((await getAppointment(repo, adminA, a.id)).startsAt.toISOString()).toBe(at("10:00"));
  });

  it("recusa conflito do pet com outro profissional", async () => {
    const { repo } = world();
    const a = await book(repo, { professionalId: "groomer-A", time: "09:00" });
    await book(repo, { professionalId: "admin-A", time: "14:00", petId: "pA2" });
    await book(repo, { professionalId: "vet-A", time: "11:00", serviceId: "sA3" }); // Thor 11:00–11:45
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "groomer-A", date: D, time: "11:15" }, deps)).rejects.toThrow(
      MSG.petBusy,
    );
  });

  it.each([
    [{ time: "10:07" }, MSG.step5],
    [{ date: "2000-01-01" }, MSG.past],
    [{ professionalId: "att-A" }, MSG.professionalUnavailable],
    [{ professionalId: "off-A" }, MSG.professionalUnavailable],
    [{ date: "" }, "Informe a data"],
  ])("valida %j", async (over, message) => {
    const { repo } = world();
    const a = await book(repo);
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "10:00", ...over }, deps)).rejects.toThrow(
      message,
    );
  });

  it("só agendamentos com situação Agendado podem ser reagendados", async () => {
    const { repo } = world();
    const a = await book(repo);
    await changeAppointmentStatus(repo, adminA, a.id, "CANCELED", deps);
    await expect(rescheduleAppointment(repo, adminA, a.id, { professionalId: "admin-A", date: D, time: "12:00" }, deps)).rejects.toThrow(
      new ValidationError(MSG.notScheduled),
    );
  });
});

describe("mudar a situação", () => {
  it("ATTENDANT e ADMIN concluem, cancelam e marcam falta (depois do horário)", async () => {
    const { repo } = world();
    const a = await book(repo);
    const b = await book(repo, { petId: "pA2", time: "13:00" });
    const c = await book(repo, { petId: "pA2", time: "15:00" });
    const later = { now: new Date("2026-10-14T20:00:00.000Z") }; // depois de todos os horários
    expect((await changeAppointmentStatus(repo, attA, a.id, "COMPLETED", later)).status).toBe("COMPLETED");
    expect((await changeAppointmentStatus(repo, adminA, b.id, "CANCELED", later)).status).toBe("CANCELED");
    expect((await changeAppointmentStatus(repo, attA, c.id, "NO_SHOW", later)).status).toBe("NO_SHOW");
  });

  it("o profissional do agendamento pode concluí-lo, mas outro profissional não", async () => {
    const { repo } = world();
    const mine = await book(repo, { professionalId: "groomer-A" });
    const theirs = await book(repo, { petId: "pA2", professionalId: "admin-A" });
    await expect(changeAppointmentStatus(repo, groomerA, mine.id, "COMPLETED", deps)).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(changeAppointmentStatus(repo, groomerA, theirs.id, "COMPLETED", deps)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeAppointmentStatus(repo, vetA, theirs.id, "COMPLETED", deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("o profissional atribuído NÃO pode cancelar nem marcar falta (só quem agenda)", async () => {
    const { repo } = world();
    const mine = await book(repo, { professionalId: "groomer-A" });
    await expect(changeAppointmentStatus(repo, groomerA, mine.id, "CANCELED", deps)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeAppointmentStatus(repo, groomerA, mine.id, "NO_SHOW", deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("falta só vale depois do horário marcado", async () => {
    const { repo } = world();
    const a = await book(repo);
    await expect(changeAppointmentStatus(repo, adminA, a.id, "NO_SHOW", deps)).rejects.toThrow(new ValidationError(MSG.noShowEarly));
    const exactStart = { now: new Date(at("10:00")) };
    await expect(changeAppointmentStatus(repo, adminA, a.id, "NO_SHOW", exactStart)).resolves.toMatchObject({ status: "NO_SHOW" });
  });

  it("falta libera o horário", async () => {
    const { repo } = world();
    const a = await book(repo);
    await changeAppointmentStatus(repo, adminA, a.id, "NO_SHOW", { now: new Date(at("12:00")) });
    await expect(book(repo, { petId: "pA2" })).resolves.toBeTruthy();
  });

  it("situações finais não mudam mais", async () => {
    const { repo } = world();
    const a = await book(repo);
    await changeAppointmentStatus(repo, adminA, a.id, "CANCELED", deps);
    for (const to of ["COMPLETED", "CANCELED", "NO_SHOW"]) {
      await expect(changeAppointmentStatus(repo, adminA, a.id, to, { now: new Date(at("12:00")) })).rejects.toThrow(MSG.notScheduled);
    }
  });

  it.each(["SCHEDULED", "DELETED", "", null, undefined])("recusa a situação %j", async (to) => {
    const { repo } = world();
    const a = await book(repo);
    await expect(changeAppointmentStatus(repo, adminA, a.id, to, deps)).rejects.toThrow(new ValidationError("Situação inválida"));
  });

  it("agendamento inexistente dá NotFound", async () => {
    const { repo } = world();
    await expect(changeAppointmentStatus(repo, adminA, "nao-existe", "CANCELED", deps)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("agenda do dia", () => {
  it("lista só o dia pedido, em ordem de horário, usando o dia LOCAL", async () => {
    const { repo } = world();
    await book(repo, { time: "15:00", petId: "pA2" });
    await book(repo, { time: "09:00" });
    await book(repo, { time: "23:30", petId: "pA3", customerId: "cA2" });
    // meia-noite do dia seguinte (outro profissional: o das 23:30 vai até 00:30 e ocuparia o mesmo horário)
    await book(repo, { date: "2026-10-15", time: "00:00", professionalId: "groomer-A", petId: "pA2" });
    const day = await listAgenda(repo, adminA, { date: D }, deps);
    expect(day.date).toBe(D);
    expect(day.items.map((i) => i.startsAt.toISOString())).toEqual([at("09:00"), at("15:00"), at("23:30")]);
    const next = await listAgenda(repo, adminA, { date: "2026-10-15" }, deps);
    expect(next.items).toHaveLength(1);
  });

  it("sem data, usa o dia de hoje no fuso do pet shop", async () => {
    const { repo } = world();
    const day = await listAgenda(repo, adminA, {}, { now: new Date("2026-10-14T02:00:00.000Z") }); // 23:00 de 13/10 em Brasília
    expect(day.date).toBe("2026-10-13");
  });

  it("filtra por profissional", async () => {
    const { repo } = world();
    await book(repo);
    await book(repo, { professionalId: "groomer-A", petId: "pA2" });
    const day = await listAgenda(repo, adminA, { date: D, professionalId: "groomer-A" }, deps);
    expect(day.items.map((i) => i.professionalName)).toEqual(["Ana"]);
  });

  it("recusa data inválida", async () => {
    const { repo } = world();
    await expect(listAgenda(repo, adminA, { date: "2026-02-30" }, deps)).rejects.toThrow(new ValidationError("Data inválida"));
  });

  it("todos os papéis consultam a agenda", async () => {
    const { repo } = world();
    await book(repo);
    for (const who of [adminA, attA, groomerA, vetA]) {
      expect((await listAgenda(repo, who, { date: D }, deps)).items).toHaveLength(1);
    }
  });

  it("só lista profissionais ativos e que executam serviços, do próprio pet shop", async () => {
    const { repo } = world();
    expect((await listProfessionals(repo, adminA)).map((p) => p.name).sort()).toEqual(["Ana", "Dono", "Vitor"]);
    expect((await listProfessionals(repo, adminB)).map((p) => p.name)).toEqual(["Dona B"]);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  const forB = { customerId: "cB1", petId: "pB1", serviceId: "sB1", professionalId: "admin-B", date: D, time: "10:00" };

  it("não agenda usando cliente/pet de outro pet shop", async () => {
    const { repo, appts } = world();
    await expect(book(repo, {}, adminB)).rejects.toBeInstanceOf(NotFoundError); // cA1/pA1 são do A
    expect(appts).toHaveLength(0);
  });

  it("não usa serviço nem profissional de outro pet shop", async () => {
    const { repo } = world();
    await expect(createAppointment(repo, adminB, { ...forB, serviceId: "sA1" }, deps)).rejects.toThrow(MSG.serviceUnavailable);
    await expect(createAppointment(repo, adminB, { ...forB, professionalId: "groomer-A" }, deps)).rejects.toThrow(MSG.professionalUnavailable);
  });

  it("não vê, não reagenda e não muda agendamentos de outro pet shop (404)", async () => {
    const { repo } = world();
    const a = await book(repo);
    await expect(getAppointment(repo, adminB, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rescheduleAppointment(repo, adminB, a.id, { professionalId: "admin-B", date: D, time: "12:00" }, deps)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(changeAppointmentStatus(repo, adminB, a.id, "CANCELED", deps)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getAppointment(repo, adminA, a.id)).status).toBe("SCHEDULED");
  });

  it("a agenda de um pet shop não mostra agendamentos do outro", async () => {
    const { repo } = world();
    await book(repo);
    expect((await listAgenda(repo, adminB, { date: D }, deps)).items).toEqual([]);
  });
});

describe("permissões", () => {
  it("ATTENDANT agenda; GROOMER e VET não", async () => {
    const { repo } = world();
    await expect(book(repo, {}, attA)).resolves.toBeTruthy();
    for (const who of [groomerA, vetA]) {
      await expect(book(repo, { petId: "pA2", time: "13:00" }, who)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("GROOMER e VET não reagendam", async () => {
    const { repo } = world();
    const a = await book(repo);
    for (const who of [groomerA, vetA]) {
      await expect(rescheduleAppointment(repo, who, a.id, { professionalId: "admin-A", date: D, time: "12:00" }, deps)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as AgendaRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(createAppointment(spy, groomerA, base, deps)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rescheduleAppointment(spy, vetA, "x", { professionalId: "p", date: D, time: "10:00" }, deps)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeAppointmentStatus(spy, groomerA, "x", "CANCELED", deps)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
