# language: pt
Funcionalidade: Clientes e pets
  Como atendente do pet shop
  Quero cadastrar tutores e seus pets
  Para ter o histórico de cada animal à mão no atendimento

  Contexto:
    Dado que estou autenticado como ADMIN ou ATTENDANT

  Cenário: Cadastrar um cliente
    Quando informo apenas o nome "Carlos Silva"
    Então o cliente é criado e vejo a página dele

  Cenário: Telefone guardado só com dígitos e exibido formatado
    Quando informo o telefone "(71) 99123-4567"
    Então a página do cliente mostra "(71) 99123-4567"

  Cenário: Recusar telefone inválido
    Quando informo o telefone "123"
    Então vejo "Telefone inválido" e os dados digitados continuam no formulário

  Cenário: Adicionar um pet a um cliente
    Dado um cliente cadastrado
    Quando adiciono o pet "Thor", espécie "Cachorro", raça "Labrador", porte "Grande"
    Então o pet aparece na lista do cliente
    E a listagem de clientes mostra "1" na coluna de pets

  Cenário: Recusar data de nascimento no futuro
    Quando informo a data de nascimento "2999-01-01"
    Então vejo "A data de nascimento não pode ser no futuro" e o pet não é criado

  Cenário: Idade do pet calculada pela data de nascimento
    Dado um pet nascido há 3 anos e 3 meses
    Então a idade exibida é "3 anos e 3 meses"

  Cenário: Buscar cliente por nome
    Dado os clientes "Ana Souza" e "Bruno Lima"
    Quando busco por "ana"
    Então vejo apenas "Ana Souza"

  Cenário: Limpar um campo na edição
    Dado um cliente com telefone
    Quando apago o telefone e salvo
    Então o cliente passa a aparecer como "Sem telefone"

  Cenário: Excluir cliente pede confirmação e remove os pets
    Quando clico em "Excluir cliente" e confirmo
    Então o cliente e os pets dele deixam de existir
    Mas se eu cancelar a confirmação, nada é excluído

  Cenário: Permissões por papel
    Então ADMIN pode ler, criar, editar e excluir
    E ATTENDANT pode ler, criar e editar, mas não excluir
    E GROOMER e VET podem apenas ler

  Cenário: Isolamento entre pet shops
    Dado que a "Loja A" tem o cliente "Cliente Secreto" com o pet "Rex"
    Quando um usuário da "Loja B" lista, busca ou abre por URL esse cliente ou pet
    Então não vê nada na listagem e recebe "404" no acesso direto
