# Clave App - Manual de Implantação e Deploy

Esta documentação fornece orientações passo a passo para implantar a plataforma **Clave** em ambientes locais e de produção (Vercel, Docker Standalone e Coolify).

---

## 1. Variáveis de Ambiente Necessárias

Para o funcionamento correto da plataforma, as seguintes variáveis de ambiente devem ser configuradas nos serviços de hospedagem ou no arquivo local `.env.local`:

| Variável | Escopo | Descrição |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend & Backend | URL de API do seu projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend & Backend | Chave pública anônima do Supabase para requisições de cliente. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (Secreto) | Chave administrativa do Supabase (Service Role). **Nunca expor ao cliente.** |
| `GEMINI_API_KEY` | Backend (Secreto) | Chave de API da Google AI Studio para o modelo Gemini. **Nunca expor ao cliente.** |

---

## 2. Deploy na Vercel (Serverless)

A Vercel é a opção mais direta para hospedagem do frontend:
1. Conecte sua conta do GitHub à Vercel.
2. Adicione um novo projeto selecionando o repositório `clave-app`.
3. Configure as variáveis de ambiente descritas acima na seção **Environment Variables**.
4. Clique em **Deploy**. A compilação e otimização Next.js ocorrerão automaticamente.

---

## 3. Deploy com Docker (Modo Standalone)

O projeto possui um arquivo `Dockerfile` otimizado para gerar builds leves usando o recurso de output standalone do Next.js. Ele reduz drasticamente o consumo de disco e RAM ao copiar apenas os arquivos estritamente necessários para a execução em servidor Node.

### O Dockerfile é dividido em 3 estágios:
1.  **Estágio 1 (deps)**: Instala as dependências de produção limpas usando `npm ci`.
2.  **Estágio 2 (builder)**: Copia o código-fonte e compila a aplicação (`npm run build`). Gera o pacote compilado em `.next/standalone`.
3.  **Estágio 3 (runner)**: Prepara uma imagem Alpine Node leve, ajusta permissões de segurança de usuário e expõe a porta `3000`.

### Executando localmente com Docker:
```bash
# Compilar a imagem Docker
docker build -t clave-app:main .

# Rodar o container localmente passando as variáveis de ambiente
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL="https://seu-projeto.supabase.co" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-anon-key" \
  -e GEMINI_API_KEY="sua-gemini-key" \
  clave-app:main
```

---

## 4. Deploy no Coolify (Sua VPS Própria)

O Coolify é uma alternativa open-source excelente para gerenciar seu próprio servidor (VPS). Ele monitora o GitHub e reconstrói as imagens usando o Docker.

### Passos para Configuração no Coolify:
1.  Acesse o painel do Coolify.
2.  Crie um novo **Application** e selecione a fonte como **GitHub Repository**.
3.  Escolha o repositório `belloni123/clave-app` e a branch `main`.
4.  No tipo de build, selecione **Dockerfile** (o Coolify detectará automaticamente o arquivo na raiz do projeto).
5.  Adicione as seguintes variáveis de ambiente na aba **Environment Variables** do Coolify:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `GEMINI_API_KEY`
6.  Defina a porta de destino como `3000`.
7.  Clique em **Deploy**. O Coolify baixará o código, rodará o multi-stage build do Docker e subirá a aplicação em seu domínio personalizado (ex: `https://clave.agenciab16.com.br`).

---

## 5. Script Útil: Promover Usuário a Administrador (Admin)

Para promover qualquer usuário cadastrado à conta administrativa master, use o script local seguro criado na raiz:
```bash
# Na pasta clave-app, execute:
node scratch_make_admin.js seu-email@dominio.com
```
*(Nota: Certifique-se de que a variável `SUPABASE_SERVICE_ROLE_KEY` está devidamente configurada no `.env.local` antes de rodar o comando).*
