# language: pt
Funcionalidade: Devolução e troca parcial
  Como atendente do pet shop
  Quero devolver parte de uma venda ou trocar itens
  Para corrigir vendas sem cancelar tudo

  Cenário: Devolução parcial
    Dado uma venda de 4 unidades de "Shampoo" (R$ 30,00 cada) em Pix
    Quando devolvo 1 unidade com o motivo "Embalagem danificada"
    Então o comprovante mostra "VALOR DEVOLVIDO R$ 30,00" e "Devolvido em Pix"
    E o estoque do Shampoo sobe 1 unidade
    E a venda mostra o item com "Devolvido 1" e a devolução "#1"

  Cenário: Produto avariado
    Quando desmarco "Devolver os produtos ao estoque"
    Então o dinheiro é devolvido e o estoque NÃO muda, e o comprovante avisa "não voltou ao estoque"

  Cenário: Desconto rateado
    Dado uma venda de 2 unidades com R$ 6,00 de desconto (total R$ 54,00)
    Então cada unidade devolvida vale R$ 27,00 e, na última devolução, os centavos restantes são acertados
    E a soma das devoluções nunca passa do total da venda

  Cenário: Limites
    Então a quantidade a devolver é limitada ao que ainda não foi devolvido
    E depois de devolver tudo o atalho "Registrar devolução ou troca" some
    E "Escolha ao menos um item para devolver" e "Informe o motivo da devolução" são exigidos

  Cenário: Devolver serviço ou atendimento
    Então devolver um serviço devolve o valor sem mexer no estoque
    E devolver um atendimento cobrado o libera para ser cobrado de novo

  Cenário: Troca por algo mais caro
    Dado uma devolução de R$ 30,00
    Quando troco por "Ração" (R$ 120,00)
    Então o crédito aplicado é R$ 30,00 e o cliente paga a diferença de R$ 90,00 na forma escolhida
    E nasce uma nova venda (#2) ligada à devolução, com o crédito de troca registrado

  Cenário: Troca por algo mais barato
    Dado uma devolução de R$ 120,00 trocada por "Shampoo" (R$ 30,00)
    Então R$ 90,00 voltam ao cliente na forma escolhida

  Cenário: Tudo ou nada
    Dado uma troca cujo item novo não tem estoque
    Então a devolução também não acontece (estoque, quantidades e números intactos)

  Cenário: Proteções
    Então vendas canceladas não aceitam devolução
    E venda com devolução não pode ser cancelada (o estoque não volta em dobro)
    E venda com nota fiscal autorizada não aceita devolução até a nota ser cancelada
    E em vendas nascidas de troca, o dinheiro devolvido nunca passa do que foi efetivamente pago

  Cenário: Resumo do dia
    Dado uma venda de R$ 60,00 em Pix e uma devolução de R$ 30,00 em Dinheiro
    Então o total do dia é R$ 30,00, o Pix mostra R$ 60,00 e o Dinheiro mostra -R$ 30,00

  Cenário: Permissões e isolamento
    Então ADMIN e ATTENDANT devolvem; GROOMER e VET não
    E cada pet shop numera as próprias devoluções e só vê as próprias (404 para ids de outro)
