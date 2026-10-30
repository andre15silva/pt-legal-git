# Guia de estilo: Português Técnico Simplificado (PTS)

Este guia define como escrevemos todo o texto do produto Redação. Aplica-se a botões, títulos, avisos, resumos, mensagens de erro e páginas de ajuda. Não se aplica ao texto da lei. Citamos o texto da lei sem alterações.

O guia adapta a especificação [ASD-STE100](https://www.asd-ste100.org/) (Simplified Technical English, edição 9, 2025) ao português europeu. Não existe uma versão portuguesa oficial da ASD-STE100. As regras abaixo são a nossa adaptação. A ferramenta [`tools/estilo.py`](../tools/estilo.py) verifica as regras que é possível verificar automaticamente.

O objetivo é simples. Cada frase tem um só significado. Uma pessoa com o 9.º ano lê a frase uma vez e percebe-a. Um tradutor automático traduz a frase sem erros.

## 1. Palavras

1.1. Use só as palavras do [dicionário controlado](#7-dicionário-controlado) e os termos jurídicos técnicos (por exemplo, «alínea», «republicação», «norma transitória»).

1.2. Dê a cada palavra um só significado. Por exemplo, «redação» é sempre o texto de um artigo, número ou alínea. «Versão» é sempre o texto de um diploma inteiro.

1.3. Use sempre o mesmo termo para a mesma coisa. Não use sinónimos para variar o texto.

1.4. Use o português europeu e a ortografia do Acordo Ortográfico de 1990, como o Diário da República. Escreva «ecrã», «ficheiro», «utilizador», «registo», «guardar», «descarregar», «equipa», «contacto», «facto».

1.5. Não use palavras do português do Brasil: «tela», «arquivo», «usuário», «cadastro», «salvar», «baixar», «time», «contato», «fato».

1.6. Não use um substantivo no lugar de um verbo. Escreva «A lei revogou o artigo», não «A lei procedeu à revogação do artigo».

1.7. Não junte mais de três substantivos seguidos ligados por «de». Escreva «a taxa do IRC», não «a taxa de imposto de rendimento de pessoas coletivas de 2026».

1.8. Escreva o nome completo de um diploma na primeira vez: «Lei n.º 64/2025, de 7 de novembro». Depois, escreva «Lei n.º 64/2025».

## 2. Verbos

2.1. Use só estas formas:
- o infinitivo («Comparar redações»)
- o imperativo, na 3.ª pessoa do singular («Escolha a data»)
- o presente do indicativo («O artigo está em vigor»)
- o pretérito perfeito simples («A lei alterou o artigo»)
- o futuro simples, só quando a data é futura e o presente não serve («A taxa será de 17 % em 2028»)
- o particípio passado como adjetivo («texto revogado»)
- o futuro do conjuntivo só depois de «se» ou «quando» («Se a lei não fixar a data, …»)

2.2. Não use o gerúndio. Escreva «está a ver», não «está vendo».

2.3. Não use tempos compostos nem perífrases verbais: «tem sido alterado», «vai ser publicado», «está a ser verificado», «poderia aplicar-se».

2.4. Use a voz ativa. Diga quem faz a ação: «A Lei n.º 64/2025 alterou o artigo», não «O artigo foi alterado».

2.5. Use a voz passiva só quando não sabe quem fez a ação ou quando o termo jurídico é passivo («revogado», «publicado no Diário da República»).

2.6. Use um verbo para dizer a ação. Escreva «Compare», não «Faça a comparação». Escreva «verificamos», não «procedemos à verificação».

## 3. Frases

3.1. Escreva no máximo 20 palavras numa instrução e no máximo 25 palavras numa descrição. Uma referência entre parênteses conta como uma palavra.

3.2. Escreva uma instrução por frase.

3.3. Escreva um tema por parágrafo e no máximo seis frases por parágrafo.

3.4. Use artigos e não corte palavras. Escreva «Escolha a data», não «Escolher data» numa instrução. Os botões e os rótulos são exceção (regra 5.1).

3.5. Use uma lista vertical quando o texto tem mais de dois passos ou mais de duas condições.

3.6. Ligue frases sobre o mesmo tema com palavras simples: «Depois», «Também», «Por isso», «Mas», «Se».

3.7. Escreva frases afirmativas. Escreva «O texto está em vigor», não «O texto não deixou de estar em vigor».

## 4. Pontuação

4.1. Não use o ponto e vírgula.

4.2. Não use o travessão («—») para fazer apartes. O travessão só aparece onde a lei o usa: nos números dos artigos («1 — A taxa…») e entre uma divisão e a sua epígrafe («Artigo 87.º — Taxas», «Capítulo IV — Taxas»).

4.3. Não use pontos de exclamação nem emojis.

4.4. Use parênteses só para referências e abreviaturas: «(Lei n.º 74/98, art. 2.º)».

4.5. Use as aspas angulares «» para citar texto. Use as aspas curvas “” só dentro de uma citação.

4.6. Escreva as datas por extenso no texto («7 de novembro de 2025») e no formato «07/11/2025» só nas tabelas.

## 5. Interface

5.1. Nos botões e nas ligações, use o infinitivo ou um substantivo: «Comparar redações», «Seguir este artigo», «Hoje». Diga exatamente o que acontece.

5.2. Nos títulos, use uma frase nominal curta ou uma pergunta real do utilizador: «História deste artigo», «Quanto pode subir a renda?».

5.3. Numa instrução, escreva primeiro a condição e depois a ação, com uma vírgula entre as duas: «Para ver a lei noutra data, escolha a data.»

5.4. Numa mensagem de erro, diga o que aconteceu e o que a pessoa pode fazer. Não peça desculpa. «Não encontrámos este artigo. Confirme o número do artigo.»

5.5. Trate a pessoa por «você» implícito. Não escreva «você», «V. Ex.ª» nem «tu».

5.6. Não use as palavras do git na interface para cidadãos. Use a tabela de vocabulário em [DESIGN.md](DESIGN.md#vocabulary).

## 6. Avisos

6.1. Use dois níveis:
- **Atenção**: a pessoa pode tirar uma conclusão jurídica errada (por exemplo, uma norma transitória muda a taxa aplicável).
- **Nota**: informação útil sem risco.

6.2. Comece o aviso com a condição ou com a instrução. Depois, diga a consequência. «Para períodos que começam em 2026, a taxa é de 19 %. O texto do artigo diz 17 %.»

6.3. Não use uma nota para dar uma instrução.

## 7. Dicionário controlado

Cada termo tem um só significado. A coluna «Não use» mostra os sinónimos que não usamos.

| Termo | Significado | Não use |
|---|---|---|
| diploma | Um ato publicado no Diário da República (lei, decreto-lei, portaria…). | documento, texto legal |
| a lei | O conjunto das regras escritas em vigor, em textos para cidadãos. Num nome, «Lei n.º …» é o tipo de diploma. | a legislação (em texto para cidadãos) |
| norma | Uma regra dentro de um artigo. | disposição, preceito |
| artigo, número, alínea | As unidades do texto. | parágrafo, ponto, secção (para «número») |
| redação | O texto de um artigo, número ou alínea num período de tempo. | versão (para um artigo), formulação |
| versão | O texto de um diploma inteiro numa data. | edição, release |
| alteração | Uma mudança de texto feita por um diploma. | modificação, emenda, revisão (exceto «revisão constitucional») |
| ato modificativo | O diploma que faz uma alteração. Nos textos para cidadãos, escreva «a lei que alterou». | diploma alterador, lei alteradora |
| publicação | A publicação no Diário da República. | divulgação, saída |
| entrar em vigor, em vigor desde | O início da vigência de uma redação. | vigorar, começar a valer |
| produzir efeitos, aplicar-se | Os factos ou períodos a que uma redação se aplica. | ter efeito, valer para |
| norma transitória | Uma norma que diz como a mudança se aplica no tempo. | regra de transição, disposição transitória (exceto em citação) |
| revogar, revogado | Retirar uma norma da lei com outra norma. | anular, eliminar, cancelar |
| acrescentado, eliminado | Texto que uma alteração pôs ou tirou. Só na comparação de redações. | adicionado, removido, apagado |
| iniciativa | Um projeto de lei ou uma proposta de lei no Parlamento. | proposta (sozinha), PL |
| votação · a favor · contra · abstenção | Uma votação no Parlamento e o sentido de voto de cada grupo. | sim, não, voto favorável |
| origem do texto | O diploma que escreveu uma frase. | autoria, blame |
| comparar | Mostrar duas redações com as diferenças marcadas. | confrontar, diff |
| verificar, verificado | Confirmar o nosso texto com uma fonte oficial. | validar, confirmar (neste sentido) |
| pesquisar | Procurar texto ou diplomas. | procurar, buscar |
| seguir | Receber avisos quando um artigo muda. | subscrever, acompanhar, monitorizar |
| data | Um dia do calendário. | (não use «data» para «dados») |

## 8. Palavras e construções proibidas

Estas palavras e construções tornam o texto vago ou fazem-no parecer gerado por uma máquina. Não as use. A ferramenta `tools/estilo.py` encontra-as.

- Enchimento: «é importante salientar», «vale a pena», «importa referir», «de facto», «na verdade», «em suma», «em resumo», «de forma geral», «basicamente», «realmente», «simplesmente».
<!-- pts:ignorar-inicio -->
- Palavras vagas ou de marketing: «robusto», «abrangente», «holístico», «inovador», «revolucionário», «poderoso», «intuitivo», «sem esforço», «crucial», «essencial», «fundamental», «potenciar», «alavancar», «otimizar», «sinergia», «ecossistema», «paradigma», «jornada», «mergulhar», «desbloquear», «descubra», «explore», «no coração de», «a chave para», «num mundo em que».
<!-- pts:ignorar-fim -->
- Construções: «não só… como também», «não é X, é Y», três adjetivos seguidos, perguntas retóricas, frases que começam com «Imagine».
- Gerúndio (regra 2.2), ponto e vírgula (regra 4.1), travessão em apartes (regra 4.2), ponto de exclamação (regra 4.3).

### 8.2. Neutralidade (todo o texto do produto)

Descreva o que aconteceu. Não diga quem ganhou nem fale de campos políticos. A ferramenta verifica estas palavras em todo o texto. Uma citação entre «» de um documento oficial não conta.

<!-- pts:ignorar-inicio -->
- Votações: «chumbou», «chumbaram», «chumbado», «travou», «luz verde», «vencedores», «derrotados».
- Campos políticos: «maioria de esquerda», «maioria de direita», «oposição» como campo político, «geringonça». «Oposição à renovação» e «oposição pelo arrendatário» são termos da lei e podem ser usados.
- Autoria: «lei do PS», «proposta do PSD», «escrito por» seguido de uma sigla. Escreva quem apresentou a iniciativa: «Deputados do Partido Socialista (PS) apresentaram o Projeto de Lei n.º …».
- Percentagens: «%» junto do nome de um grupo parlamentar ou de um Governo.
<!-- pts:ignorar-fim -->

### 8.3. Histórias (`tools/estilo.py --historia`)

Numa história, as datas, os números, os nomes e as votações vêm dos dados do site, por referências (`{ato:…}`, `{data:…}`, `{citacao:…}`, `{voto:…}`). A prosa fora das referências e das citações não tem:

<!-- pts:ignorar-inicio -->
- algarismos, nomes de meses, «n.º», siglas de grupos parlamentares;
- palavras de votação: «votou», «votaram», «a favor», «absteve», «abstiveram», «abstenção», «unanimidade»;
- números por extenso: «dois» a «vinte», «trinta» a «mil», «primeiro» a «décimo», «metade», «dobro», «triplo», «terço»;
- unidades: «ano», «anos», «mês», «meses», «dia», «dias», «semana», «semanas», «euro», «euros», «por cento»;
- palavras comparativas ou de causa: «mais», «menos», «aumentou», «aumentaram», «reduziu», «reduziram», «alargou», «alargaram», «encurtou», «encurtaram», «subiu», «subiram», «desceu», «desceram», «passou de», «endureceu», «facilitou», «por causa», «devido», «graças», «para que», «com o objetivo»;
- adjetivos de mérito e rótulos: «mais dura», «mais duro», «restritiva» (e «restritiv-»), «generosa» (e «generos-»), «polémica» (e «polémic-»), «controversa» (e «controvers-»), «histórica», «maioria de esquerda», «maioria de direita», «oposição», «geringonça», «chumbou» (e «chumb-»), «travou», «luz verde», «vencedores» (e «vencedor-»), «derrotados» (e «derrotad-»), «lei do» ou «proposta do» seguido de uma sigla, «escrito por» seguido de uma sigla, «%».
<!-- pts:ignorar-fim -->

Para dizer o que um ato fez à lei, use «mudou», «acrescentou», «revogou», «retificou» ou «renumerou». Na mesma frase, ponha a ligação à redação.

### 8.4. Nomes de ferramentas

Não escreva o nome da ferramenta automática nem da empresa que a fornece. Para dizer como o texto foi preparado, escreva «com ajuda de uma ferramenta automática».

## 9. Exemplos

<!-- pts:ignorar-inicio -->
| Não escreva | Escreva |
|---|---|
| Descubra a história completa de cada artigo de forma intuitiva! | Veja todas as redações de um artigo. |
| O artigo foi alterado pela Lei n.º 64/2025, sendo que a nova taxa só se aplica a partir de 2028. | A Lei n.º 64/2025 alterou o artigo. A nova taxa aplica-se a períodos que começam a partir de 2028. |
| Procedemos à verificação do texto junto do Diário da República. | Verificamos o texto com o Diário da República. |
| Esta versão do art. 87.º… | Esta redação do artigo 87.º… |
| Nesta data aplica-se uma norma transitória; a taxa é de 19 %. | Nesta data aplica-se uma norma transitória. A taxa é de 19 %. |
| Clique aqui para salvar o arquivo. | Guardar o ficheiro |
<!-- pts:ignorar-fim -->
