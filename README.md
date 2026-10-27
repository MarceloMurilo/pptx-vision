# pptx-vision

Teste: uma LLM com visão consegue entender um PowerPoint, incluindo as imagens que estão dentro dele?

Resposta curta: **sim, desde que o `.pptx` seja aberto antes**. Mandar o arquivo cru para a API só entrega um pedaço do texto e nenhuma imagem.

## Como funciona

Não há OCR nem modelo de visão separado. É só isto:

1. Um `.pptx` é um **zip** de XML e mídia. O `read-pptx.mjs` abre o zip com `jszip`.
2. Lê `ppt/presentation.xml` e suas relações para achar a **ordem real dos slides**.
3. Para cada slide extrai:
   - o **texto** (`<a:t>`), que é exato porque já está gravado no arquivo;
   - as **notas do apresentador**;
   - os **dados de gráficos nativos** (séries, categorias e valores em `ppt/charts`);
   - as **imagens** de `ppt/media`, seguindo as relações de cada slide.
4. Confere o formato real de cada imagem pelos bytes (a extensão pode mentir) e **conserta PNGs cortados** com `sharp`.
5. Monta uma única mensagem para a API Responses da OpenAI: o texto de cada slide como `input_text` e as imagens como `input_image` (data URL), na ordem dos slides, mais a pergunta.
6. É o próprio modelo multimodal que olha os pixels e lê o texto que aparece nas imagens.

## Rodar

```bash
npm install
export OPENAI_API_KEY=...        # ou OPENAI_MODEL=... para trocar o modelo (padrão gpt-5.6-luna)
node server.mjs                  # abre http://localhost:5180
```

Solte um `.pptx` na página: à esquerda a resposta da IA, à direita o que foi extraído de cada slide.

Linha de comando, comparando "arquivo cru" e "slides extraídos":

```bash
npm run sample                   # gera sample/teste.pptx (precisa de Python + Pillow)
node ask.mjs sample/teste.pptx "Descreva cada slide e as imagens"
```

Se `OPENAI_API_KEY` não estiver definida, o código tenta ler `../rabiscadraw/.env` (projeto irmão do autor). A chave nunca é impressa nem enviada ao navegador.

## O que se viu

| | `.pptx` cru (`input_file`) | Slides extraídos |
|---|---|---|
| Imagens | não vê nenhuma | descreve e lê números e textos |
| Ordem dos slides | embaralha | correta |
| Gráfico nativo | acha os números, não entende que é gráfico | entende série, meses e valores |

Um erro real: leu "Legacy COBOL" onde a imagem dizia "Legado COBOL". Para texto miúdo ou números que não podem errar, vale combinar com OCR ou usar o texto original.

## Limites

- Só `.pptx` (não o `.ppt` antigo).
- Formas desenhadas dentro do slide (caixas e setas do PowerPoint) viram só texto, o layout não é visto. Para isso seria preciso renderizar cada slide em imagem (por exemplo com LibreOffice).
- Imagens `.emf`, `.wmf`, SVG, HEIC e TIFF não são aceitas pela API e são puladas, com aviso.
- O servidor escuta só em `127.0.0.1`, sem autenticação: é uma ferramenta local, não para expor na internet.
