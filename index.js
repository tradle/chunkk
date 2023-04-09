const { getChatGPTResponseForForm } = require('./openAiTestBoard')
const { chunkAndSummarize } = require('./chunkk')
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const HELP = `
Usage:

  node index.js --input [filePath]

Options:

  --input, -i      path/to/models directory

`

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
  }
})

const { input } = argv
const tasks = []

if (input) {
  ;(async () => {
     const summary = await chunkAndSummarize(input, openai)
  })(input)
}
else {
  ;(async () => {
    let response = await getChatGPTResponseForForm({ message: PAGES, openai });
    console.log(response)
    debugger
  })();
}