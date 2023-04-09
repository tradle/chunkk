# chunkk
Generating dataset for finetuning pre-trained GPT models

## Usage
```
node --input [inputFilePath] --output [outputFilePath] --numIterations [number]`
```

**input** _(requred)_ - the file path for `txt` (for example a book, or documentation)  
**output** - file path for the generated JSON file // default output.json  
**numIterations** - how many times you want to ask for questions for each chunk // default 3  



### Here is how it works:
- Takes a big text file
- Splits it in chunks 2000 tokens each
- For each chunk it does the following: 
   - Request for ChatGPT to create a set of questions. The same request repeated in total `numberOfIterations` times. Every request returns about 8-10 question. So the n umber of questions will be about `numberOfIterations * 10`
   - All these questions are then fed as a prompt to ChatGPT for answers.
   - The last request is a summary for this chunk of text
- All questions, answers and summaries are recorded in JSON format in file **outputFile** unless you specified the


_Note: This is not going to work for huge files for now, since the reading of the file is done with fs.readFileSync_


