# Tocadô

Aplicação web **local-first, sem dependências de runtime e sem build** para organizar um
repertório musical, ensaiar com revisão espaçada e montar setlists para tocar ao vivo.
Os dados ficam no `localStorage` do navegador; há temas claro/escuro e instalação como PWA.

**Site publicado:** <https://eudesll.github.io/tocado/> (GitHub Pages, branch `main`, pasta raiz).

## Executar

Abra `index.html` em um navegador moderno. Para usar o service worker, a instalação como
app e o modo offline, sirva a pasta por HTTP:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

A busca automática de fotos, gênero, tom e letra usa APIs públicas e precisa de internet.
Já o app shell e os dados salvos funcionam offline.

```bash
npm test   # runner nativo do Node (>= 20), sem dependências
```

## Estrutura

```
index.html                  SPA: cabeçalho, drawer, modal, paleta e toast
manifest.webmanifest        Metadados de instalação (PWA)
sw.js                       Cache do app shell
css/styles.css              Tokens, temas, layout e componentes
icons/                      Ícone do app (violão), SVG e PNG
js/storage.js               Persistência, sanitização e migração
js/spaced-repetition.js     SM-2, agendamento e domínio estimado
js/http.js                  HTTP com cache, timeout e deduplicação
js/artist-photo.js          Foto/biografia (Wikipédia) e gênero (Apple Music)
js/song-key.js              Tom estimado (Web Audio) e duração (iTunes)
js/song-lyrics.js           Letra (LRCLIB → lyrics.ovh)
js/youtube.js               Vídeos e metadados (noembed)
js/app.js                   Telas, ações e fluxo de ensaio
tests/                      Testes com node:test
```

## Funcionalidades

### Repertório

- Cadastro de **cantores** com preenchimento automático de nome, foto, gênero e
  biografia; foto compactada em base64. Edição, exclusão e busca de foto novamente.
- Cadastro de **músicas** com cantor (autocomplete, com criação inline), gênero, tom,
  dificuldade, duração, letra, trechos e vídeos.
- Enriquecimento automático em segundo plano: tom estimado por áudio, duração, letra e
  link de busca no YouTube. Valores digitados manualmente são preservados.
- Lista em cartões com busca, filtros (cantor, gênero, pendentes) e ordenação
  configurável; abas **Músicas / Cantores**.
- Ficha da música: trechos marcados A/B/C, letra recolhível, mini player de vídeos,
  círculo das quintas com o tom e o relativo destacados, atividade e ações rápidas.

### Ensaios

- Painel com pendentes, ensaios do dia, domínio médio, sequência, atividade recente e
  atalho “Praticar próxima”.
- Ensaio por música: progresso dos trechos, notas `0`–`5` (também por teclado), dicas em
  tooltip, círculo das quintas, letra consultável e abertura direta no palco.
- SM-2 calcula próxima revisão, intervalo, domínio e trechos fracos ao final de cada
  sessão.

### Palco

- **Setlists** criados a partir das músicas do repertório, com várias listas, renomeação
  e exclusão.
- **Arrastar e soltar** para adicionar músicas, remover e reordenar; botões de seta são a
  alternativa por teclado.
- Modo tela cheia com letra grande, setas `←`/`→` para trocar de música, `+`/`−` para
  ajustar a fonte e `Esc` para sair.

### Geral

- Paleta de comandos `Ctrl/⌘ + K`, drawers laterais, ícones SVG próprios (sem emoji) e
  navegação **Hoje / Repertório / Palco / Ensaios**; ajustes e backup em **Ajustes**.
- Dados de exemplo em **Ajustes → Dados de teste**.
- Exportação/importação JSON com validação e sanitização, redefinição completa e
  sincronização entre abas.
- Acessibilidade: navegação por teclado, foco preso e restaurado no drawer, `aria-current`,
  rótulos, `aria-live` e respeito a `prefers-reduced-motion`.
- PWA com app shell offline; nada é enviado a servidores próprios. As chaves
  `repertorio_musical_v1` e `repertorio_theme` são legadas e foram preservadas para não
  apagar dados já salvos.

## Identidade visual

Tokens CSS (`Partitura viva`): papel quente, tinta escura, lápis coral e marca-texto
âmbar; títulos em serifada do sistema, números e tons em mono. Componentes compartilham
os mesmos tokens, com tema escuro derivado e layout responsivo.

## Método

- **Repetição espaçada:** revisões distribuídas no tempo vencem a releitura em bloco
  (Ebbinghaus); recuperar sem consultar fixa melhor (Roediger & Karpicke).
- **SM-2:** nota `q` de 0 a 5 ajusta o fator de facilidade (mín. 1,3) e o intervalo —
  1 dia, 6 dias, depois `intervalo × ease`; nota < 3 reinicia o intervalo e conta um lapse.
- **Prática deliberada:** trechos fracos recebem atenção na próxima sessão (Ericsson).

O **domínio estimado** (0–100%) combina qualidade média recente, intervalo e
estabilidade/`ease`; é um indicador derivado, não uma medida absoluta.

## Roadmap

1. Agendamento independente por trecho (hoje o cartão é por música).
2. Lembretes de revisão e metas semanais.
3. Sincronização entre dispositivos e backend opcional.
4. Partituras, cifras e rolagem automática no palco.
5. Estatísticas preditivas e heatmap de consistência.
6. Treino de ouvido e integrações de mídia.
