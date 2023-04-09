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
  --output, -o      path/to/models directory
  --numIterations, -n   number of oterations for questioning ChatGPT

`

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
  }
})

const { input, output, numIterations } = argv
const tasks = []

if (input) {
  ;(async () => {
     const summary = await chunkAndSummarize({input, output, numIterations, openai})
  })(input)
}
