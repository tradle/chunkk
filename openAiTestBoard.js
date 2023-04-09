const Promise = require('bluebird')
const { Configuration, OpenAIApi } = require('openai')
const { isEqual, cloneDeep, uniqBy, mergeWith, isArray } = require('lodash')
const { encode } = require('gpt-3-encoder')

async function getChatGPTResponseForForm({message}) {
  let api = new Configuration({ apiKey: "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" })
  const openai = new OpenAIApi(api)

  let props = {
    companyName: '',
    state: '',
    directors: [
      {
        firstName: '',
        lastName: '',
        jobTitle: []
      }
    ],
    shareHolders: [
      {
        firstName: '',
        lastName: '',
        numberOfShares: '',
        companyName: ''
      }
    ]
  }

  let json = JSON.stringify(props)
//   let sysMessage = `
// You are a JSON created machine.
// \n# You are allowed to produce only valid JSON.
// \n# You are not allowed to produce invalid JSON.
// \n# Please use the tokens to fill in the values for the properties in the JSON template below.
// \n# The tokens are from the articles of association document. Please extract as much information as possible in accordance with JSON template.
// \n# Do not add any new properties outside of the template.
// \n# If there is no relevant information found, please return the original JSON template.
// \n# You are not allowed to override in JSON the existing values.
// \n# If applicable, include currency symbol if present for these properties purchasePrice}
// \n# Return countries as two letter country code in ISO 3166 format.
// \n# Here is the template:
// \n ${json}
// `

let sysMessageJson = {
  "task": "You are a JSON creating machine!",
  "taskRules": [
    "You are not allowed to produce invalid JSON.",
    "Please use the tokens to fill in the values for the properties in the JSON template below",
    "The tokens are from the articles of association document. Please extract as much information as possible in accordance with JSON template",
    "You are not allowed to add any new properties outside of the template",
    "Return the original JSON template if there is no relevant information found",
    "You are not allowed to override in JSON the existing values.",
    "If applicable, include currency symbol if present for these properties purchasePrice",
    "Return countries as two letter country code in ISO 3166 format."
  ],
  "JSON": `${json}`
}
let sysMessage = JSON.stringify(sysMessageJson)

  let responses = await Promise.all(message.map(msg => {
    let sysCnt = countTokens(sysMessage)
    let msgCnt = countTokens(msg)
    let messages = [
      { role: 'system', content: sysMessage },
      { role: 'user', content: `${msg}` }
    ]

    return getResponse({ openai, messages })
  }))
  let ret = []
  responses.forEach(r => {
    try {
      let val = r.content.trim()
      let v = JSON.parse(val)
      if (!isEqual(props, v))
        ret.push(v)
    } catch (err) {
      debugger
    }
  })

//   for (let i=0; i<message.length; i++) {
// let sysCnt = countTokens(sysMessage)
// let msgCnt = countTokens(message[i])
//     if (!message[i].length) continue

//     let messages = [
//       { role: 'system', content: sysMessage },
//       { role: 'user', content: `${message[i]}` }
//     ]

//     let response = await getResponse({ openai, messages })
//     try {
//       let val = response.content.trim()
//       let v = JSON.parse(val)
//       if (isEqual(props, v))
//         continue
//       ret.push(v)
//     } catch (err) {
//       debugger
//     }

//   }
  if (ret.length)
    return makeResponse(ret, props)
}
function makeResponse(responses, props) {
  let result = cloneDeep(props)
  for (let i=0; i<responses.length; i++) {
    let res = responses[i]
    for (let p in res) {
      if (!Object.prototype.hasOwnProperty.call(props, p))
        delete res[p]
    }
    // result = mergeObjects(res, result)
    result = mergeWith(result, res, (a,b) => {
      if (isArray(a))
        mergeObjectsArray(a, b)
        // return arrayUnique(a.concat(b))
      else if (typeof a === 'string') {
        if (!a.length) return b
        if (!b.length) return a
      }
    })
  }

  return result
}
function mergeObjectsArray(arr1, arr2) {
  const mergedArray = [];
  const keysToMerge = ["positions", "shares"]; // Array properties to merge

  // Loop through objects in first array and add to merged array
  arr1.forEach((obj1) => {
    const matchedObjIndex = arr2.findIndex(
      (obj2) => JSON.stringify(obj1) === JSON.stringify(obj2)
    );
    if (matchedObjIndex !== -1) {
      // If an identical object exists in second array, merge the array properties
      keysToMerge.forEach((key) => {
        if (Array.isArray(obj1[key]) && Array.isArray(arr2[matchedObjIndex][key])) {
          const mergedArray = [...new Set([...obj1[key], ...arr2[matchedObjIndex][key]])];
          obj1[key] = mergedArray;
          arr2[matchedObjIndex][key] = mergedArray;
        }
      });
      mergedArray.push(obj1);
      arr2.splice(matchedObjIndex, 1);
    } else {
      mergedArray.push(obj1);
    }
  });

  // Add any remaining objects from second array to merged array
  arr2.forEach((obj2) => {
    mergedArray.push(obj2);
  });

  return mergedArray;
}

// eslint-disable-next-line func-style
async function getResponse({openai, messages}) {
  try {
    let completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 0.2,
      messages
    })
    return completion.data.choices[0].message
    // let response = completion.data.choices[0].message
    // return response.content.trim()
  } catch (error) {
    const { status, data } = error.response
    if (error.response) {
      if (status === 429) {
        let { message } = data.error
        let idx = message.indexOf(' request ID ')
        if (idx !== -1) {
          let idx1 = message.indexOf(' ', idx + 12)
          return message.slice(idx, idx1)
        }
      }
      console.log(status, data);
      debugger
    } else {
      console.log(`Error with OpenAI API request: ${error.message}`);
    }
    if (data.error.message.startsWith('This model\'s maximum context length is 4096 tokens')) {
      // let messegesStr = messages.map(m => m.content).join(' ')
      debugger
    }
  }
}
function countTokens(text) {
  const tokens = encode(text);
  return tokens.length;
}


// (async () => {
//   let response = await getChatGPTResponseForForm({ message: PAGES });
//   console.log(response)
//   debugger
// })();

/*
let sysMessage = `
You are a JSON created machine.
\n# You are not allowed to produce invalid JSON.
\n# Please use the tokens to fill in the values for the properties in the JSON template below.
\n# Do not add any new properties outside of the template.
\n# If there is no relevant information found, please return the original JSON template.
\n# You are not allowed to override in JSON the existing values.
\n# If applicable, include currency symbol if present for these properties purchasePrice}
\n# Return countries as two letter country code in ISO 3166 format.
\n# Here is the template:
\n ${json}
`
*/

const r = {
  "companyName":"Tradle, Inc",
  "state":"Delaware",
  "positions":[
    {"firstName":"Gene","lastName":"Vayngrib","jobTitle":[
      "President","Chairperson of the Board","Chief Technology Officer"
    ]},
    {"firstName":"Ellen","lastName":"Katsnelson","jobTitle":["Secretary"]},
    {"firstName":"Mark","lastName":"Vayngrib","jobTitle":["Chief Financial Officer"]}],
    "shares":[{"firstName":"","lastName":"","numberOfShares":""}]
}

const resp = {
  "companyName": "",
 "state": "",
 "positions": [
    {
     "firstName": "",
   "lastName": "",
   "jobTitle": []
  }
 ],
 "shares": [
    {
     "firstName": "Gene",
   "lastName": "Vayngrib",
   "numberOfShares": "3,200,000"
  },
  {
     "firstName": "Ellen",
   "lastName": "Katsnelson",
   "numberOfShares": "2,600,000"
  },
  {
     "firstName": "Mark",
   "lastName": "Vayngrib",
   "numberOfShares": "2,600,000"
  },
  {
     "firstName": "Boris",
   "lastName": "Portnoy",
   "numberOfShares": "890,000"
  },
  {
     "firstName": "Simon",
   "lastName": "Wilkinson",
   "numberOfShares": "300,000"
  },
  {
     "firstName": "Artem",
   "lastName": "Portnoy",
   "numberOfShares": "300,000"
  },
  {
     "firstName": "Igor",
   "lastName": "Levin",
   "numberOfShares": "100,000"
  },
  {
     "firstName": "Eugene",
   "lastName": "Kovnatsky",
   "numberOfShares": "10,000"
  }
]
};


// function arrayUnique(array) {
//   var a = array.concat();
//   for(var i=0; i<a.length; ++i) {
//       for(var j=i+1; j<a.length; ++j) {
//           if(a[i] === a[j])
//               a.splice(j--, 1);
//       }
//   }

//   return a;
// };
// // mergeObj()

// function mergeObjects(obj1, obj2) {
//   const merged = { ...obj1 };
//   for (const key in obj2) {
//     if (merged.hasOwnProperty(key)) {
//       if (Array.isArray(merged[key]) && Array.isArray(obj2[key])) {
//         merged[key] = [...merged[key], ...obj2[key]];
//       } else if (typeof merged[key] === "object" && typeof obj2[key] === "object") {
//         merged[key] = mergeObjects(merged[key], obj2[key]);
//       } else if (obj2[key].length) {
//         merged[key] = obj2[key];
//       }
//     } else if (obj2[key].length) {
//       merged[key] = obj2[key];
//     }
//   }
//   return merged;
// }
module.exports = {
  getChatGPTResponseForForm
}