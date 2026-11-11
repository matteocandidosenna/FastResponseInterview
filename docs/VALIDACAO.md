# Validação — Interview Desk

## Atualização: painel compacto

- 13 testes automatizados aprovados, incluindo alternância de janela, restauração do estado maximizado e da preferência de fixação, posição do painel e mudança de monitor.
- Teste gráfico executado no Windows: minimizar abre o painel; expandir restaura a interface e os controles originais.
- Captura real do som do sistema validada a 16 kHz. A captura permaneceu ativa ao minimizar/expandir e também pôde ser iniciada diretamente no painel.
- Pergunta pendente e resposta preservadas; atualização de texto por evento de streaming verificada com conteúdo de teste.
- Layout sem transbordamento no tamanho padrão e no mínimo de 360 × 340. Prévia salva em `tmp/compact.png`.
- A resposta de IA real não foi solicitada nesta verificação; o teste do painel usa texto simulado e não altera a conta do usuário.
- O teste gráfico usa um perfil separado em `tmp/smoke-profile`.

## Validação original

Data: 06/11/2026.

## Executado

- **9 testes automatizados aprovados**, incluindo preservação de nova fala durante uma resposta e espera pelo fim da fala no modo automático.
- Testes automatizados de segmentação: silêncio, fala, ruído breve e duração máxima.
- Testes de seleção de contexto com orçamento de texto e prioridade para evidência relevante.
- Testes de instruções com histórico recente limitado.
- Testes de streaming: isolamento de threads, propagação de falhas e recusa de execução de ferramentas.
- Análise de sintaxe dos arquivos JavaScript.
- Carregamento do parser PDF e do runtime ONNX.
- Download e inicialização do Whisper Base em inglês.
- Transcrição de fala sintética de aproximadamente 5,2 s. Pergunta reconhecida: “How would you design a database transaction to handle concurrent payment requests?” Tempo reportado pelo worker: **896 ms**, após carregar o modelo.
- Conferência dos campos JSON-RPC contra os schemas gerados pelo Codex instalado, versão `0.164.0-alpha.11.1`.
- Empacotamento para Windows x64 concluído em `release/InterviewDesk-win32-x64`.

## Não validado de ponta a ponta nesta sessão

- Abertura visual, layout e captura real do som do Windows: o teste gráfico não foi autorizado. Existe um teste de loopback automatizado e um botão de diagnóstico no aplicativo para executar posteriormente.
- Login e geração de respostas com a assinatura: o CLI estava sem login. Requer autenticação interativa do titular.
- Latência total de uma resposta na entrevista real, dependente de áudio, hardware, rede, modelo e conta.

O teste inicial do executável encontrou `ELECTRON_RUN_AS_NODE` herdado do ambiente. O inicializador foi corrigido para retirar essa variável. O novo teste gráfico não foi executado após a recusa de autorização.

## Conferência pelo usuário

1. Abrir `Iniciar.cmd` ou o executável do pacote.
2. Completar o login e confirmar o status ChatGPT conectado.
3. Reproduzir fala no navegador e usar “Testar som por 5 segundos”.
4. Preparar o Whisper e iniciar a captura; conferir a transcrição.
5. Adicionar currículo, uma imagem e a vaga; fazer uma pergunta que dependa desses materiais.
6. Conferir cancelamento, exportação e reinício após trocar de fone.
7. Ensaiar uma sessão curta antes do uso pretendido.
