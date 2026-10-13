# Roadmap

- [x] Fase 0 — Setup (Next.js, Prisma, testes, CI)
- [x] Fase 1 — Auth + multi-tenancy
- [ ] Fase 2 — Clientes e pets
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
