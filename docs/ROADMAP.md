# Roadmap

- [x] Fase 0 — Setup (Next.js, Prisma, testes, CI)
- [x] Fase 1 — Auth + multi-tenancy
- [x] Fase 2 — Clientes e pets
- [ ] Fase 3 — Serviços e agenda
- [ ] Fase 4 — PDV e estoque
- [ ] Fase 5 — Dashboard
- [ ] Fase 6 — Cobrança do SaaS (planos)

## Regras de qualidade
- Toda história tem critérios de aceite em Gherkin em `docs/features/`.
- Regras de negócio têm testes unitários (Vitest); fluxos críticos têm E2E (Playwright).
- Toda tabela de negócio carrega `tenantId`; consultas usam `withTenant(session, ...)` (`src/lib/tenant.ts`) e testes garantem isolamento entre tenants.

## Decisões da Fase 1
- Sessão em JWT (HS256) num cookie httpOnly de 7 dias; o middleware protege `/painel`.
- Login por **código do pet shop (slug) + e-mail + senha**, porque o e-mail é único apenas dentro de cada tenant.
- Senhas com bcrypt; mensagem de erro genérica no login para não revelar se o e-mail existe.

## Decisões da Fase 2
- `Pet` usa **chave estrangeira composta** `(customerId, tenantId)` → `Customer(id, tenantId)`: o próprio banco impede um pet de apontar para cliente de outro tenant.
- Recurso de outro tenant responde **404** (não 403), para não revelar que ele existe.
- Permissões: ADMIN lê/escreve/exclui; ATTENDANT lê/escreve; GROOMER e VET só leem (`src/lib/permissions.ts`). A UI esconde os botões, mas a regra é imposta nos serviços.
- Telefone é guardado só com dígitos; a data de nascimento é uma data (sem hora) em UTC.
- Limpar um campo opcional na edição grava `null` (não mantém o valor antigo).
- A busca por nome ignora maiúsculas/minúsculas, mas ainda diferencia acentos ("jose" não acha "José").
