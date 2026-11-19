# Tocadô

App web **local-first, sem dependências nem build** para organizar repertório, ensaiar com
repetição espaçada e montar setlists. Dados no `localStorage`, PWA offline e temas claro/escuro.

**Publicado:** <https://eudesll.github.io/tocado/>

## Rodar

Abra `index.html` em um navegador moderno. Para instalar como app e usar o service worker:

```bash
python3 -m http.server 8080   # http://localhost:8080
npm test                      # Node >= 20, sem dependências
```

## Recursos

- **Repertório** — cantores e músicas com preenchimento automático (foto, gênero, tom,
  letra e vídeos), filtros, busca, ordenação e abas Músicas/Cantores.
- **Ficha da música** — trechos marcados A/B/C, letra, mini player de vídeos, círculo das
  quintas com o tom e o relativo, atividade e ações rápidas.
- **Ensaios** — revisões SM-2, avaliação `0`–`5` por trecho (também por teclado),
  progresso da sessão, círculo das quintas e letra consultável.
- **Palco** — setlists feitos com as músicas do repertório; arraste para adicionar,
  remover e reordenar. Modo tela cheia com letra grande e atalhos de teclado.
- **Geral** — paleta `Ctrl/⌘ + K`, drawers, ícones SVG próprios, backup/importação JSON
  em Ajustes, dados de teste, sincronização entre abas e acessibilidade por teclado.

## Estrutura

```
index.html            SPA, sprite de ícones, drawer, paleta e toast
css/styles.css        Tokens visuais, temas e layout responsivo
js/storage.js         Persistência, sanitização e migração
js/spaced-repetition.js  SM-2, agendamento e domínio
js/app.js             Telas e interações
js/*.js               HTTP, fotos, tom, letra e YouTube
icons/                Ícone do app (clave de sol) e PNGs do PWA
sw.js                 Cache do app shell
tests/                Testes com node:test
```

## Método

Repetição espaçada (Ebbinghaus), efeito do teste (Roediger & Karpicke) e prática
deliberada (Ericsson). Cada música tem um cartão SM-2: a nota ajusta o fator de
facilidade e o intervalo da próxima revisão; trechos com nota baixa viram foco da
sessão seguinte. O domínio é um indicador derivado, não uma medida absoluta.

## Testes

```bash
npm test
```

Suíte com `node:test` cobrindo sanitização, migração, HTTP, datas e SM-2. O CI roda a
suíte a cada push/PR.

## Próximos passos

- Agendamento independente por trecho e lembretes de revisão.
- Sincronização entre dispositivos.
- Cifras/partituras e rolagem automática no palco.
- Estatísticas preditivas e treino de ouvido.
