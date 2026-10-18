# language: pt
Funcionalidade: Dados da empresa
  Como dono do pet shop
  Quero cadastrar os dados da empresa
  Para que apareçam no comprovante e sirvam à nota fiscal

  Cenário: Salvar
    Então CNPJ, CEP e telefone são guardados só com dígitos e exibidos com máscara
    E a UF é validada e o regime tributário é escolhido numa lista

  Esquema do Cenário: Validações
    Quando informo "<campo>" com "<valor>"
    Então vejo "<mensagem>" e o que foi digitado continua no formulário

    Exemplos:
      | campo              | valor               | mensagem                        |
      | CNPJ               | 11.222.333/0001-82  | CNPJ inválido                   |
      | CEP                | 123                 | CEP inválido                    |
      | Telefone           | 123                 | Telefone inválido               |
      | Inscrição estadual | 12 34!              | Inscrição estadual inválida     |

  Cenário: Limpar um campo
    Então esvaziar um campo apaga o valor

  Cenário: Permissões e isolamento
    Então só o ADMIN acessa e vê o atalho "Configurações"
    E cada pet shop tem os seus próprios dados
