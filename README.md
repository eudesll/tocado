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

Para instalar como aplicativo (PWA) e usar o service worker, sirva a pasta por HTTP:

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080
```

> A busca automática de fotos, gêneros, tons e durações usa APIs públicas e precisa de
> internet. As fotos já salvas continuam aparecendo normalmente offline (estão em
> base64 no seu navegador). O modo offline guarda apenas o app shell; seus dados já
> ficam no `localStorage`.

## Estrutura

```
.
├── index.html                  # Estrutura da SPA (cabeçalho, modal, toast)
├── manifest.webmanifest        # Metadados de instalação do PWA
├── sw.js                       # Service worker: cache do app shell
├── css/styles.css              # Tema, layout responsivo e componentes
├── icons/                      # Ícones SVG/PNG do PWA
├── js/
│   ├── http.js                 # Cliente HTTP com cache, timeout e deduplicação
│   ├── storage.js              # Persistência, validação/sanitização e IDs
│   ├── spaced-repetition.js    # Motor SM-2: agendamento, domínio, formatação
│   ├── artist-photo.js         # Busca (Wikipédia/Apple Music) e compactação da foto
│   ├── youtube.js              # Links, validação e metadados de vídeos (noembed)
│   ├── song-key.js             # Preview (iTunes) e estimativa do tom (Web Audio)
│   ├── song-lyrics.js          # Busca de letras (LRCLIB → lyrics.ovh)
│   └── app.js                  # Controlador: telas, formulários e fluxo de prática
├── tests/                      # Testes de unidade com node:test
└── README.md                   # Esta documentação
```

## Funcionalidades implementadas

- **Cadastro de cantores** — nome, gênero e biografia; edição e exclusão (com aviso
  de músicas que ficarão sem vínculo). O salvamento é imediato: a foto e os dados que
  ainda estiverem sendo buscados são acrescentados em segundo plano, com indicador
  **"Buscando foto..."** no card.
- **Cadastro do artista com preenchimento automático** — o único campo editável é o
  **nome**. Enquanto ele é digitado (debounce de 600 ms), o sistema consulta a
  **Wikipédia** (pt → en) para obter **foto e biografia curta**, e a **Apple Music**
  para obter o **gênero musical**. Os campos de gênero e biografia aparecem como
  somente leitura, marcados como "automático", e são salvos junto do cantor.
  A foto é compactada em um quadrado de 256 px em JPEG e **armazenada em base64** no
  `localStorage`. O formulário não tem botões de imagem: a prévia e o preenchimento são
  automáticos. Se nada for encontrado, o card exibe **"Foto não encontrada"** com o
  botão **"Tentar foto"**. Se a imagem não puder ser embutida, a URL remota é o fallback.
  Clicar no card do cantor abre a listagem de músicas já filtrada por ele.
- **Cadastro de músicas** — título, cantor, gênero, tom, dificuldade (1–5), duração,
  letra e **trechos** (Intro, Verso, Refrão...). Os trechos podem ser adicionados e
  removidos no editor e recebem confiança própria. Ao escolher o cantor, o **gênero
  musical é preenchido automaticamente** com o estilo cadastrado nele. Se o nome
  digitado não existir, o autocomplete oferece **+ Cadastrar "nome"**: o cantor é criado
  diretamente, sem abrir o popup, com foto/gênero/biografia buscados em segundo plano e
  já selecionado no formulário.
- **Tom, duração e letra automáticos ou manuais** — ao salvar, a música aparece
  imediatamente na lista e o enriquecimento roda em segundo plano. A **duração** e o
  **tom** são pesquisados com o nome do cantor na consulta; buscamos o preview oficial
  na Apple Music/iTunes, analisamos o áudio com Web Audio e estimamos a tonalidade pelo
  método de **Krumhansl-Schmuckler**, exibindo-a como estimativa (ex.: `Am · Lá menor`).
  A duração é preenchida mesmo quando o áudio não pode ser analisado. A **letra** é
  buscada na LRCLIB (fallback para lyrics.ovh). Qualquer valor digitado ou colado pelo
  usuário é preservado e marcado como **Manual**; o que veio da internet é identificado
  como automático. Não existe banco de tons gratuito com API aberta, por isso o tom é
  uma estimativa.
- **Vídeos do YouTube** — ao salvar uma música, o sistema gera automaticamente um link
  de busca (`título + cantor`). Músicas com vídeos exibem um ícone ▶ ao lado do nome na
  lista. Clicar no nome abre a **tela de resumo da música**, com mini player do YouTube
  na própria página quando a página é servida por http(s) (em `file://` é mostrado um
  poster com link direto, pois o YouTube rejeita embeds sem `Referer`), seletor dos
  vídeos anexados, metadados e o link de busca. O botão **Vídeos** abre a galeria para
  adicionar/remover links; só links e origens oficiais do YouTube são aceitos.
- **Listagem tabular do repertório** — tabela com Música, Cantor, Gênero, Tom, Duração,
  Revisão e Adicionada em (data/hora do cadastro), com indicador de dificuldade e chips
  de status pendente. Cabeçalhos clicáveis ordenam por qualquer coluna (clique de novo
  inverte a ordem) e expõem `aria-sort`. Um contador mostra quantas músicas estão sendo
  exibidas e o total. Filtros combináveis: busca por texto, cantor, gênero e
  "só revisões pendentes".
- **Sincronização entre abas** — alterações salvas em uma aba são refletidas nas demais
  pelo evento `storage`, sem recarregar a página.
- **Dados de teste** — o botão em **Dados → Dados de teste (debug)** adiciona 3 cantores
  e 4 músicas de exemplo (com letra, tom, vídeos e uma revisão já em dia) para testar a
  interface sem apagar os dados existentes.

> **Nota sobre o YouTube:** a API oficial exige chave e não existe endpoint de busca
> público com CORS confiável para uma página aberta via `file://`. Por isso o sistema
> gera o link de pesquisa automaticamente e permite anexar vídeos específicos, cujos
> metadados são obtidos pelo serviço público `noembed.com`.
- **Painel (dashboard)** — totais, revisões pendentes, domínio médio, sequência de dias
  consecutivos, histórico das últimas sessões, músicas recentes e calendário de atividade.
- **Prática guiada** — o usuário avalia cada trecho de 0 (esqueci) a 5 (perfeito);
  o sistema calcula a nota média, aplica o SM-2, registra a sessão e mostra:
  próxima revisão, novo intervalo, domínio estimado, evolução do fator de facilidade,
  lapses e a lista de **trechos fracos** para foco na próxima sessão.
- **Backup e armazenamento** — exportação/importação em JSON com confirmação antes de
  substituir os dados, validação de tamanho e conteúdo, sanitização de todos os campos e
  redefinição completa. A tela **Dados** mostra o espaço usado em relação ao limite
  típico do `localStorage`, com alerta quando ele está quase cheio.
- **Acessibilidade** — navegação por teclado, link "Pular para o conteúdo", foco preso
  no modal e restaurado ao fechar, `aria-current` na navegação, `aria-sort` na tabela,
  `aria-pressed` nas notas de prática, rótulos nos filtros e anúncios por `aria-live`.
- **PWA e offline** — manifest, ícones e service worker que guarda o app shell. Depois de
  aberto por http(s), o aplicativo pode ser instalado e recarregado sem internet (os dados
  continuam vindo do `localStorage`).
- **Segurança** — todo o estado carregado ou importado passa por sanitização; IDs e URLs
  são escapados antes de entrar no HTML; apenas `http(s)` (e `data:image` para fotos) são
  aceitos em links e imagens.

## Testes

Os testes usam apenas o runner nativo do Node.js (>= 20), sem dependências:

```bash
npm test        # ou: node --test tests/*.test.js
```

Eles cobrem a sanitização/importação do estado, a migração de schema, o cliente HTTP
(cache, timeout e deduplicação), o cálculo de dias em fusos diferentes e o algoritmo
SM-2. O workflow em `.github/workflows/ci.yml` executa a suíte a cada push/PR.

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
9. **Sincronização offline** — fila de alterações e sincronização posterior entre
   dispositivos (o app shell offline já está implementado).

### Prioridade baixa
10. **Treino de ouvido gamificado** — intervalos, acordes e ritmo conectados ao repertório.
11. **Integrações de mídia** — referências de execução via YouTube/Spotify.
12. **Comunidade** — repertórios compartilhados, listas curadas e rankings de consistência.
13. **Assistente com IA** — sugestão automática de trechos críticos e exercícios
    personalizados a partir do histórico.
