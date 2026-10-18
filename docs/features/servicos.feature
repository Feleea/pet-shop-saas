# language: pt
Funcionalidade: Catálogo de serviços
  Como dono do pet shop
  Quero cadastrar os serviços com duração e preço
  Para que a agenda e as vendas usem sempre os mesmos dados

  Cenário: Cadastrar um serviço
    Dado que sou ADMIN
    Quando informo nome "Banho", duração "60" minutos e preço "50,00"
    Então o serviço aparece na lista como "1h" e "R$ 50,00"

  Esquema do Cenário: Formatos de preço aceitos
    Quando informo o preço "<digitado>"
    Então o valor exibido é "<exibido>"

    Exemplos:
      | digitado   | exibido     |
      | 50         | R$ 50,00    |
      | 50,5       | R$ 50,50    |
      | 50.50      | R$ 50,50    |
      | R$ 1.250,5 | R$ 1.250,50 |
      | 0          | R$ 0,00     |

  Esquema do Cenário: Recusar dados inválidos
    Quando informo "<campo>" com o valor "<valor>"
    Então vejo a mensagem "<mensagem>" e os dados digitados continuam no formulário

    Exemplos:
      | campo   | valor  | mensagem                                |
      | preço   | abc    | Preço inválido                          |
      | preço   | 100000 | O preço máximo é R$ 99.999,99           |
      | duração | 7      | A duração deve ser múltipla de 5 minutos |
      | duração | 0      | A duração mínima é 5 minutos            |
      | duração | 485    | A duração máxima é 8 horas              |

  Cenário: Nome repetido
    Dado que já existe o serviço "Banho"
    Quando tento cadastrar "banho"
    Então vejo "Já existe um serviço com este nome"

  Cenário: Editar sem mudar o nome
    Dado o serviço "Banho"
    Quando salvo a edição mantendo o nome
    Então a edição é aceita

  Cenário: Desativar em vez de excluir
    Dado o serviço "Banho"
    Quando clico em "Desativar"
    Então ele aparece como "Inativo" para o ADMIN
    E deixa de aparecer para os demais papéis
    E o nome "Banho" continua reservado
    E posso "Reativar" quando quiser

  Cenário: Permissões por papel
    Então ADMIN gerencia o catálogo
    E ATTENDANT, GROOMER e VET apenas consultam os serviços ativos

  Cenário: Isolamento entre pet shops
    Dado que a "Loja A" tem o serviço "Banho" por "R$ 50,00"
    Então a "Loja B" não vê esse serviço e recebe "404" ao abrir o endereço dele
    E a "Loja B" pode ter o seu próprio "Banho" com outro preço
