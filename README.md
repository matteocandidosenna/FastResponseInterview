# Interview Desk

Aplicativo Windows para ouvir o **som do sistema**, transcrever perguntas em inglês e gerar respostas de entrevista com seu contexto pessoal. O perfil inicial é **Backend Engineer / Alignerr**.

A geração usa o **Codex App Server com login oficial do ChatGPT**. A transcrição usa **Whisper local**, sem chave de API de áudio. O aplicativo não é afiliado à Alignerr, Cluely ou OpenAI.

## 1. Abrir o aplicativo

### Neste computador

1. Abra esta pasta no Explorador de Arquivos.
2. Dê dois cliques em **`Iniciar.cmd`**.
3. Aguarde a janela **Interview Desk**.

As dependências e o modelo **Whisper Base em inglês** foram preparados no projeto. O inicializador instala dependências se estiverem ausentes; nesse caso é preciso ter Node.js e acesso à internet.

Também é possível executar no PowerShell, dentro desta pasta:

```powershell
npm.cmd start
```

### Versão empacotada

Quando a pasta `release/InterviewDesk-win32-x64` estiver disponível, abra **`InterviewDesk.exe`** dentro dela. Mantenha a pasta inteira: o executável depende dos arquivos ao lado dele. Essa versão não exige Node.js instalado, mas ainda precisa do **Codex CLI** e de login válido para gerar respostas.

O pacote usa uma pasta própria de dados; pode precisar preparar o Whisper novamente. Ele não inclui as credenciais do desenvolvedor nem uma sessão de ChatGPT pré-autenticada.

### Painel compacto de escuta e respostas

Minimize a janela principal ou clique em **Modo compacto** para abrir o painel flutuante. Ele fica sobre as outras janelas e mantém a captura, a pergunta pendente e a resposta em andamento.

- **Iniciar / Parar captura** controla a escuta do som do sistema.
- **Gerar resposta / Interromper** controla a resposta, que aparece no próprio painel.
- **Copiar** copia a resposta atual.
- **Expandir** volta à tela completa, com as mesmas configurações, materiais e sessão.

Se a transcrição ainda não estiver preparada, o painel também mostra o botão de preparação. A opção **Responder após a fala**, definida na tela principal, continua funcionando. Arraste pela barra de título ou redimensione pelas bordas; o painel lembra sua posição e tamanho durante a sessão. Minimizar o próprio painel o recolhe à barra de tarefas; fechar encerra o aplicativo.

### Requisitos

- Windows 10/11, 64 bits, com dispositivo de saída de áudio ativo.
- Uma conta ChatGPT com acesso Codex e limite disponível.
- Codex CLI instalado, ou a extensão OpenAI no VS Code que inclua `codex.exe`.
- Internet para o login, respostas da IA e primeiro download de cada modelo de transcrição.
- Para executar o código-fonte: Node.js 22.16+ ou 24 LTS, npm e dependências deste projeto.
- Memória livre para o modelo local. Base é o padrão; Tiny usa menos recursos. O desempenho depende do computador.

## 2. Conectar sua assinatura do ChatGPT

1. Clique em **Continuar com ChatGPT**.
2. Complete o login na página oficial aberta no navegador.
3. Volte ao aplicativo; o indicador deve mostrar **ChatGPT conectado**.
4. Em **Modelo de resposta**, use **Padrão da sua conta** ou escolha um dos modelos retornados pelo Codex.

Se o Codex não for encontrado, instale o CLI oficial:

```powershell
npm.cmd install -g @openai/codex
codex login
codex login status
```

Se você usa uma instalação fora dos caminhos habituais, informe o executável ao abrir o app:

```powershell
$env:CODEX_BINARY = 'C:\caminho\para\codex.exe'
npm.cmd start
```

**Como a assinatura é utilizada:** o app conversa com o Codex instalado no computador e deixa o próprio Codex cuidar da autenticação. Ele não extrai cookies do navegador nem converte sua assinatura em uma chave de API. O uso continua sujeito aos modelos, limites e políticas disponíveis na conta. Não há promessa de uso ilimitado ou remoção das restrições do modelo. [Documentação oficial de autenticação](https://learn.chatgpt.com/docs/auth).

## 3. Testar o ponto principal: som do sistema

1. Conecte o fone que usará na entrevista.
2. Nas configurações de som do Windows, coloque esse fone como **saída padrão**.
3. Reproduza um vídeo com fala em inglês no navegador.
4. Clique em **Testar som por 5 segundos**.
5. Observe o medidor e a mensagem de áudio detectado.

Esse teste não exige baixar o Whisper e não envia áudio ao Codex. Ele apenas verifica se o aplicativo recebe sinal da saída de som.

**O que é capturado:** o áudio reproduzido pelos aplicativos na saída padrão, inclusive pelo navegador e pelos fones. A implementação usa o loopback do Windows via Electron. Não usa o microfone. Outros sons na mesma saída, como música e notificações, também podem entrar na captura.

O Electron exige uma trilha de vídeo para iniciar `getDisplayMedia`; o aplicativo a desativa e não processa, salva ou envia quadros de tela. Apenas o áudio é encaminhado ao transcritor.

Se trocar de fone, conectar Bluetooth ou mudar a saída padrão, **pare e reinicie a captura**. Se o navegador estiver direcionado para outra saída no mixer de volume do Windows, alinhe as saídas antes de testar.

## 4. Preparar e iniciar a transcrição

1. Em **Transcrição em inglês**, escolha o modelo.
2. Clique em **Preparar transcrição local**.
3. Aguarde a mensagem **Modelo pronto neste computador**.
4. Clique em **Iniciar captura**.
5. A fala deve aparecer em **O que você ouviu** e no campo de pergunta.
6. Clique em **Gerar resposta** ou pressione **Ctrl + Enter**.

O download inicial pode levar alguns minutos. Prepare o modelo **antes** da conversa. Depois do download, a transcrição ocorre no computador e pode funcionar sem internet; a geração via ChatGPT continua precisando de conexão.

O transcritor é configurado para **fala em inglês**. O idioma da resposta pode ser inglês ou português, mas mudar esse campo não torna o modelo de áudio multilíngue.

### Modo automático

Marque **Responder após a fala** para gerar quando houver uma pausa e a fila de transcrição tiver terminado. O app espera o áudio em andamento antes de disparar outra resposta. A fila é limitada: se a máquina não acompanhar, a captura é pausada e aparece um aviso.

No modo manual, você pode corrigir a transcrição e juntar vários trechos antes de responder. Para perguntas longas ou pausas frequentes, esse modo dá mais controle. A pergunta enviada é removida do campo após a resposta; falas novas recebidas durante a geração são preservadas.

**Parar captura** fecha a fonte de áudio, mas termina a transcrição do trecho já capturado. Use **Limpar** para descartar a sessão e os resultados ainda pendentes. **Interromper** cancela uma resposta em geração. Parar a captura não cancela, por si só, uma resposta que já foi enviada.

## 5. Alimentar o agente com seu contexto

No painel **Seu contexto**:

1. Confirme a vaga e o idioma.
2. Cole a **descrição exata da vaga**. O anúncio público pesquisado é uma referência, não uma confirmação de que seja o mesmo convite que você recebeu.
3. Em **Sobre você**, descreva suas experiências reais, tecnologias, projetos e resultados.
4. Em **Estilo da resposta**, diga como prefere responder.
5. Clique em **Adicionar materiais** para selecionar arquivos.

Exemplo de contexto pessoal para preencher com fatos seus:

```text
Minha stack principal: [linguagem, framework, banco, cloud].
Projeto: [problema real que resolvi].
Minha responsabilidade: [o que eu fiz, individualmente].
Decisão técnica: [opções e motivo da escolha].
Resultado observado: [métrica verdadeira ou efeito qualitativo].
Incidente: [diagnóstico, correção e aprendizado].
```

Exemplo de instrução de estilo:

```text
Answer in clear conversational English. Start with the direct answer.
Use a concrete backend example and explain one important trade-off.
Keep the main answer suitable for about one minute of speech.
For code examples, prefer Python and PostgreSQL.
```

### Formatos e limites

| Material | Como é usado |
| --- | --- |
| PDF com texto | Texto extraído e dividido em trechos para busca local. |
| PDF escaneado | Páginas sem texto suficiente são renderizadas e enviadas como imagens, dentro do limite visual. |
| DOCX | Texto extraído localmente. |
| TXT, MD, CSV e JSON | Conteúdo textual indexado. |
| PNG, JPG, JPEG e WebP | Redimensionados quando necessário e anexados para leitura visual pelo modelo. |

- Até **25 MB por arquivo**, **30 arquivos** e **6 imagens/páginas escaneadas** no contexto.
- Até **600 mil caracteres extraídos por documento**.
- Até aproximadamente **14 mil caracteres de trechos selecionados** por resposta, além do perfil, pergunta, imagens e histórico recente.
- A busca é lexical: palavras relevantes selecionam trechos. Não é uma leitura integral de todos os arquivos em cada pergunta.
- PDFs com texto e diagramas são usados principalmente pelo texto; adicione o diagrama importante também como imagem se a informação visual for essencial.
- Todas as imagens ativas são reenviadas nas respostas. Muitos anexos visuais aumentam tempo e uso da conta.
- Um PDF escaneado que exceda o limite é recusado com uma explicação; separe as páginas relevantes.
- PDF protegido, arquivo corrompido ou formato não suportado produz um aviso, sem remover os outros arquivos.

Os materiais ficam salvos entre aberturas. O botão **×** remove um material do contexto e também limpa o histórico interno de respostas para não continuar reutilizando a informação removida. Você precisa aguardar ou interromper uma resposta antes de remover arquivos.

## 6. Ajustar latência sem perder especificidade

O caminho é:

```text
Som do Windows → pausa na fala → Whisper local → contexto relevante → Codex → texto progressivo
```

| Ajuste | Quando usar | Custo da escolha |
| --- | --- | --- |
| Whisper Tiny | CPU lenta ou fila de transcrição crescente. | Pode errar mais termos técnicos e sotaques. |
| Whisper Base | Ponto inicial equilibrado para inglês. | Mais processamento que Tiny. |
| Whisper Small | Priorizar transcrição precisa. | Download maior e maior consumo de CPU/memória. |
| Profundidade low | Perguntas diretas ou respostas rápidas. | Menos análise para problemas complexos. |
| Profundidade medium | Padrão para backend. | Pode demorar mais que low. |
| Profundidade high | Design complexo e revisão detalhada. | Maior latência e uso da conta. |
| Pausa 550 ms | Fala contínua, poucas hesitações. | Pode dividir uma pergunta cedo demais. |
| Pausa 850–1.200 ms | Conversa com pausas naturais. | Acrescenta tempo antes de transcrever. |

O painel mostra **STT**, tempo de transcrição de cada trecho; **Primeiro texto**, tempo entre solicitar uma resposta e receber texto do Codex; e o tempo total de geração. Esses números medem etapas diferentes.

Na validação local, um áudio sintético de aproximadamente 5,2 segundos foi transcrito corretamente em **896 ms**, com Whisper Base já carregado. Isso é um resultado de um teste, **não** uma garantia de latência em entrevistas. A pausa, o carregamento inicial, a rede, a fila do serviço, o modelo e a complexidade da pergunta somam tempo.

Para respostas específicas, o melhor ponto inicial é: **Base + medium + currículo enxuto + vaga exata + dois ou três projetos detalhados**. Reduzir instruções e anexos repetidos costuma ser mais útil do que pedir uma resposta longa para toda pergunta.

## 7. Preparação para Backend Engineer na Alignerr

A pesquisa pública encontrou um anúncio de **Software Engineer - Backend** com:

- Triagem com Zara, em inglês, sobre histórico e experiência.
- Entrevista de domínio envolvendo sistemas distribuídos, microsserviços e frameworks backend.
- Atividades de avaliar código backend gerado por IA, escrever soluções, explicar escolhas e identificar casos extremos.

Fonte: [anúncio oficial de Backend Engineer](https://www.alignerr.com/jobs/90bd0392-8519-4ca7-b23b-95cea934595f), consultado em 06/11/2026. O [processo geral da Alignerr](https://www.alignerr.com/en/process) informa que as etapas adicionais variam conforme a vaga/projeto.

Os botões **Praticar backend** inserem perguntas sobre API design, dados, system design e experiências profissionais. Eles não enviam a pergunta automaticamente: você pode editá-la antes de gerar uma resposta.

Para a parte técnica, pratique explicar decisões, limites e falhas: idempotência, isolamento de transações, índices, invalidação de cache, retries, filas, consistência, observabilidade e segurança. Essa lista é uma proposta de preparação derivada do perfil backend, não um roteiro oficial ou banco de perguntas da plataforma.

O app orienta o modelo a não inventar experiências, empregadores ou métricas pessoais. Se faltar evidência no seu material, ele deve indicar o que personalizar ou apresentar uma abordagem hipotética. Confira as regras do convite sobre assistência durante a avaliação.

## 8. Sessões, privacidade e armazenamento

- **Fixar janela** mantém o app acima das demais janelas.
- **Copiar** copia a resposta atual.
- **Exportar sessão** salva transcrições e respostas concluídas em Markdown no local escolhido.
- **Limpar** apaga a sessão da interface e do histórico em memória; mantém perfil e materiais.
- O áudio bruto não é gravado em arquivo pelo app. Ele permanece temporariamente em memória para transcrição.
- Transcrição e histórico da sessão não são salvos automaticamente pelo app.
- Perfil e documentos ficam em `context.json` e `attachments/` na pasta de dados do Electron, normalmente em `%APPDATA%/interview-desk` no modo de desenvolvimento. O nome da pasta pode variar no pacote.
- Esses arquivos locais **não são criptografados pelo aplicativo**. A proteção depende da sua conta e disco do Windows.
- No código-fonte, os modelos ficam em `.cache/models/`; no pacote, na pasta `models/` dos dados do app.
- As credenciais ficam sob gestão do Codex, não em `context.json`.
- Ao gerar uma resposta, são enviados ao Codex a pergunta, perfil, trechos selecionados, imagens ativas e até seis pares recentes de pergunta/resposta. Aplicam-se as políticas de dados da conta.
- O app usa threads efêmeras do Codex; isso não deve ser interpretado como promessa sobre retenção do serviço remoto.

## 9. Problemas comuns

| Sintoma | Como resolver |
| --- | --- |
| Janela não abre | Execute `npm.cmd start` no PowerShell para ver o erro. `Iniciar.cmd` remove a variável `ELECTRON_RUN_AS_NODE` quando herdada de outro programa. |
| Codex não encontrado | Instale o CLI/extensão ou configure `CODEX_BINARY`. Reinicie o app após instalar. |
| Login não aparece conectado | Conclua o login no navegador, verifique `codex login status` e reabra o app. A conta precisa ter acesso Codex. |
| Limite de uso ou erro de conta | Verifique seu plano, limites e acesso ao modelo. O app não contorna cotas. |
| Medidor parado | Toque um vídeo; verifique saída padrão, mixer do Windows e fone. Reinicie a captura após mudar de dispositivo. |
| Medidor reage, mas não transcreve | Prepare o modelo, espere a pausa na fala e aumente a sensibilidade se o som estiver baixo. |
| Frases cortadas | Aumente a pausa para 1.200 ou 1.600 ms, ou use resposta manual. |
| Transcrição atrasada | Use Tiny, feche tarefas pesadas e evite reproduzir vários áudios simultaneamente. |
| Termos técnicos incorretos | Use Base/Small, melhore a qualidade da fonte ou corrija a pergunta antes de enviar. |
| Download não termina | Verifique acesso a Hugging Face e internet. Tente preparar novamente; não inicie o primeiro download durante a entrevista. |
| Resposta genérica | Adicione a vaga exata, projetos e decisões técnicas reais. Diga a stack preferida. |
| PDF escaneado grande | Separe as páginas importantes ou exporte-as como imagens. O limite visual é explícito. |
| Modelo não aceita profundidade | Escolha um modelo compatível com low/medium/high ou volte ao padrão da conta. |

## 10. Desenvolvimento e validação

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run check
npm.cmd start
npm.cmd run package
```

Estrutura:

```text
src/main.cjs        Janela, IPC, arquivos, persistência e worker de transcrição
src/codex.cjs       JSON-RPC do Codex, login, respostas progressivas e cancelamento
src/transcriber.mjs Whisper em thread separada
src/segmenter.js    Detecção de fala por energia, pausa e limite de duração
src/audio-worker.js Captura PCM mono em AudioWorklet
src/context.cjs     Seleção de trechos e instruções da resposta
src/renderer.js     Interface, captura, fila e modo automático
test/              Testes de comportamento
scripts/           Inicialização, empacotamento e diagnóstico
docs/              Pesquisa e registro de validação
```

**Testes disponíveis:**

- `npm.cmd test`: comportamento de segmentação, seleção de contexto e eventos do Codex.
- `npm.cmd run check`: análise de sintaxe JavaScript.
- `node scripts/stt-smoke.cjs`: carrega o Whisper Base e transcreve `tmp/speech.f32`, quando existir; pode baixar o modelo.
- `powershell -NoProfile -File scripts/make-speech.ps1`: gera essa fala de teste usando a voz instalada no Windows.
- `npm.cmd run smoke`: abre o app com um perfil de teste isolado, reproduz um tom baixo por cerca de dois segundos e verifica o nível do loopback. Salva os resultados e uma captura da interface em `tmp/`. **Requer ambiente gráfico e autorização para abrir o app.**

O relatório em [docs/VALIDACAO.md](docs/VALIDACAO.md) distingue verificações executadas de testes pendentes. O fluxo autenticado de geração precisa ser conferido após o login; não há respostas simuladas apresentadas como se viessem da sua conta.

## Referências técnicas

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): protocolo, autenticação e eventos progressivos.
- [Autenticação Codex / ChatGPT](https://learn.chatgpt.com/docs/auth): acesso pela assinatura.
- [Captura de desktop no Electron](https://www.electronjs.org/docs/latest/api/desktop-capturer): áudio loopback.
- [Transformers.js](https://github.com/huggingface/transformers.js): execução local do Whisper com ONNX.
- [Pesquisa da Alignerr](docs/ALIGNERR.md): fontes, escopo e preparação.
