const { encode, decode } = require('gpt-3-encoder');
var MAX_TOKENS = 2000

function countTokens(text) {
  const tokens = encode(text);
  return tokens.length;
}
// Function to split text into chunks based on token count
function splitTextIntoChunks(text) {
  const chunks = [];

  let currentChunk = '';
  let tokens = 0;

  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    // Count the number of tokens in the paragraph
    const paragraphTokens = countTokens(paragraph);
    // console.log("patagraph tokens: ", paragraphTokens);

    // If the paragraph would push the token count over the limit, split it into sentences and add each sentence to a new chunk
    if (tokens + paragraphTokens > MAX_TOKENS) {
      const sentences = paragraph.split(/[.!?]+/);

      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence);

        if (tokens + sentenceTokens > MAX_TOKENS) {
          chunks.push(currentChunk);
          // console.log('Chunk created (sentence split):', currentChunk);
          // console.log("");
          currentChunk = sentence;
          tokens = sentenceTokens;
        } else {
          currentChunk += sentence;
          tokens += sentenceTokens;
        }
      }
    } else {
      // Otherwise, add the paragraph to the current chunk
      currentChunk += paragraph;
      tokens += paragraphTokens;
    }
  }

  // Add the final chunk to the array of chunks
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

module.exports = {
  countTokens,
  splitTextIntoChunks,
  MAX_TOKENS
}