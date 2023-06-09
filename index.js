const { chunkAndSummarize } = require('./chunkk')
const { getChatGPTResponseForForm } = require('./promptTesting')
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const HELP = `
Usage:

  node index.js --input [filePath]

Options:

  --help, -h       Show usage

For generating dataset for fine tuning pre-trained GPT models

  --input, -i       path file with main content
  --output, -o      path to output file
  --numTokens, -t   max number of tokens for the models
  --model, -m       ChatGPT model
  --numIterations, -n   number of iterations for questioning ChatGPT

For prompt testing

  --input, -i       path file with main content
  --prompt, -p      path to the file that contains the prompt in a valid JSON format. This is the one to tweak.
  --template, -l    path to the file that has JSON that needs to be filled by ChatGPT
  --numTokens, -t   max number of tokens for the models
  --model, -m       ChatGPT model
`
// node --inspect-brk index.js  -n 1 -o '../Downloads/Ted.json' -t 2500 -i '../Downloads/TedChiang-The truth of fact the truth of feeling.txt'

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
    o: 'output',
    t: 'numTokens',
    n: 'numIterations',
    m: 'model',
    p: 'prompt',
    l: 'template',
    h: "help"
  }
})

const { input, output, numIterations, help, model, numTokens, template, prompt } = argv
const tasks = []
if (help)
  console.log(HELP)
else if (prompt  && template) {
  ;(async () => {
    let response = await getChatGPTResponseForForm({ input, template, prompt, model, numTokens, openai });
    console.log(response)
    debugger
  })();

}
else if (input) {
  ;(async () => {
     const summary = await chunkAndSummarize({input, output, numIterations, model, numTokens, openai})
  })(input)
}
