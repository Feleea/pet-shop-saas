# language: pt
Funcionalidade: Agenda de serviços
  Como atendente do pet shop
  Quero agendar serviços para os pets dos clientes
  Para organizar o dia sem conflito de horários

  Contexto:
    Dado um cliente com pets, um serviço ativo no catálogo e profissionais ativos

  Cenário: Agendar um serviço
    Quando escolho cliente, pet, serviço, profissional, data e horário "10:00"
    Então o agendamento aparece na agenda do dia como "10:00–11:00" (início + duração do serviço)
    E guarda nome, duração e preço do serviço no momento (mudanças no catálogo não o alteram)

  Esquema do Cenário: Conflito do profissional (já existe um agendamento das 10:00 às 11:00)
    Quando tento agendar o mesmo profissional às "<horário>"
    Então o resultado é "<resultado>"

    Exemplos:
      | horário | resultado                                                |
      | 10:00   | recusado: O profissional já tem um agendamento neste horário |
      | 10:30   | recusado: O profissional já tem um agendamento neste horário |
      | 09:30   | recusado (o serviço termina às 10:30)                    |
      | 11:00   | aceito (começa quando o outro termina)                   |
      | 09:00   | aceito (termina quando o outro começa)                   |

  Cenário: Conflito do pet
    Dado que "Thor" tem um agendamento das 10:00 às 11:00 com o profissional A
    Quando tento agendar "Thor" às 10:30 com o profissional B
    Então vejo "O pet já tem um agendamento neste horário"
    Mas outro pet no mesmo horário com o profissional B é aceito

  Cenário: Cancelar libera o horário
    Quando cancelo um agendamento e confirmo
    Então ele passa a "Cancelado" e o horário volta a ficar livre
    Mas um agendamento "Concluído" continua ocupando o horário

  Cenário: Situações finais não mudam
    Dado um agendamento "Cancelado", "Concluído" ou "Faltou"
    Então não é possível reagendar, cancelar, concluir ou marcar falta de novo

  Cenário: Marcar falta
    Quando marco falta antes do horário
    Então vejo "Só é possível marcar falta depois do horário do agendamento"

  Cenário: Reagendar
    Quando mudo data, horário ou profissional
    Então a duração original é mantida
    E reagendar para o próprio horário atual é aceito (não conflita consigo mesmo)
    E um horário ocupado é recusado sem alterar o agendamento

  Esquema do Cenário: Validações
    Quando informo "<campo>" com "<valor>"
    Então vejo "<mensagem>" e os dados digitados continuam no formulário

    Exemplos:
      | campo   | valor      | mensagem                                      |
      | pet     | (vazio)    | Escolha o pet                                 |
      | data    | (vazio)    | Informe a data                                |
      | horário | (vazio)    | Informe o horário                             |
      | horário | 10:03      | O horário deve ser em múltiplos de 5 minutos  |
      | data    | 2000-01-01 | O horário não pode estar no passado           |
      | data    | 2026-02-30 | Data inválida                                 |

  Cenário: Quem pode ser profissional
    Então aparecem apenas usuários ATIVOS com papel Administrador, Tosador ou Veterinário
    E atendentes, usuários inativos e usuários de férias não aparecem
    E serviços desativados não são oferecidos

  Cenário: Permissões
    Então ADMIN e ATTENDANT agendam, reagendam, cancelam e marcam falta
    E o profissional do agendamento pode apenas concluí-lo
    E GROOMER e VET apenas consultam a agenda

  Cenário: O histórico protege cadastros
    Dado um cliente (ou pet) com agendamentos, mesmo cancelados
    Quando tento excluí-lo
    Então vejo "Não é possível excluir: há agendamentos..." e nada é apagado

  Cenário: Fuso horário
    Então os horários são interpretados e exibidos no horário de Brasília

  Cenário: Isolamento entre pet shops
    Dado que a "Loja A" tem um agendamento às 10:00
    Então a "Loja B" não o vê e recebe "404" ao abrir o endereço dele
    E a "Loja B" pode agendar no mesmo horário sem conflito
