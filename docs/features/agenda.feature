# language: pt
Funcionalidade: Agenda de serviços
  Como atendente do pet shop
  Quero agendar serviços para os pets dos clientes
  Para organizar o dia sem conflito de horários

  Cenário: Agendar um banho em horário livre
    Dado que o profissional "Ana" não tem agendamentos às 10:00
    Quando eu agendo um "Banho" para o pet "Thor" às 10:00 com "Ana"
    Então o agendamento é criado com status "AGENDADO"

  Cenário: Impedir conflito de horário do mesmo profissional
    Dado que "Ana" já tem um agendamento das 10:00 às 11:00
    Quando eu tento agendar outro serviço com "Ana" às 10:30
    Então o sistema recusa o agendamento
    E exibe a mensagem "Horário indisponível para este profissional"

  Cenário: Permitir agendamento logo após outro terminar
    Dado que "Ana" já tem um agendamento das 10:00 às 11:00
    Quando eu agendo outro serviço com "Ana" às 11:00
    Então o agendamento é criado com sucesso
