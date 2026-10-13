# language: pt
Funcionalidade: Equipe e convites
  Como dono do pet shop
  Quero convidar atendentes, tosadores e veterinários
  Para que cada pessoa tenha o seu próprio acesso, sem eu saber a senha de ninguém

  Cenário: Convidar um usuário
    Dado que sou ADMIN
    Quando informo nome, e-mail e papel (Atendente, Tosador ou Veterinário)
    Então vejo um link de convite, exibido uma única vez
    E o convite aparece em "Convites pendentes" com a data de expiração (7 dias)

  Cenário: Aceitar o convite
    Dado que recebi o link de convite
    Quando escolho uma senha de 8 ou mais caracteres e confirmo
    Então sou levado ao painel do pet shop, já autenticado, com o papel convidado
    E o convite deixa de estar pendente
    E depois posso entrar pelo login normal com o código do pet shop, o e-mail e a senha

  Cenário: O link só funciona uma vez
    Dado que o convite já foi aceito
    Quando alguém abre o mesmo link
    Então vê "Convite inválido ou expirado"

  Cenário: Convite revogado ou expirado
    Quando o ADMIN revoga o convite, ou 7 dias se passam
    Então o link mostra "Convite inválido ou expirado"
    E a mensagem é a mesma de um link que nunca existiu

  Cenário: Recusar e-mail já cadastrado
    Quando convido um e-mail que já é usuário do pet shop (maiúsculas não importam)
    Então vejo "Já existe um usuário com este e-mail"

  Cenário: Recusar convite pendente repetido
    Dado que existe um convite pendente para "carla@mail.com"
    Quando convido "carla@mail.com" de novo
    Então vejo "Já existe um convite pendente para este e-mail"
    Mas depois de revogar ou expirar, posso convidar de novo

  Cenário: Recusar senha inválida ao aceitar
    Quando informo uma senha curta ou confirmações diferentes
    Então vejo "A senha deve ter ao menos 8 caracteres" ou "As senhas não conferem"
    E o convite continua válido

  Cenário: Administrador não é convidável
    Então os papéis oferecidos são apenas Atendente, Tosador e Veterinário

  Cenário: Só o ADMIN gerencia a equipe
    Dado um usuário ATTENDANT, GROOMER ou VET
    Então ele não vê o atalho "Equipe"
    E ao abrir "/equipe" é levado de volta ao painel

  Cenário: Isolamento entre pet shops
    Dado que a "Loja A" e a "Loja B" convidam o mesmo e-mail
    Então não há conflito entre elas
    E cada ADMIN vê apenas os convites do próprio pet shop
    E cada link leva ao pet shop e ao papel corretos
