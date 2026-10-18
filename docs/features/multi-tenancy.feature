# language: pt
Funcionalidade: Isolamento entre pet shops
  Como cliente do SaaS
  Quero que meus dados fiquem separados dos de outros pet shops
  Para que ninguém acesse informações do meu negócio

  Cenário: Mesmo e-mail em pet shops diferentes
    Dado que "Loja A" e "Loja B" cadastraram usuários com o mesmo e-mail
    Quando cada um entra com o seu código de pet shop e a sua senha
    Então cada um vê apenas o nome e os dados do seu próprio pet shop

  Cenário: Senha de uma loja não abre outra
    Dado que "Loja A" e "Loja B" usam o mesmo e-mail com senhas diferentes
    Quando tento entrar na "Loja B" com a senha da "Loja A"
    Então o acesso é recusado

  Cenário: Consultas de negócio sempre filtram pelo tenant da sessão
    Dado qualquer consulta a dados de negócio
    Então o filtro por tenantId vem da sessão e não pode ser sobrescrito pela entrada do usuário
