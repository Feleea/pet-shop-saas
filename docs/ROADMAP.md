# Roadmap

- [x] Fase 0 — Setup (Next.js, Prisma, testes, CI)
- [x] Fase 1 — Auth + multi-tenancy
- [x] Fase 2 — Clientes e pets
- [ ] Fase 3 — Serviços e agenda
  - [x] 3a — Catálogo de serviços
  - [x] 3a.2 — Equipe e convites de usuários
  - [ ] 3b — Agenda (agendamentos sem conflito por profissional)
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

## Decisões da Fase 3a (catálogo de serviços)
- Só o ADMIN gerencia o catálogo (preços são sensíveis); todos os papéis consultam os serviços **ativos**.
- Serviços são **desativados, não excluídos**, porque a agenda vai referenciá-los. O nome de um serviço desativado continua reservado.
- Nome único por pet shop, **sem diferenciar maiúsculas** (pré-checagem no serviço + índice único do banco como rede de segurança).
- Preço em **centavos** (inteiro); aceita "50", "50,5", "50.50", "R$ 1.250,50". Preço zero é permitido (serviço gratuito); máximo R$ 99.999,99.
- Duração em minutos, de 5 a 480, **múltipla de 5** — já pensando na grade de horários da agenda.
- Foi adicionado `@@unique([id, tenantId])` em `Service` para a futura chave estrangeira composta dos agendamentos.

## Decisões da Fase 3a.2 (equipe e convites)
- **Convite por link**, sem e-mail automático (ainda não há serviço de e-mail): o ADMIN copia o link e envia por onde preferir. Quem recebe define a **própria senha**; o ADMIN nunca a conhece.
- O banco guarda só o **hash (SHA-256)** do token; o link completo aparece **uma única vez**. Se o link se perder, revogue e gere outro.
- O convite vale **7 dias** e só pode ser usado **uma vez** (a aceitação é atômica: marca o convite e cria o usuário na mesma transação).
- Link inexistente, expirado, revogado ou usado mostram a **mesma mensagem** ("Convite inválido ou expirado").
- ADMIN **não é convidável**: por ora o dono que criou o pet shop é o único administrador.
- Só o ADMIN acessa `/equipe` (ação `users` em `src/lib/permissions.ts`).
- `/convite/*` é público de propósito (quem recebe ainda não tem conta).

## Pendências conhecidas da gestão de equipe
- **Remover ou desativar usuário** (ex.: funcionário que saiu): ainda não existe, e hoje a sessão (7 dias) seria o único limite.
- Trocar papel de um usuário, reenviar convite e recuperação de senha.
