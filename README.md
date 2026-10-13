# Pet Shop SaaS

SaaS multi-tenant para gestão de pet shops: clientes, pets, agenda, vendas e estoque.

## Stack
Next.js · TypeScript · PostgreSQL · Prisma · Vitest · Playwright · GitHub Actions

## Começando
```bash
cp .env.example .env
npm install
npm run db:up        # sobe o PostgreSQL via Docker
npm run db:generate
npm run db:migrate   # cria as tabelas
npm run dev          # http://localhost:3000
```

## Testes
```bash
npm test             # unitários (Vitest)
npm run test:e2e     # E2E (Playwright) — rode antes: npx playwright install chromium
npm run lint && npm run typecheck
```

Veja `docs/ROADMAP.md` para as fases e `docs/features/` para os critérios de aceite.
