# language: pt
Funcionalidade: Cadastro e autenticação
  Como dono de pet shop
  Quero criar minha conta e entrar no sistema
  Para acessar a gestão do meu negócio

  Cenário: Cadastrar um novo pet shop
    Dado que estou na página de cadastro
    Quando informo nome do pet shop, meu nome, e-mail e uma senha de 8 ou mais caracteres
    Então o pet shop é criado com o meu usuário como ADMIN
    E sou levado ao painel já autenticado

  Cenário: Recusar senha curta
    Quando tento cadastrar com uma senha de menos de 8 caracteres
    Então vejo a mensagem "A senha deve ter ao menos 8 caracteres"

  Cenário: Entrar com credenciais válidas
    Dado que tenho um pet shop cadastrado
    Quando informo código do pet shop, e-mail e senha corretos
    Então sou levado ao painel

  Cenário: Credenciais inválidas não revelam o motivo
    Quando informo uma senha errada ou um e-mail inexistente
    Então vejo a mensagem "Credenciais inválidas" nos dois casos

  Cenário: Painel exige login
    Dado que não estou autenticado
    Quando acesso "/painel"
    Então sou redirecionado para "/login"

  Cenário: Sair encerra a sessão
    Dado que estou autenticado
    Quando clico em "Sair"
    Então volto para "/login" e não consigo mais acessar "/painel"
