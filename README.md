# Estude OAB

Plataforma de estudos para o Exame da OAB com banco de questões, simulados e estatísticas de desempenho.

## Estrutura do projeto

```
EstudeOAB/
├── frontend/          # Interface React (servida pelo Nginx)
│   ├── index.html
│   ├── app.jsx        # Roteamento principal
│   ├── auth.jsx       # Splash + cadastro
│   ├── shell.jsx      # Layout autenticado + dashboard
│   ├── practice.jsx   # Sessão de questões
│   ├── stats.jsx      # Estatísticas
│   ├── admin.jsx      # Painel de importação de questões
│   ├── data.js        # Dados mock para protótipo
│   └── *.css
├── backend/           # API Node.js / Express
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   └── routes/questions.js
│   └── Dockerfile
├── database/
│   └── schema.sql     # DDL aplicado automaticamente
├── nginx/
│   └── nginx.conf
└── docker-compose.yml
```

## Subir o ambiente completo

### Pré-requisito
- Docker e Docker Compose instalados

### Comando único

```bash
docker compose up --build
```

Aguarde ~30 segundos na primeira vez (download das imagens + init do banco).

| Serviço    | URL                       |
|------------|---------------------------|
| Frontend   | http://localhost:3000      |
| Backend    | http://localhost:3001/api  |
| PostgreSQL | localhost:5432             |

---

## Importar questões via CSV

1. Acesse **http://localhost:3000**
2. Entre no app (qualquer login de demonstração)
3. No menu lateral, clique em **⚙ Admin**
4. Selecione a aba **↑ Importar CSV**
5. Arraste ou selecione o arquivo `.csv`
6. Revise a pré-visualização e clique em **Enviar questões para o banco**

### Formato do CSV

Separador: `;` (ponto e vírgula)  
Encoding: UTF-8  
Primeira linha: cabeçalho com os nomes exatos das colunas

```
id;banca;prova;edicao;ano;data_aplicacao;tipo_prova;numero_questao;enunciado;comando;alternativa_a;alternativa_b;alternativa_c;alternativa_d;gabarito;area_direito;materia;tema;subtema;legislacao_ref;dificuldade;observacoes
```

- **id** — identificador único da questão (usado para upsert: se já existir, atualiza)
- **gabarito** — letra da alternativa correta: `A`, `B`, `C` ou `D`
- **dificuldade** — `baixa`, `média` ou `alta`
- Campos em branco são aceitos

---

## API REST

| Método | Rota                       | Descrição                    |
|--------|----------------------------|------------------------------|
| GET    | `/api/health`              | Status da API e banco        |
| GET    | `/api/questions`           | Listar questões (paginado)   |
| GET    | `/api/questions/stats`     | Estatísticas agregadas       |
| POST   | `/api/questions/upload`    | Upload de CSV (multipart)    |

### Filtros disponíveis em `GET /api/questions`

```
?area=Direito+Civil&banca=FGV&dificuldade=média&limit=50&offset=0
```

---

## Desenvolvimento local (sem Docker)

### Backend

```bash
cd backend
npm install
DATABASE_URL=postgres://estudeoab:estudeoab_pass@localhost:5432/estudeoab npm run dev
```

### Frontend

Abra `frontend/index.html` diretamente no navegador (ou use um servidor estático como `npx serve frontend`).

---

## Banco de dados

O schema é criado automaticamente no primeiro `docker compose up`.  
Para reiniciar o banco do zero:

```bash
docker compose down -v   # remove o volume postgres_data
docker compose up --build
```
