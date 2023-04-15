// Import required modules
const fs = require('fs');
const { countTokens, splitTextIntoChunks, MAX_TOKENS } = require('./utils')
// debugger
// Define number of times to repeat question generation
var NUMBER_OF_ITERATIONS = 3
var CHAT_GPT_MODEL = 'gpt-3.5-turbo'

// Function to split text into chunks and summarize each chunk using OpenAI's GPT-3 API
async function chunkAndSummarize({input, output, numIterations, numTokens, model, openai}) {
  // Read text from file
  let text =  fs.readFileSync(input, 'utf-8');
  if (model)
    CHAT_GPT_MODEL = model
  if (numTokens)
    MAX_TOKENS = numTokens

  const stream = fs.createWriteStream(output || 'output.json') //, { flags: 'a' }); // create a writable stream to a file, append to the end of the file
  if (numIterations)
    NUMBER_OF_ITERATIONS = numIterations
  // Split text into chunks
  const textChunks = splitTextIntoChunks(text);
console.log (`Chunks: ${textChunks.length}`)
  writeToStream('[', stream)
  // Generate questions and summaries for each chunk using OpenAI's GPT-3 API
  const questionsAndSummaries = await getQuestionsAndSummariesRecursive({textChunks, openai, stream});
  writeToStream('\n]', stream)
  debugger
  stream.end();
}

// Function to count the number of tokens in a given text
// function countTokens(text) {
//   const tokens = encode(text);
//   return tokens.length;
// }

async function getQuestionsAndSummariesRecursive({textChunks, openai, stream}) {
  let { summaries } = await getQuestionsAndSummaries({textChunks, openai, stream})
  if (summaries.length === 1  &&  textChunks.length === 1) {
    debugger
    return
  }

  let text = summaries.join('\n')
  let chunks = splitTextIntoChunks(text)
  await getQuestionsAndSummariesRecursive({textChunks: chunks, openai, stream})
}
// Function to generate questions and summaries for each chunk using OpenAI's GPT-3 API
async function getQuestionsAndSummaries({textChunks, openai, stream}) {
  let summaries = []
  let summaryInstruction = 'Please summarize the following chunk of text'

  for (j=0; j<textChunks.length; j++) {
    let chunk = textChunks[j];

    let questionsRequests = []
    // Generate a set of questions for the chunk multiple times
    for (let i=0; i<NUMBER_OF_ITERATIONS; i++)
      questionsRequests.push(getQuestions({chunk, openai, first: !i }))

    let allQuestionResponses = await Promise.all(questionsRequests)
    // Generate a summary of the chunk
    let summary = await getSummary({chunk, openai});
    summaries.push(summary)
    let allQuestions = []
    allQuestionResponses.forEach(questionsArray => {
      // let questionsArray = q.split('\n')
      allQuestions = [...allQuestions, ...questionsArray]
    })
    let allAnswerResponses = await Promise.all(allQuestions.map(q => getAnswers({openai, chunk, question:q})))
// debugger
    allAnswerResponses.forEach((a, i) => {
      let qa = JSON.stringify({
        instruction: allQuestions[i],
        input: chunk,
        output: a
      }, null, 2)
      writeToStream(`\n${qa},`, stream)
    })
    let s = JSON.stringify({
      instruction:summaryInstruction,
      input: chunk,
      output: summary
    }, null, 2)
    if (textChunks.length === 1)
      writeToStream(`\n${s}`, stream)
    else
      writeToStream(`\n${s},`, stream)
  }
  return { summaries }
}
async function getQuestions({chunk, openai, first}) {
  let content
  if (first)
    content = `Please create a set of questions for the following chunk of text:\n\n${chunk}\n`
  else
    content = `Please create some more questions for the following chunk of text:\n\n${chunk}\n`

  let completion = await openai.createChatCompletion({
    model: CHAT_GPT_MODEL,
    temperature: 0.2,
    messages: [
      {role: 'system', content},
      {role: 'user', content: chunk}
    ]
  })
  let response = completion.data.choices[0].message
  let questions = response.content.split('\n').map(q => q.replace(/^[^a-zA-Z]+/, ''))

  return questions
}

// Function to generate either a summary or a set of questions for a given chunk using OpenAI's GPT-3 API
async function getAnswers({openai, chunk, question}) {
  let content = `Please answer to this ${question} for the text:\n\n${chunk}`

  let completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    temperature: 0.2,
    messages: [
      {role: 'system', content},
      {role: 'user', content: question}
    ]
  })

  let response = completion.data.choices[0].message
  return response.content
}
async function getSummary({chunk, openai}) {
  let content = `Please summarize the following chunk of text:\n\n${chunk}\n`

  let completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    temperature: 0.2,
    messages: [
      {role: 'system', content},
      {role: 'user', content: chunk}
    ]
  })

  let response = completion.data.choices[0].message
  return response.content
}

function writeToStream(data, stream) {
  stream.write(data); // write data to the stream
}

module.exports = {
  chunkAndSummarize
}


/*
For quiz:

I will give you a piece of text from the book The Truth of Fact, the Truth of Feeling by Ted Chiang.
I will ask question and you will create a quiz for this question.
Then you will explain the logic for picking the answer in the quiz and lay out the logic for why other answers are not right
*/

