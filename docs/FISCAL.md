# Nota fiscal: o que está pronto e o que ainda falta

> **Resumo honesto:** hoje o sistema emite notas **SIMULADAS**. Elas servem para testar o fluxo inteiro
> (dados, telas, status, cancelamento), mas **não têm nenhuma validade fiscal**. Para emitir nota de verdade é preciso
> contratar um emissor, ter certificado digital e credenciamento, e validar os parâmetros tributários com o seu contador.

## O que está pronto

| Peça | Onde |
|---|---|
| **Dados da empresa**: razão social, CNPJ (com validação dos dígitos), inscrições estadual e municipal, regime tributário, endereço | `/configuracoes` |
| **Dados fiscais do produto**: NCM, CFOP, CSOSN, unidade | cadastro do produto |
| **Dados fiscais do serviço**: código da LC 116 (ex.: `05.08`) e alíquota do ISS | cadastro do serviço |
| **Montagem dos documentos** a partir da venda: produtos viram **NFC-e**; serviços e atendimentos viram **NFS-e** (documentos separados) | `src/lib/fiscal-builder.ts` |
| **Desconto rateado** entre os itens, com a soma de cada nota exatamente igual ao valor da nota (sem perder centavos) | idem |
| **Validação antes de emitir**: lista de uma vez tudo que falta (empresa, NCM, CFOP, CSOSN, código do serviço, ISS) | idem |
| **Ciclo de vida** da nota: processando → autorizada / rejeitada → cancelada; numeração por tipo; trava contra emissão dupla (duas pessoas clicando ao mesmo tempo) | `src/lib/fiscal-service.ts`, `fiscal-repo.ts` |
| **Cancelamento** com justificativa de 15 a 255 caracteres e dentro de um prazo; só ADMIN | `fiscal-service.ts` |
| **Bloqueios de consistência**: venda com nota autorizada não pode ser cancelada nem ter devolução; venda com devolução não recebe nota automática | `sales-repo.ts`, `returns-repo.ts` |
| **Ponto de integração** com o emissor (`FiscalProvider`) e um **provedor simulado** | `src/lib/fiscal-provider.ts` |
| O comprovante mostra a nota (número, chave) e avisa quando ela é simulada | `/pdv/vendas/[id]/comprovante` |

O provedor simulado gera número, chave e protocolo **fictícios** (prefixo `SIMULADO-` / `SIM-`) e grava o ambiente
como `SIMULATED`. A tela e o comprovante mostram em vermelho: *"SIMULADO — sem validade fiscal"*.

## O que NÃO está pronto (e é necessário para emitir de verdade)

1. **Um emissor.** Contratar um provedor de emissão (existem vários no mercado) ou integrar direto com a SEFAZ do seu
   estado (NFC-e) e com a prefeitura (NFS-e; muitas já usam o padrão nacional). É preciso implementar a interface
   `FiscalProvider` para o provedor escolhido (veja abaixo).
2. **Certificado digital A1** da empresa.
3. **Credenciamento da NFC-e** na SEFAZ do estado (inclui o código de segurança, CSC) e **cadastro/regras da prefeitura** para a NFS-e.
4. **Validação pelo contador** de todos os parâmetros: regime tributário, **NCM, CFOP, CSOSN** de cada produto,
   **código de serviço e alíquota do ISS** de cada serviço, e o **prazo de cancelamento** do seu estado/município.
   Os valores usados nos exemplos e testes deste projeto (CFOP `5102`, CSOSN `102`, serviço `05.08`, ISS `5%`,
   códigos de forma de pagamento, prazo de 30 minutos) são **ilustrativos**: não os use como se fossem a orientação fiscal do seu caso.
5. **Regimes Lucro Presumido e Lucro Real**: a emissão automática ainda os recusa (usam CST em vez de CSOSN e outras regras).
   Só MEI e Simples Nacional são montados.
6. **Devolução fiscal.** Devolver mercadoria de uma venda com nota exige tratamento específico (cancelamento da nota dentro do
   prazo ou nota de devolução). Hoje o sistema **bloqueia** o caso (cancele a nota antes de devolver) em vez de tentar adivinhar.
7. Também não existem: contingência (emissão offline), inutilização de numeração, consulta de status de notas assíncronas,
   envio da nota ao cliente por e-mail, impressão do DANFE-NFC-e com QR Code, e emissão de NF-e (modelo 55).

## Como ligar um provedor real

1. Implemente `FiscalProvider` (`src/lib/fiscal-provider.ts`):
   - `emit(request)`: converta o `FiscalRequest` (emitente, itens com NCM/CFOP/CSOSN ou código de serviço/ISS, pagamentos, total)
     para o formato do provedor, envie e devolva `AUTHORIZED` (número, série, chave, protocolo, data) ou `REJECTED` (motivo);
   - `cancel({ accessKey, reason })`: cancele no provedor e devolva o protocolo;
   - `environment`: `HOMOLOGATION` enquanto estiver testando (sem validade fiscal) e `PRODUCTION` só depois de homologado.
2. Registre-o em `getFiscalProvider` e escolha-o com a variável de ambiente `FISCAL_PROVIDER`
   (hoje só `simulated`; qualquer outro valor é erro de configuração, de propósito: o sistema **nunca** cai no simulado em silêncio).
3. Se o provedor processar de forma assíncrona, o documento já nasce `PROCESSING` no banco (antes de chamar o provedor);
   falta apenas a rotina que consulta o resultado e chama `completeDocument`.
4. **Homologue** (emita notas de teste no ambiente de homologação) antes de ligar a produção.

## Regras do sistema (já testadas)

- Só vendas **concluídas** têm nota. Venda com devolução não recebe nota automática.
- Uma venda mista gera **duas notas** (NFC-e dos produtos, NFS-e dos serviços), cada uma com a própria numeração.
- Nota **rejeitada** pode ser emitida de novo; nota **autorizada** não pode ser duplicada.
- Cancelar nota exige justificativa (15 a 255 caracteres) e respeita o prazo configurado em `FISCAL_CANCEL_WINDOW_MINUTES`
  (`src/lib/fiscal-constants.ts`: **ajuste conforme a regra do seu caso**).
- Quem emite: ADMIN e ATTENDANT. Quem cancela a nota: só ADMIN.
- Cada pet shop só enxerga e só emite as próprias notas (isolamento por tenant).
