# language: pt
Funcionalidade: Estoque
  Como dono do pet shop
  Quero cadastrar produtos e controlar o saldo
  Para saber o que tenho e ser avisado antes de acabar

  Cenário: Cadastrar um produto com estoque inicial
    Dado que sou ADMIN
    Quando informo nome "Shampoo", preço "30,00", estoque mínimo "5" e estoque inicial "10"
    Então o produto aparece na lista com saldo 10 e situação "Normal"
    E o histórico mostra uma movimentação "Estoque inicial" de +10

  Esquema do Cenário: Validações do cadastro
    Quando informo "<campo>" com "<valor>"
    Então vejo "<mensagem>" e o que foi digitado continua no formulário

    Exemplos:
      | campo          | valor  | mensagem                                                      |
      | preço          | abc    | Preço inválido                                                |
      | preço          | 0      | O preço deve ser maior que zero                               |
      | preço          | 100000 | O preço máximo é R$ 99.999,99                                 |
      | estoque inicial| abc    | Informe o estoque inicial (número inteiro, de 0 a 999999)     |
      | estoque mínimo | -1     | Informe o estoque mínimo (número inteiro, de 0 a 99999)       |

  Cenário: Nome de produto repetido
    Dado que existe o produto "Shampoo"
    Quando cadastro "shampoo"
    Então vejo "Já existe um produto com este nome"
    Mas outro pet shop pode ter o seu próprio "Shampoo"

  Cenário: Entrada de estoque
    Quando registro a entrada de 7 unidades com a observação "Fornecedor X"
    Então o saldo aumenta em 7 e o histórico mostra "Entrada", "+7", a observação e quem registrou

  Cenário: Ajuste de estoque
    Quando o ADMIN registra o ajuste "-3" com o motivo "Embalagem rasgada"
    Então o saldo diminui em 3 e o motivo fica no histórico
    Mas um ajuste que deixaria o saldo negativo é recusado: "O ajuste deixaria o estoque negativo"
    E o ajuste exige motivo e não pode ser zero

  Esquema do Cenário: Situação do estoque
    Dado um produto com saldo <saldo> e mínimo <mínimo>
    Então a situação é "<situação>"

    Exemplos:
      | saldo | mínimo | situação      |
      | 0     | 5      | Sem estoque   |
      | 3     | 5      | Estoque baixo |
      | 5     | 5      | Estoque baixo |
      | 6     | 5      | Normal        |
      | 1     | 0      | Normal        |

  Cenário: Alerta e filtro de estoque baixo
    Dado produtos com estoque baixo ou zerado
    Então a lista mostra "N produtos com estoque baixo ou zerado"
    E o filtro "Somente estoque baixo" mostra só esses produtos
    E produtos inativos não entram no alerta

  Cenário: Desativar em vez de excluir
    Quando desativo um produto
    Então ele some do PDV, aparece como "Inativo" para o ADMIN e o histórico é preservado

  Cenário: Permissões
    Então ADMIN cadastra, edita, ajusta e desativa
    E ATTENDANT apenas registra entradas
    E GROOMER e VET apenas consultam

  Cenário: Isolamento entre pet shops
    Então cada pet shop vê só os próprios produtos e movimentações, com "404" para ids de outro
