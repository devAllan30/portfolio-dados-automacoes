# Gerenciar usuários

A tabela `Usuario` possui somente as colunas `id`, `login`, `senha` e `tipo`.

Tipos permitidos:

- `Admin`: Gerenciador de Eventos e Pesquisa;
- `User`: somente Pesquisa.

O administrador pode cadastrar usuários diretamente pelo botão **+ Novo usuário** na tela `GerenciadorEventos`.

Os comandos SQL abaixo ficam disponíveis como alternativa para manutenção direta no banco.

Criar um usuário:

```sql
INSERT INTO Usuario (login, senha, tipo)
VALUES ('novo.usuario', 'senha-do-usuario', 'User');
```

Alterar senha ou permissão:

```sql
UPDATE Usuario
SET senha = 'nova-senha', tipo = 'Admin'
WHERE login = 'novo.usuario';
```

Desativar o acesso exige remover o usuário:

```sql
DELETE FROM Usuario WHERE login = 'novo.usuario';
```

As senhas são armazenadas em texto puro conforme a definição deste projeto. Restrinja o acesso de leitura ao banco de dados.
