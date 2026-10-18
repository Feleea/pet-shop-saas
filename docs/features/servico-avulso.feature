# language: pt
Funcionalidade: Venda de serviço avulso (sem agendamento)
  Como atendente do pet shop
  Quero vender um serviço do catálogo direto no PDV
  Para atender quem chega sem ter agendado

  Cenário: Vender um serviço avulso
    Dado um serviço ativo "Banho" por "R$ 50,00"
    Quando adiciono o serviço ao carrinho, escolho "Pix" e finalizo
    Então a venda mostra o item "Banho" do tipo "Serviço" e total "R$ 50,00"
    E o estoque não é alterado

  Cenário: Quantidade e mistura
    Então posso vender mais de uma unidade do serviço, misturar com produtos e atendimentos agendados,
    E adicionar o mesmo serviço de novo soma na mesma linha

  Cenário: O preço vem do catálogo
    Então o preço é sempre o do cadastro no momento da venda, nunca o que a tela envia

  Cenário: Validações
    Então "Escolha um serviço" e "Quantidade inválida (de 1 a 9999)" aparecem quando faltam dados

  Cenário: Serviço desativado ou alterado
    Então serviço desativado não aparece no PDV
    E se o preço mudar ou o serviço for desativado entre a tela e a confirmação, a venda é recusada

  Cenário: Isolamento entre pet shops
    Então cada pet shop vê só os serviços do próprio catálogo
