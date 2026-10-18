# language: pt
Funcionalidade: PDV (vendas)
  Como atendente do pet shop
  Quero registrar vendas de produtos e cobrar atendimentos concluídos
  Para controlar o caixa e o estoque sem planilha

  Cenário: Venda simples
    Quando adiciono 2 unidades de "Shampoo" (R$ 30,00), escolho "Pix" e finalizo
    Então vejo o comprovante "Venda #1" com total "R$ 60,00" e situação "Concluída"
    E o estoque do Shampoo cai 2 unidades
    E o histórico do produto mostra "Venda", "-2" e "Venda #1"

  Cenário: O preço vem do cadastro
    Então o preço de cada item é sempre o do cadastro no momento da venda e nunca o que a tela envia

  Cenário: Carrinho ao vivo
    Quando altero quantidades, adiciono o mesmo produto de novo ou removo um item
    Então subtotal, desconto e total são recalculados na hora
    E adicionar o mesmo produto soma na mesma linha

  Esquema do Cenário: Desconto
    Dado um subtotal de R$ 60,00
    Quando informo o desconto "<desconto>"
    Então o resultado é "<resultado>"

    Exemplos:
      | desconto | resultado                                                   |
      | 5,00     | total R$ 55,00                                              |
      | R$ 5     | total R$ 55,00                                              |
      | 60       | total R$ 0,00 (cortesia)                                    |
      | 60,01    | O desconto não pode ser maior que o total da venda          |
      | abc      | Desconto inválido                                           |

  Cenário: Validações
    Então "Adicione ao menos um item", "Escolha a forma de pagamento" e "Quantidade inválida (de 1 a 9999)" são exibidos quando faltam dados

  Cenário: Estoque insuficiente
    Dado que a "Ração" tem 3 unidades
    Quando tento vender 5
    Então vejo "Estoque insuficiente para Ração (disponível: 3)"
    E o carrinho continua na tela e nada foi baixado
    E depois de corrigir para 3, a venda é aceita e o saldo vai a zero

  Cenário: Tudo ou nada
    Dado uma venda com dois produtos, sendo que o segundo não tem estoque
    Então nenhum estoque é baixado, nenhuma venda é gravada e o número da venda não é gasto

  Cenário: Produto desativado ou com preço alterado
    Então produto desativado não aparece no PDV
    E se o preço mudar entre a tela e a confirmação, a venda é recusada em vez de usar o preço velho

  Cenário: Cobrar um atendimento concluído
    Dado um atendimento "Concluído" na agenda
    Quando clico em "Cobrar"
    Então o PDV abre com o atendimento no carrinho, pelo preço do agendamento, e o cliente fica fixo
    E posso adicionar produtos na mesma venda
    E o atendimento deixa de ser oferecido e uma nova tentativa mostra "Este atendimento já foi cobrado ou não está concluído"

  Cenário: Regras dos atendimentos na venda
    Então atendimentos de clientes diferentes não cabem na mesma venda
    E o mesmo atendimento não pode aparecer duas vezes
    E atendimento de outro pet shop se comporta como inexistente

  Cenário: Cancelar uma venda
    Dado que sou ADMIN
    Quando informo o motivo "Cliente desistiu" e confirmo
    Então a venda passa a "Cancelada", o estoque é devolvido ("Devolução", "+2") e os atendimentos podem ser cobrados de novo
    Mas sem motivo o cancelamento é recusado
    E uma venda já cancelada não pode ser cancelada de novo (o estoque não volta em dobro)

  Cenário: Resumo do dia
    Dado vendas em Pix (R$ 60,00), Dinheiro (R$ 30,00) e Crédito (R$ 30,00)
    Então "Total vendido" mostra R$ 120,00 e cada forma de pagamento mostra o seu valor
    E vendas canceladas aparecem na lista mas não entram nos totais
    E o dia é o dia local do pet shop (horário de Brasília)

  Cenário: Permissões
    Então ADMIN e ATTENDANT vendem e veem as vendas
    E só o ADMIN cancela
    E GROOMER e VET não veem o PDV nem as vendas (o atalho some e as páginas voltam ao painel)

  Cenário: O histórico protege cadastros
    Dado um cliente com vendas
    Quando tento excluí-lo
    Então vejo "Não é possível excluir..." e nada é apagado

  Cenário: Isolamento entre pet shops
    Então cada pet shop vê só as suas vendas e tem numeração própria (ambos começam em #1)
    E um id de venda de outro pet shop responde "404"
