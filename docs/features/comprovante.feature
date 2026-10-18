# language: pt
Funcionalidade: Comprovante para impressão
  Como atendente do pet shop
  Quero imprimir o comprovante da venda ou da devolução
  Para entregar ao cliente

  Cenário: Comprovante da venda
    Então vejo os dados da empresa (razão social, CNPJ, endereço, telefone), número e data da venda, vendedor, cliente,
    os itens, subtotal, desconto, total e a forma de pagamento
    E o aviso "DOCUMENTO SEM VALOR FISCAL" quando não há nota autorizada

  Cenário: Sem dados da empresa
    Então o comprovante mostra apenas o nome do pet shop

  Cenário: Impressão
    Quando clico em "Imprimir"
    Então o navegador abre a impressão
    E na impressão somem botões e links, ficando só o comprovante em largura de bobina (80 mm)

  Cenário: Casos especiais
    Então venda cancelada mostra "VENDA CANCELADA"
    E devoluções da venda aparecem listadas
    E vendas de troca mostram o crédito aplicado e o valor efetivamente pago

  Cenário: Nota fiscal no comprovante
    Dado uma nota autorizada
    Então o comprovante mostra tipo, número, série e chave
    E, se for nota simulada, o aviso "SIMULADO — sem validade fiscal"

  Cenário: Comprovante de devolução ou troca
    Então mostra o número, a venda de origem, o motivo, os itens devolvidos, o valor, o crédito usado e o dinheiro devolvido

  Cenário: Isolamento
    Então o comprovante de outro pet shop responde "404"
