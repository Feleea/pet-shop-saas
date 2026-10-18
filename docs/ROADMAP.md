# Roadmap

- [x] Fase 0 — Setup (Next.js, Prisma, testes, CI)
- [x] Fase 1 — Auth + multi-tenancy
- [x] Fase 2 — Clientes e pets
- [x] Fase 3 — Serviços e agenda
  - [x] 3a — Catálogo de serviços
  - [x] 3a.2 — Equipe e convites de usuários
  - [x] 3a.3 — Situação do usuário (ativo, inativo, férias)
  - [x] 3b — Agenda (agendamentos sem conflito por profissional)
- [x] Fase 4 — PDV e estoque
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

## Decisões da Fase 3a.3 (situação do usuário)
- Três situações: **Ativo**, **Inativo** e **Férias**. Inativo e Férias bloqueiam o login **e derrubam sessões já abertas**: a cada requisição `getSession()` confere a situação atual no banco (o token sozinho não saberia). O papel também passa a vir do banco.
- **Férias** pede a quantidade de dias (1 a 365) e grava a **data prevista de retorno** (`vacationReturnsAt` = agora + n dias). Atualizar as férias recalcula a data a partir de agora.
- **Reativação automática: NÃO implementada (fica para outro momento).** Hoje o ADMIN reativa manualmente. O campo `vacationReturnsAt` e o índice `(status, vacationReturnsAt)` já estão prontos: a futura rotina deve reativar quem tem `status = VACATION` e `vacationReturnsAt <= agora`.
- No login, a mensagem de conta suspensa só aparece **depois de a senha estar correta**; senha errada continua "Credenciais inválidas".
- Travas: o ADMIN não altera a própria situação nem a de outro ADMIN (evita ficar sem ninguém com acesso). O repositório também filtra `role != ADMIN` como segunda proteção.
- Usuários continuam sem ser excluídos: o histórico (clientes, agenda) fica preservado.

## Decisões da Fase 3b (agenda)
- **Conflito**: o mesmo profissional **ou o mesmo pet** não podem ter dois agendamentos sobrepostos. Encostar nas pontas (um termina quando o outro começa) é permitido. Só **Agendado** e **Concluído** ocupam o horário; **Cancelado** e **Faltou** liberam.
- **Atomicidade**: checar o conflito e gravar acontece na **mesma transação, com trava (advisory lock)** por profissional e por pet. Duas pessoas agendando ao mesmo tempo não furam a regra. Reforço futuro possível: *exclusion constraint* do PostgreSQL.
- **Integridade no banco**: chaves estrangeiras compostas garantem que cliente, pet, serviço e profissional são do mesmo pet shop e que o pet é do cliente.
- **Snapshot**: nome, duração e preço do serviço são copiados para o agendamento; mudar o catálogo depois não altera o que já foi marcado. Reagendar mantém a duração original.
- **Duração e horários**: o fim é início + duração do serviço; o início precisa ser múltiplo de 5 minutos e **não pode estar no passado** (agendar exatamente "agora" é permitido).
- **Fuso**: horário de Brasília para todos os pet shops (`SHOP_TIMEZONE`). Fuso por pet shop fica para depois. A conversão trata horário de verão (testada com Nova York).
- **Profissional**: usuário **ativo** com papel Administrador, Tosador ou Veterinário. Atendente não executa serviços.
- **Permissões**: ADMIN e ATTENDANT agendam, reagendam, cancelam e marcam falta. O **profissional do agendamento** pode concluí-lo. Todos os papéis consultam a agenda.
- **Falta** só pode ser marcada **depois** do horário do agendamento. Situações finais (Concluído, Cancelado, Faltou) não mudam mais.
- **Histórico**: cliente ou pet com agendamentos (mesmo cancelados) **não podem ser excluídos** (FK com Restrict); a tela explica o motivo.
- Agendamentos que atravessam a meia-noite aparecem no dia em que **começam**.

## Decisões da Fase 4 (estoque e PDV)
**Estoque**
- O saldo fica no produto e **toda alteração gera uma movimentação** (estoque inicial, entrada, venda, devolução, ajuste): quem, quando, quanto e por quê.
- O saldo **nunca fica negativo**: a condição "saldo suficiente" está no próprio UPDATE do banco (atômico), então baixas simultâneas não passam do zero.
- Produto é **desativado, não excluído** (vendas e movimentações guardam o histórico). Preço maior que zero; nome único por pet shop, sem diferenciar maiúsculas.
- **Estoque baixo** = saldo ≤ mínimo; saldo zero = "Sem estoque". Produtos inativos não entram no alerta.
- Permissões: `catalog` (ADMIN) cadastra, edita, ajusta e desativa; `stock` (ADMIN e ATTENDANT) registra entradas; todos os papéis consultam.

**PDV**
- Uma venda tem **produtos e/ou atendimentos concluídos**. O servidor **copia o preço do cadastro** (snapshot) e ignora qualquer preço vindo da tela; mudar o catálogo depois não altera vendas passadas.
- **Tudo ou nada**: baixa de estoque, número da venda, itens e movimentações acontecem numa única transação. Se o preço mudou, o produto foi desativado ou o estoque acabou entre a tela e a confirmação, a venda é recusada (e nada é gravado).
- Um **atendimento só é cobrado uma vez** enquanto houver venda concluída para ele (trava por atendimento); cancelar a venda o libera. Todos os atendimentos de uma venda são do mesmo cliente.
- **Numeração** própria por pet shop (#1, #2, ...), por contador atualizado na mesma transação.
- Desconto em **valor (R$)**, de 0 até o subtotal. Formas de pagamento: Dinheiro, Pix, Cartão de débito e Cartão de crédito. Limites: 1 a 9999 por item, 50 itens e R$ 999.999,99 por venda.
- **Cancelar** (só ADMIN, com motivo) devolve o estoque, registra "Devolução" e só pode acontecer uma vez.
- `sell` (ADMIN e ATTENDANT) usa o PDV e vê as vendas; **GROOMER e VET não veem as vendas** (dinheiro) mas consultam o estoque.
- Cliente, pet e produto com vendas **não podem ser excluídos** (FK com Restrict). O resumo do dia usa o horário de Brasília.

## Decisões da Fase 4.1 (serviço avulso, devolução/troca, comprovante e nota fiscal)
**Serviço avulso**
- Novo tipo de item de venda: `SERVICE` (serviço do catálogo, sem agendamento), com preço copiado do catálogo (snapshot) e checagem atômica de preço/ativo na gravação. Não mexe no estoque.

**Devolução e troca**
- Devolução **parcial ou total** por item e quantidade. O valor devolvido é o preço dos itens **menos o desconto da venda rateado**; a devolução que fecha a venda acerta os centavos, e a soma nunca passa do total (`src/lib/returns-math.ts`, a mesma conta na tela e no servidor).
- **Troca** = devolução + nova venda na **mesma transação**: o valor devolvido vira crédito na nova venda; sobra → dinheiro de volta; falta → o cliente paga a diferença. Se a nova venda falhar (ex.: sem estoque), a devolução também é desfeita.
- "Devolver ao estoque" é uma escolha (produto avariado não volta). Serviço/atendimento devolvido devolve o valor; atendimento devolvido pode ser cobrado de novo.
- Trava por venda: devolução x devolução x cancelamento x emissão de nota da MESMA venda nunca se intercalam.
- **Venda com devolução não pode ser cancelada**; **venda com nota fiscal ativa não aceita devolução nem cancelamento**; em vendas nascidas de troca, o dinheiro devolvido não passa do que foi pago.
- Permissões: nova ação `return` (ADMIN e ATTENDANT). Cancelar a venda inteira continua só ADMIN.
- Resumo do dia: **líquido** (recebido − devolvido), por forma de pagamento (pode ficar negativo se a devolução saiu por outra forma). Na troca, a parte paga com crédito não conta como dinheiro recebido.
- Numeração própria de devoluções por pet shop.

**Comprovante para impressão**
- `/pdv/vendas/[id]/comprovante` e `/pdv/devolucoes/[id]`: largura de bobina (80 mm), botão Imprimir, e a impressão esconde menus e botões. Mostra os dados da empresa quando cadastrados. Sem nota autorizada, diz "DOCUMENTO SEM VALOR FISCAL".

**Nota fiscal (fundação, NÃO emite nota válida)**
- Dados da empresa em `/configuracoes` (só ADMIN) e dados fiscais em produto (NCM, CFOP, CSOSN, unidade) e serviço (código da LC 116, ISS em centésimos de ponto percentual).
- Produtos → NFC-e; serviços e atendimentos → NFS-e. Validação antes de emitir lista tudo que falta. Ciclo de vida, numeração, cancelamento com justificativa e prazo, trava contra duplicidade.
- Provedor **simulado** (sem validade fiscal, marcado em tudo) e interface `FiscalProvider` para ligar um emissor real. **Leia `docs/FISCAL.md`**: lá está o que falta para emitir de verdade e o que precisa ser validado com o contador.

## Pendências conhecidas do PDV e do estoque
- **Emissão fiscal real** (provedor, certificado, credenciamento, validação do contador), DANFE-NFC-e com QR Code, NF-e, contingência e devolução fiscal. Ver `docs/FISCAL.md`.
- **Pagamento dividido** em mais de uma forma, troco e **abertura/fechamento de caixa**.
- Prazo máximo para devoluções (hoje não há) e vale-troca (crédito que o cliente guarda para usar depois; hoje a troca é na hora).
- Relatórios por período, produto e vendedor.
- Código de barras/SKU, preço de custo e margem, fornecedores, pedidos de compra, lote e validade.
- Estoque negativo é bloqueado; se o pet shop precisar vender "sem saldo", será uma opção futura.

## Pendências conhecidas da agenda
- Visualização semanal/por profissional em colunas e horários livres sugeridos.
- Horário de funcionamento do pet shop e folgas (hoje qualquer horário múltiplo de 5 é aceito).
- O que fazer com agendamentos futuros de um profissional que foi desativado ou saiu de férias (hoje continuam na agenda e podem ser reagendados).
- Lembretes ao cliente (WhatsApp/e-mail) e fuso horário por pet shop.
- Seleção de cliente com busca (hoje é uma lista simples).

## Pendências conhecidas da gestão de equipe
- **Reativação automática ao fim das férias** (rotina agendada).
- Trocar o papel de um usuário, reenviar convite e recuperação de senha.
- A checagem de situação faz uma consulta por requisição; se virar gargalo, trocar por cache curto.
