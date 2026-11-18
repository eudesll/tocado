# Repertório — Suas músicas, primeiro

Aplicação web **sem dependências externas** focada no **repertório em si**: uma lista
simples de músicas, cantores, gêneros, tons e durações. O sistema de revisões espaçadas
existe, mas fica em segundo plano, acessível pela aba discreta "Revisões".
Os dados são persistidos no `localStorage` do próprio navegador.

O campo de cantor no cadastro de música é um **autocomplete** (digite o nome e escolha
uma sugestão) e o cabeçalho tem um botão para alternar entre **tema claro e noturno**.
Sem escolha manual, o tema inicial segue a preferência do sistema (`prefers-color-scheme`),
acompanhando mudanças automáticas do SO. Há ainda um **calendário de atividade** estilo
GitHub que ocupa a largura toda, com divisão por mês e tooltip listando as músicas
praticadas/adicionadas em cada dia — presente no Resumo e, em seção expansível, no
resumo de cada música (ordem: Informações → Atividade → Letra → Vídeos).

## Como executar

Abra o arquivo `index.html` em um navegador moderno (Chrome, Edge, Firefox).
Não é necessário instalar nada nem iniciar servidor.

> A busca automática de fotos, gêneros, tons e durações usa APIs públicas e precisa de
> internet. As fotos já salvas continuam aparecendo normalmente offline (estão em
> base64 no seu navegador).

## Estrutura

```
.
├── index.html                  # Estrutura da SPA (cabeçalho, modal, toast)
├── css/styles.css              # Tema, layout responsivo e componentes
├── js/
│   ├── storage.js              # Persistência (localStorage) e IDs
│   ├── spaced-repetition.js    # Motor SM-2: agendamento, domínio, formatação
│   ├── artist-photo.js         # Busca (Wikipédia/Apple Music) e compactação da foto
│   ├── youtube.js              # Links, validação e metadados de vídeos (noembed)
│   ├── song-key.js             # Busca do preview e estimativa do tom (Web Audio)
│   └── app.js                  # Controlador: telas, formulários e fluxo de prática
└── README.md                   # Esta documentação
```

## Funcionalidades implementadas

- **Cadastro de cantores** — nome, gênero e observações; edição e exclusão (com aviso
  de músicas que ficarão sem vínculo).
- **Cadastro do artista com preenchimento automático** — o único campo editável é o
  **nome**. Enquanto ele é digitado (debounce de 600 ms), o sistema consulta a
  **Wikipédia** (pt → en) para obter **foto e biografia curta**, e a **Apple Music**
  para obter o **gênero musical**. Os campos de gênero e biografia aparecem como
  somente leitura, marcados como "automático", e são salvos junto do cantor.
  A foto é compactada em um quadrado de 256 px em JPEG e **armazenada em base64** no
  `localStorage`. O formulário não tem botões de imagem: a prévia e o preenchimento são
  automáticos. Se nada for encontrado, o card exibe **"Foto não encontrada"** com o
  botão **"Tentar foto"**. Se a imagem não puder ser embutida, a URL remota é o fallback. Clicar no card do cantor abre a listagem de músicas já filtrada por ele.
- **Cadastro de músicas** — título, cantor, gênero, dificuldade (1–5) e duração. Os campos
  de trechos, vídeos e observações foram removidos do formulário, mas os dados de músicas
  já cadastradas continuam preservados e exibidos. Ao escolher o cantor, o **gênero musical é preenchido
  automaticamente** com o estilo cadastrado nele. Se o nome digitado não existir, o
  autocomplete oferece **+ Cadastrar "nome"**: o cantor é criado diretamente, sem abrir
  o popup, com foto/gênero/biografia buscados em segundo plano e já selecionado no
  formulário. A **duração** e o **tom da música** são pesquisados na internet **somente
  quando um cantor é atribuído** (o nome dele entra na consulta, aumentando a precisão):
  buscamos o preview oficial no Deezer/Apple Music, analisamos o áudio com Web Audio e
  estimamos a tonalidade pelo método de **Krumhansl-Schmuckler**, exibindo-a como
  estimativa (ex.: `Am · Lá menor`). Não existe banco de tons gratuito com API aberta,
  por isso o resultado é identificado como estimativa.
- **Vídeos do YouTube** — ao salvar uma música, o sistema gera automaticamente um link
  de busca (`título + cantor`). Músicas com vídeos exibem um ícone ▶ ao lado do nome na
  lista. Clicar no nome abre a **tela de resumo da música**, com mini player do YouTube
  na própria página quando a página é servida por http(s) (oculto quando não há vídeos;
  em `file://` é mostrado um poster com link direto, pois o YouTube rejeita embeds sem
  `Referer`), seletor dos vídeos anexados, metadados
  e o link de busca. A **letra da música** é carregada automaticamente no cadastro via
  LRCLIB (com fallback para lyrics.ovh) e exibida em uma seção própria no resumo.
  O botão **Vídeos** abre a galeria para adicionar/remover links.
- **Listagem tabular do repertório** — tabela com Música, Cantor, Gênero, Tom, Duração e
  Revisão e Adicionada em (data/hora do cadastro). Cabeçalhos clicáveis ordenam por
  qualquer coluna (clique de novo inverte a ordem). Um contador mostra quantas músicas
  estão sendo exibidas e o total. Filtros combináveis: busca por texto, cantor, gênero
  e "só revisões pendentes".
- **Dados de teste** — o botão em **Dados → Dados de teste (debug)** adiciona 3 cantores
  e 4 músicas de exemplo (com letra, tom, vídeos e uma revisão já em dia) para testar a
  interface sem apagar os dados existentes.

> **Nota sobre o YouTube:** a API oficial exige chave e não existe endpoint de busca
> público com CORS confiável para uma página aberta via `file://`. Por isso o sistema
> gera o link de pesquisa automaticamente e permite anexar vídeos específicos, cujos
> metadados são obtidos pelo serviço público `noembed.com`.
- **Painel (dashboard)** — totais, revisões pendentes, domínio médio, streak de dias
  consecutivos e histórico das últimas sessões.
- **Prática guiada** — o usuário avalia cada trecho de 0 (esqueci) a 5 (perfeito);
  o sistema calcula a nota média, aplica o SM-2, registra a sessão e mostra:
  próxima revisão, novo intervalo, domínio estimado, evolução do fator de facilidade,
  lapses e a lista de **trechos fracos** para foco na próxima sessão.
- **Backup** — exportação e importação de dados em JSON e redefinição completa.

## Método científico adotado e justificativa

O sistema combina duas linhas de evidência complementares:

### 1. Repetição espaçada (quando praticar)

- **Ebbinghaus (1885)** descreveu a *curva do esquecimento*: sem revisão, a retenção
  cai rapidamente. Revisões **distribuídas no tempo** produzem retenção muito superior
  às revisões em bloco (*massed practice*).
- **Roediger & Karpicke (2006)** mostraram o *efeito do teste*: recuperar ativamente
  a informação da memória é mais eficaz que apenas reler. Cada sessão deste sistema é
  um teste de recuperação — o usuário executa/canta sem consultar e atribui uma nota.

### 2. Algoritmo SM-2 (Wozniak / SuperMemo)

Cada música possui um cartão com:

| Campo | Significado |
|-------|-------------|
| `ease` | Fator de facilidade (começa em 2,5; mínimo 1,3) |
| `interval` | Intervalo atual em dias |
| `repetitions` | Acerto consecutivos |
| `due` | Dia da próxima revisão |
| `lapses` | Quantidade de notas < 3 |
| `history` | Histórico de avaliações |

Regras aplicadas a cada nota `q` (0–5):

```
EF' = EF + [0,1 − (5−q)(0,08 + (5−q)·0,02)]      (mínimo 1,3)

q ≥ 3  →  repetitions = 0 ? 1 dia
          repetitions = 1 ? 6 dias
          senão         ? arredonda(intervalo × EF)

q < 3  →  repetitions = 0, intervalo = 1 dia, lapses += 1
```

Esse é o mesmo princípio usado por Anki/SuperMemo: revisões que vão bem são
progressivamente afastadas; erros trazem a música de volta rapidamente.

### 3. Prática deliberada (o que praticar dentro da sessão)

**Ericsson** mostrou que a melhoria não vem de repetir o que já se sabe, mas de
focar nos pontos fracos, trabalhar pouco além da zona de conforto e receber feedback.
Por isso cada música pode ser dividida em **trechos**, avaliados individualmente.
Ao final, os trechos com nota ≤ 2 aparecem destacados como alvo da próxima sessão, e
sua confiança é reajustada automaticamente.

> **Domínio estimado** (0–100%): combina a qualidade média das últimas 5 avaliações
> (50%), o intervalo atingido (35%) e a estabilidade/`ease` (15%), com penalidade
> leve por lapses. É um indicador derivado, não uma medida absoluta.

## Evolução do sistema (roadmap)

Esta lista existe apenas neste documento; a interface não exibe mais a seção de evoluções.

### Prioridade alta
1. **Agendamento por trecho** — um cartão SM-2 independente para cada trecho, em vez
   de um cartão único por música; o refrão difícil evolui sem ser "segurado" pelo
   verso já dominado.
2. **Lembretes de revisão** — notificações push/e-mail quando as revisões vencem,
   fechando o ciclo entre agendamento e execução.
3. **Backend e multi-usuário** — autenticação, sincronização entre dispositivos e
   perfis professor/aluno, substituindo o armazenamento local.

### Prioridade média
4. **Metas e plano de estudos** — metas semanais e exportação para calendário
   (iCal/Google Calendar).
5. **Metrônome integrado** — variação progressiva de BPM aplicada à prática rítmica.
6. **Partituras e cifras** — anexar PDF/MusicXML/chord sheets com navegação por trecho.
7. **Análise de afinação e ritmo** — captura de áudio via Web Audio API com feedback.
8. **Estatísticas preditivas** — heatmap de consistência e curva de retenção prevista.
9. **PWA e modo offline** — instalação como app e sincronização posterior.

### Prioridade baixa
10. **Treino de ouvido gamificado** — intervalos, acordes e ritmo conectados ao repertório.
11. **Integrações de mídia** — referências de execução via YouTube/Spotify.
12. **Comunidade** — repertórios compartilhados, listas curadas e rankings de consistência.
13. **Assistente com IA** — sugestão automática de trechos críticos e exercícios
    personalizados a partir do histórico.
