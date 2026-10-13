# Roadmap

- [x] Fase 0 — Setup (Next.js, Prisma, testes, CI)
- [ ] Fase 1 — Auth + multi-tenancy
- [ ] Fase 2 — Clientes e pets
- [ ] Fase 3 — Serviços e agenda
- [ ] Fase 4 — PDV e estoque
- [ ] Fase 5 — Dashboard
- [ ] Fase 6 — Cobrança do SaaS (planos)

## Regras de qualidade
- Toda história tem critérios de aceite em Gherkin em `docs/features/`.
- Regras de negócio têm testes unitários (Vitest); fluxos críticos têm E2E (Playwright).
- Toda tabela de negócio carrega `tenantId`; testes garantem isolamento entre tenants.
