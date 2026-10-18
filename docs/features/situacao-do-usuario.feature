# language: pt
Funcionalidade: Situação do usuário (ativo, inativo, férias)
  Como dono do pet shop
  Quero ativar, desativar ou colocar de férias os usuários da equipe
  Para controlar quem pode acessar o sistema sem apagar o histórico

  Cenário: Desativar um usuário
    Dado que sou ADMIN e a pessoa "Carla" está ativa
    Quando clico em "Desativar" na linha dela
    Então a situação dela passa a "Inativo"

  Cenário: A desativação vale na hora, inclusive para quem já está logado
    Dado que a "Carla" está com o sistema aberto
    Quando o ADMIN a desativa
    Então no próximo clique ela é levada para o login

  Cenário: Login de usuário desativado
    Dado que a "Carla" está inativa
    Quando ela informa o código, o e-mail e a senha corretos
    Então vê "Acesso desativado. Fale com o administrador do pet shop."
    Mas com a senha errada vê apenas "Credenciais inválidas"

  Cenário: Colocar de férias
    Quando o ADMIN informa "10" em "Dias de férias" e clica em "Colocar de férias"
    Então a situação passa a "Férias (volta em dd/mm/aaaa)", 10 dias a partir de agora
    E o acesso fica bloqueado
    E ao tentar entrar a pessoa vê "Seu acesso está suspenso (férias). Fale com o administrador do pet shop."

  Cenário: Atualizar as férias
    Dado que a pessoa está de férias
    Quando o ADMIN informa outra quantidade de dias e clica em "Atualizar férias"
    Então a data prevista de retorno é recalculada a partir de agora

  Esquema do Cenário: Dias de férias inválidos
    Quando informo "<dias>" em "Dias de férias"
    Então vejo "Informe quantos dias de férias (de 1 a 365)" e nada muda

    Exemplos:
      | dias |
      |      |
      | 0    |
      | 366  |
      | abc  |
      | 7.5  |

  Cenário: Ativar (inclusive encerrar as férias antes do prazo)
    Dado que a pessoa está inativa ou de férias
    Quando o ADMIN clica em "Ativar"
    Então ela volta a entrar normalmente e a data de retorno é apagada

  Cenário: Reativação automática ao fim das férias
    # Será desenvolvida em outro momento. Por ora a data de retorno fica gravada
    # e o ADMIN reativa manualmente.

  Cenário: Travas de segurança
    Então o administrador não tem controles de situação
    E ninguém pode alterar a própria situação
    E o administrador não pode ser desativado

  Cenário: Apenas ADMIN altera situações
    Então ATTENDANT, GROOMER e VET não conseguem alterar a situação de ninguém

  Cenário: Isolamento entre pet shops
    Dado que a mesma pessoa tem acesso à "Loja A" e à "Loja B" com o mesmo e-mail
    Quando o ADMIN da "Loja A" a desativa
    Então ela perde o acesso à "Loja A" e continua com acesso à "Loja B"
