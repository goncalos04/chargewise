# ChargeWise

PWA em português de Portugal para comparar tarifários de carregamento. HTML, CSS e JavaScript sem dependências de execução. Os dados ficam no navegador, sem conta ou backend.

## Avaliar um carregamento

No simulador, escolhe o tarifário que tens à frente e indica a energia e a duração. O resultado mostra o custo total e a diferença para a referência escolhida. No Kia, a referência é o custo da gasolina para percorrer a mesma distância. No B10, define o máximo que aceitas pagar por kWh. A comparação entre operadores fica em **Comparar todos os operadores**.

## Executar e testar

Requer Python 3 para o servidor local e Node.js 22 ou posterior para os testes.

```sh
npm test
npm start
```

Abre [http://localhost:8000](http://localhost:8000). Também podes servir a pasta `docs/` com `python3 -m http.server 8000 --directory docs`.

## Publicar gratuitamente

Num repositório público do GitHub, abre **Settings → Pages**. Escolhe **Deploy from a branch**, seleciona o ramo `main` e a pasta `/docs`, e guarda. Abre o endereço HTTPS apresentado pelo GitHub depois de terminar a publicação. Consulta a [documentação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Também podes publicar o conteúdo de `docs/` num alojamento estático com HTTPS. Os caminhos relativos suportam publicação numa subpasta. Ao atualizar ficheiros da aplicação, incrementa a versão em `docs/sw.js` para renovar a cache.

## Instalar no Android

Abre o endereço publicado no Chrome com ligação à Internet. Usa o botão **Instalar** quando aparecer ou abre o menu do Chrome e procura **Instalar aplicação** ou **Adicionar ao ecrã principal**. Depois do primeiro carregamento, experimenta abrir a aplicação em modo de avião. Consulta a [ajuda do Chrome](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid).

## Regras de cálculo

- Multiplica o preço unitário pela energia faturada pelo posto, pelos minutos faturados ou por uma sessão.
- Acrescenta IVA apenas às componentes assinaladas como tendo preço sem IVA. Aplica o desconto percentual às componentes assinaladas. Depois, abate o crédito até ao valor das componentes elegíveis após desconto.
- Arredonda o total da sessão ao cêntimo. O preço efetivo por kWh usa o total arredondado. O custo por 100 km usa o consumo de energia da rede, incluindo perdas, configurado para o veículo. Arredondamentos e regras de faturação do operador podem alterar o valor real.
- A estimativa automática divide a energia pela menor potência máxima entre posto e veículo no modo AC ou DC e arredonda para cima ao minuto. Usa a duração manual para simular a curva de carregamento, limitações de potência, estacionamento ou duração faturada.
- A comparação do Kia usa preço da gasolina × consumo em l/100 km. Os consumos, potências e preço da gasolina iniciais são valores editáveis para simulação.
- O crédito corresponde ao saldo disponível que introduzes para simular uma sessão. O registo de uma sessão não deduz o saldo automaticamente.

### Exemplo inicial

Sessão manual de **7 kWh em 120 min**. Neste exemplo os preços estão configurados com IVA incluído e o desconto Telpark incide só sobre a energia. Ambas as hipóteses podem ser editadas por componente.

| Tarifário | Cálculo | Total |
| --- | --- | --- |
| Electroverse | 7 × 0,42 € + 0,30 €, com 3,24 € de crédito utilizado | 0,00 € |
| Telpark | 7 × 0,59 € × 0,85 + 120 × 0,043 € | 8,67 € |

Sem crédito, o Electroverse fica a **3,24 €**. Se os 15% também incidirem sobre o OPC, o Telpark fica a **7,90 €**. A duração automática do Kia a 3,3 kW é **128 min** para 7 kWh.

## Dados e organização

- `docs/finance.js` contém os cálculos.
- `docs/data.js` trata da persistência, cópias e validação.
- `docs/app.js` gere a interface.
- `docs/sw.js` e `docs/manifest.webmanifest` dão suporte ao modo offline e à instalação.
- `tests/` verifica as regras financeiras e as cópias de segurança.

Exporta um JSON ou CSV em **Definições**. O CSV utiliza UTF-8, ponto e vírgula como delimitador e um cabeçalho próprio. A importação atualiza tarifários e sessões pelo identificador, preserva os restantes e usa as definições e os veículos do ficheiro. Se limpares os dados do navegador ou mudares de endereço de alojamento, importa a cópia para recuperar os dados.
