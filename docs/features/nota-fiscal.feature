# language: pt
Funcionalidade: Nota fiscal (fundação; provedor simulado)
  Como dono do pet shop
  Quero preparar e emitir notas das vendas
  Para estar pronto quando contratar um emissor

  Cenário: Aviso permanente de simulação
    Então toda nota emitida mostra "SIMULADO — sem validade fiscal"
    E a tela de Configurações informa o provedor em uso

  Cenário: Dados que faltam
    Quando tento emitir sem os dados da empresa ou sem NCM, CFOP, CSOSN, código do serviço ou ISS
    Então vejo a lista completa do que falta e nada é gravado

  Cenário: Emitir a NFC-e dos produtos
    Quando clico em "Emitir nota fiscal" numa venda de produtos
    Então a nota aparece como "Autorizada", com número, chave e protocolo simulados e o valor da venda

  Cenário: Venda mista
    Então produtos geram uma NFC-e e serviços/atendimentos geram uma NFS-e, cada uma com a sua numeração
    E o desconto é rateado entre os itens com a soma exata

  Cenário: Sem duplicidade
    Então uma segunda emissão mostra "Esta venda já possui nota fiscal emitida"
    E nota rejeitada pode ser emitida de novo

  Cenário: Cancelar a nota
    Dado que sou ADMIN
    Então a justificativa precisa ter de 15 a 255 caracteres e o cancelamento respeita o prazo
    E depois de cancelada a venda volta a poder ser cancelada, devolvida ou receber nota nova

  Cenário: Consistência com venda e devolução
    Então venda com nota autorizada não pode ser cancelada nem devolvida
    E venda com devolução não recebe nota automática

  Cenário: Regime tributário
    Então só MEI e Simples Nacional são montados; Lucro Presumido e Lucro Real são recusados com explicação

  Cenário: Permissões e isolamento
    Então ADMIN e ATTENDANT emitem; só o ADMIN cancela
    E cada pet shop só vê e emite as próprias notas
