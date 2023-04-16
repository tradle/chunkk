const Promise = require('bluebird')
const fs = require('fs');
const { Configuration, OpenAIApi } = require('openai')
const { isEqual, cloneDeep, uniqBy, mergeWith, isArray } = require('lodash')
const { encode } = require('gpt-3-encoder')
const { countTokens, splitTextIntoChunks } = require('./utils')

async function getChatGPTResponseForForm({ input, template, prompt, model, numTokens, openai }) {
  let document =  fs.readFileSync(input, 'utf-8');

  let chunks = splitTextIntoChunks(document, numTokens)

  let json =  fs.readFileSync(template, 'utf-8');
  let props = JSON.parse(json)
  let sysMessage = fs.readFileSync(prompt, 'utf-8')
  let sysMessageJson = JSON.parse(sysMessage)
  sysMessageJson.JSON = json

  // let props = {
  //   companyName: '',
  //   state: '',
  //   directors: [
  //     {
  //       firstName: '',
  //       lastName: '',
  //       jobTitle: []
  //     }
  //   ],
  //   shareHolders: [
  //     {
  //       firstName: '',
  //       lastName: '',
  //       numberOfShares: '',
  //       companyName: ''
  //     }
  //   ]
  // }

  // let json = JSON.stringify(props)
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

// let sysMessageJson = {
//   "task": "You are a JSON creating machine!",
//   "taskRules": [
//     "You are not allowed to produce invalid JSON.",
//     "Please use the tokens to fill in the values for the properties in the JSON template below",
//     "The tokens are from the articles of association document. Please extract as much information as possible in accordance with JSON template",
//     "You are not allowed to add any new properties outside of the template",
//     "Return the original JSON template if there is no relevant information found",
//     "You are not allowed to override in JSON the existing values.",
//     "If applicable, include currency symbol if present for these properties purchasePrice",
//     "Return countries as two letter country code in ISO 3166 format."
//   ],
//   "JSON": `${json}`
// }
  sysMessage = JSON.stringify(sysMessageJson)

  let responses = await Promise.all(chunks.map(msg => {
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


// (async () => {
//   let buf = fs.readFileSync(PATH)

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


  // ;(async () => {
  //   let response = await getChatGPTResponseForForm({ message: PAGES, openai });
  //   console.log(response)
  //   debugger
  // })();
// {}
// const PAGES = [
//   "\"ACTION BY UNANIMOUS WRITTEN CONSENT\",\"IN LIEU OF THE ORGANIZATIONAL MEETING\",\"OF THE BOARD OF DIRECTORS OF\",\"TRADLE, INC\",\"The undersigned, being all of the members of the Board of Directors (the \\\"Board\\\") of\",\"Tradle, Inc., a Delaware corporation (the \\\"Company\\\"), pursuant to Section 141(f) of\",\"the\",\"Delaware General Corporation Law, hereby adopt the following resolutions by unanimous\",\"written consent in lieu of an organizational meeting, which resolutions shall be deemed adopted\",\"when all of the members of the Board have signed this Consent.\",\"1.\",\"Ratification of Actions of Incorporator\",\"RESOLVED, that all acts performed and contracts or agreements entered into and all\",\"actions of any nature that have been taken or authorized with respect to the Company by\",\"the Company's incorporator (including, without limitation, the preparation, execution and\",\"arranging for the filing of the Company's Certificate of Incorporation attached hereto as\",\"Exhibit A (the \\\"Certificate\\\"), the election of the Company's initial director and adoption\",\"of the Company's bylaws) are approved, ratified and adopted as the Company's actions,\",\"and the Company hereby assumes all liability thereunder as though such acts or contracts\",\"had been performed or entered into initially by the Company.\",\"2.\",\"Adoption of Bylaws; Board Size\",\"RESOLVED, that the bylaws, previously approved by the incorporator and attached\",\"hereto as Exhibit B (the \\\"Bylaws\\\") are hereby ratified, approved and adopted as the\",\"Bylaws of and for the Company.\",\"RESOLVED FURTHER, that the Secretary of the Company is hereby authorized and\",\"directed to execute a Certificate of Adoption of the Bylaws, to insert the Bylaws as SO\",\"certified in the Company's Minute Book and to see that a copy of the Bylaws, similarly\",\"certified, is kept at the Company's principal office, as required by law.\",\"RESOLVED FURTHER, that pursuant to Section 3.2 of the Bylaws of the Company,\",\"the Board shall consist of three (3) director.\",\"3.\",\"Corporate Seal\",\"RESOLVED, that a corporate seal consisting of two concentric circles containing the\",\"words \\\"Tradle, Inc.\\\" and \\\"Delaware\\\" in the outer circle, and in the inner circle the word\",\"\\\"Incorporated\\\" together with the date of incorporation of the Company, is adopted as the\",\"LEGAL120777600.1\",\"ACTION\",\"BY\",\"UNANIMOUS\",\"WRITTEN\",\"CONSENT\",\"IN\",\"LIEU\",\"OF\",\"THE\",\"ORGANIZATIONAL\",\"MEETING\",\"OF\",\"THE\",\"BOARD\",\"OF\",\"DIRECTORS\",\"OF\",\"TRADLE,\",\"INC\",\"The\",\"undersigned,\",\"being\",\"all\",\"of\",\"the\",\"members\",\"of\",\"the\",\"Board\",\"of\",\"Directors\",\"(the\",\"\\\"Board\\\")\",\"of\",\"Tradle,\",\"Inc.,\",\"a\",\"Delaware\",\"corporation\",\"(the\",\"\\\"Company\\\"),\",\"pursuant\",\"to\",\"Section\",\"141(f)\",\"of\",\"the\",\"Delaware\",\"General\",\"Corporation\",\"Law,\",\"hereby\",\"adopt\",\"the\",\"following\",\"resolutions\",\"by\",\"unanimous\",\"written\",\"consent\",\"in\",\"lieu\",\"of\",\"an\",\"organizational\",\"meeting,\",\"which\",\"resolutions\",\"shall\",\"be\",\"deemed\",\"adopted\",\"when\",\"all\",\"of\",\"the\",\"members\",\"of\",\"the\",\"Board\",\"have\",\"signed\",\"this\",\"Consent.\",\"1.\",\"Ratification\",\"of\",\"Actions\",\"of\",\"Incorporator\",\"RESOLVED,\",\"that\",\"all\",\"acts\",\"performed\",\"and\",\"contracts\",\"or\",\"agreements\",\"entered\",\"into\",\"and\",\"all\",\"actions\",\"of\",\"any\",\"nature\",\"that\",\"have\",\"been\",\"taken\",\"or\",\"authorized\",\"with\",\"respect\",\"to\",\"the\",\"Company\",\"by\",\"the\",\"Company's\",\"incorporator\",\"(including,\",\"without\",\"limitation,\",\"the\",\"preparation,\",\"execution\",\"and\",\"arranging\",\"for\",\"the\",\"filing\",\"of\",\"the\",\"Company's\",\"Certificate\",\"of\",\"Incorporation\",\"attached\",\"hereto\",\"as\",\"Exhibit\",\"A\",\"(the\",\"\\\"Certificate\\\"),\",\"the\",\"election\",\"of\",\"the\",\"Company's\",\"initial\",\"director\",\"and\",\"adoption\",\"of\",\"the\",\"Company's\",\"bylaws)\",\"are\",\"approved,\",\"ratified\",\"and\",\"adopted\",\"as\",\"the\",\"Company's\",\"actions,\",\"and\",\"the\",\"Company\",\"hereby\",\"assumes\",\"all\",\"liability\",\"thereunder\",\"as\",\"though\",\"such\",\"acts\",\"or\",\"contracts\",\"had\",\"been\",\"performed\",\"or\",\"entered\",\"into\",\"initially\",\"by\",\"the\",\"Company.\",\"2.\",\"Adoption\",\"of\",\"Bylaws;\",\"Board\",\"Size\",\"RESOLVED,\",\"that\",\"the\",\"bylaws,\",\"previously\",\"approved\",\"by\",\"the\",\"incorporator\",\"and\",\"attached\",\"hereto\",\"as\",\"Exhibit\",\"B\",\"(the\",\"\\\"Bylaws\\\")\",\"are\",\"hereby\",\"ratified,\",\"approved\",\"and\",\"adopted\",\"as\",\"the\",\"Bylaws\",\"of\",\"and\",\"for\",\"the\",\"Company.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"Secretary\",\"of\",\"the\",\"Company\",\"is\",\"hereby\",\"authorized\",\"and\",\"directed\",\"to\",\"execute\",\"a\",\"Certificate\",\"of\",\"Adoption\",\"of\",\"the\",\"Bylaws,\",\"to\",\"insert\",\"the\",\"Bylaws\",\"as\",\"SO\",\"certified\",\"in\",\"the\",\"Company's\",\"Minute\",\"Book\",\"and\",\"to\",\"see\",\"that\",\"a\",\"copy\",\"of\",\"the\",\"Bylaws,\",\"similarly\",\"certified,\",\"is\",\"kept\",\"at\",\"the\",\"Company's\",\"principal\",\"office,\",\"as\",\"required\",\"by\",\"law.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"pursuant\",\"to\",\"Section\",\"3.2\",\"of\",\"the\",\"Bylaws\",\"of\",\"the\",\"Company,\",\"the\",\"Board\",\"shall\",\"consist\",\"of\",\"three\",\"(3)\",\"director.\",\"3.\",\"Corporate\",\"Seal\",\"RESOLVED,\",\"that\",\"a\",\"corporate\",\"seal\",\"consisting\",\"of\",\"two\",\"concentric\",\"circles\",\"containing\",\"the\",\"words\",\"\\\"Tradle,\",\"Inc.\\\"\",\"and\",\"\\\"Delaware\\\"\",\"in\",\"the\",\"outer\",\"circle,\",\"and\",\"in\",\"the\",\"inner\",\"circle\",\"the\",\"word\",\"\\\"Incorporated\\\"\",\"together\",\"with\",\"the\",\"date\",\"of\",\"incorporation\",\"of\",\"the\",\"Company,\",\"is\",\"adopted\",\"as\",\"the\",\"LEGAL120777600.1\"\"corporate seal of the Company, and the Secretary of the Company is instructed to impress\",\"such seal when such impression is required by law.\",\"4.\",\"Form of Stock Certificate\",\"RESOLVED, that the stock certificates representing shares of the Company's Common\",\"Stock (the \\\"Common Stock\\\") be in substantially the same form as the form of stock\",\"certificate attached hereto as Exhibit C.\",\"RESOLVED FURTHER, that such stock certificates shall be consecutively numbered\",\"beginning with No. CS-1; shall be issued only when the signature of the President and\",\"Secretary, or other such officers as provided in Section 158 of the Delaware General\",\"Corporation Law, are affixed thereto; and may also bear the corporate seal (if one has\",\"been adopted) and other wording related to the ownership, issuance and transferability of\",\"the shares represented thereby.\",\"5.\",\"Election of Directors\",\"RESOLVED, that the following persons are hereby elected as directors of the Company,\",\"to serve until their successors are duly elected and qualified:\",\"Gene Vayngrib\",\"Ellen Katsnelson\",\"Mark Vayngrib\",\"6.\",\"Appointment of Officers\",\"RESOLVED, that the following persons are hereby appointed as the Company's officers\",\"to the offices set forth opposite their respective names, each to serve until his or her\",\"death, resignation or removal from office, or until his or her respective successor is duly\",\"appointed and qualified:\",\"President\",\"Gene Vayngrib\",\"Chief Financial Officer\",\"Mark Vayngrib\",\"Secretary\",\"Ellen Katsnelson\",\"Chairperson of the Board\",\"Gene Vayngrib\",\"Chief Technology Officer\",\"Gene Vayngrib\",\"7.\",\"Authority of Officers to Enter Into Contracts\",\"RESOLVED, that the President and Chief Financial Officer are hereby authorized to sign\",\"and deliver any agreement in the Company's name and to otherwise obligate the\",\"Company in any respect relating to matters of the Company's business, and to delegate\",\"such authority in their discretion, subject to any budgets or limits as may be approved by\",\"the Board.\",\"-2-\",\"LEGAL120777600.1\",\"corporate\",\"seal\",\"of\",\"the\",\"Company,\",\"and\",\"the\",\"Secretary\",\"of\",\"the\",\"Company\",\"is\",\"instructed\",\"to\",\"impress\",\"such\",\"seal\",\"when\",\"such\",\"impression\",\"is\",\"required\",\"by\",\"law.\",\"4.\",\"Form\",\"of\",\"Stock\",\"Certificate\",\"RESOLVED,\",\"that\",\"the\",\"stock\",\"certificates\",\"representing\",\"shares\",\"of\",\"the\",\"Company's\",\"Common\",\"Stock\",\"(the\",\"\\\"Common\",\"Stock\\\")\",\"be\",\"in\",\"substantially\",\"the\",\"same\",\"form\",\"as\",\"the\",\"form\",\"of\",\"stock\",\"certificate\",\"attached\",\"hereto\",\"as\",\"Exhibit\",\"C.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"such\",\"stock\",\"certificates\",\"shall\",\"be\",\"consecutively\",\"numbered\",\"beginning\",\"with\",\"No.\",\"CS-1;\",\"shall\",\"be\",\"issued\",\"only\",\"when\",\"the\",\"signature\",\"of\",\"the\",\"President\",\"and\",\"Secretary,\",\"or\",\"other\",\"such\",\"officers\",\"as\",\"provided\",\"in\",\"Section\",\"158\",\"of\",\"the\",\"Delaware\",\"General\",\"Corporation\",\"Law,\",\"are\",\"affixed\",\"thereto;\",\"and\",\"may\",\"also\",\"bear\",\"the\",\"corporate\",\"seal\",\"(if\",\"one\",\"has\",\"been\",\"adopted)\",\"and\",\"other\",\"wording\",\"related\",\"to\",\"the\",\"ownership,\",\"issuance\",\"and\",\"transferability\",\"of\",\"the\",\"shares\",\"represented\",\"thereby.\",\"5.\",\"Election\",\"of\",\"Directors\",\"RESOLVED,\",\"that\",\"the\",\"following\",\"persons\",\"are\",\"hereby\",\"elected\",\"as\",\"directors\",\"of\",\"the\",\"Company,\",\"to\",\"serve\",\"until\",\"their\",\"successors\",\"are\",\"duly\",\"elected\",\"and\",\"qualified:\",\"Gene\",\"Vayngrib\",\"Ellen\",\"Katsnelson\",\"Mark\",\"Vayngrib\",\"6.\",\"Appointment\",\"of\",\"Officers\",\"RESOLVED,\",\"that\",\"the\",\"following\",\"persons\",\"are\",\"hereby\",\"appointed\",\"as\",\"the\",\"Company's\",\"officers\",\"to\",\"the\",\"offices\",\"set\",\"forth\",\"opposite\",\"their\",\"respective\",\"names,\",\"each\",\"to\",\"serve\",\"until\",\"his\",\"or\",\"her\",\"death,\",\"resignation\",\"or\",\"removal\",\"from\",\"office,\",\"or\",\"until\",\"his\",\"or\",\"her\",\"respective\",\"successor\",\"is\",\"duly\",\"appointed\",\"and\",\"qualified:\",\"President\",\"Gene\",\"Vayngrib\",\"Chief\",\"Financial\",\"Officer\",\"Mark\",\"Vayngrib\",\"Secretary\",\"Ellen\",\"Katsnelson\",\"Chairperson\",\"of\",\"the\",\"Board\",\"Gene\",\"Vayngrib\",\"Chief\",\"Technology\",\"Officer\",\"Gene\",\"Vayngrib\",\"7.\",\"Authority\",\"of\",\"Officers\",\"to\",\"Enter\",\"Into\",\"Contracts\",\"RESOLVED,\",\"that\",\"the\",\"President\",\"and\",\"Chief\",\"Financial\",\"Officer\",\"are\",\"hereby\",\"authorized\",\"to\",\"sign\",\"and\",\"deliver\",\"any\",\"agreement\",\"in\",\"the\",\"Company's\",\"name\",\"and\",\"to\",\"otherwise\",\"obligate\",\"the\",\"Company\",\"in\",\"any\",\"respect\",\"relating\",\"to\",\"matters\",\"of\",\"the\",\"Company's\",\"business,\",\"and\",\"to\",\"delegate\",\"such\",\"authority\",\"in\",\"their\",\"discretion,\",\"subject\",\"to\",\"any\",\"budgets\",\"or\",\"limits\",\"as\",\"may\",\"be\",\"approved\",\"by\",\"the\",\"Board.\",\"-2-\",\"LEGAL120777600.1\"",
//   "\"8.\",\"Common Stock Issuances\",\"RESOLVED, that the Board hereby determines, after consideration of all relevant\",\"factors, that the fair market value per share of the Common Stock as of the date hereof\",\"is\",\"equal to $0.0001.\",\"RESOLVED FURTHER, that the Company's officers be, and each of them hereby is,\",\"authorized and directed, for and on behalf of the Company, to sell and issue to the\",\"following purchasers the number of shares of Common Stock set forth opposite such\",\"purchaser's name, at the price of $0.0001 per share, payable by any of the following\",\"means (or any combination thereof): (i) cash or check, (ii) cancellation of indebtedness,\",\"(iii) assignment of technology or other rights, or (iv) contribution of assets.\",\"Form of\",\"Number\",\"Total\",\"Purchase\",\"Name of Purchaser\",\"of Shares\",\"Purchase Price\",\"Agreement\",\"Gene Vayngrib\",\"3,200,000\",\"$ 320.00\",\"Exhibit D-1\",\"Ellen Katsnelson\",\"2,600,000\",\"$ 260.00\",\"Exhibit D-1\",\"Mark Vayngrib\",\"2,600,000\",\"$ 260.00\",\"Exhibit D-1\",\"Boris Portnoy\",\"890,000\",\"$ 89.00\",\"Exhibit D-2\",\"Simon Wilkinson\",\"300,000\",\"$ 30.00\",\"Exhibit D-2\",\"Artem Portnoy\",\"300,000\",\"$ 30.00\",\"Exhibit D-2\",\"Igor Levin\",\"100,000\",\"$ 10.00\",\"Exhibit D-2\",\"Eugene Kovnatsky\",\"10,000\",\"$ 1.00\",\"Exhibit D-2\",\"RESOLVED FURTHER, that the shares of Common Stock authorized to be sold and\",\"issued by the Company individually to each purchaser named above shall be offered and\",\"sold under the terms of a Restricted Stock Purchase Agreement entered into by the\",\"Company and such purchaser, in substantially the form attached hereto as Exhibit D-1 or\",\"Exhibit D-2, as set forth in the table above, with such changes therein or additions\",\"thereto as the officer executing the same on behalf of the Company shall approve with the\",\"advice of legal counsel, the execution and delivery of such agreements by such officer to\",\"be conclusive evidence of the approval of the Board thereof and all matters relating\",\"thereto.\",\"RESOLVED FURTHER, that the Company's officers be, and each of them hereby is,\",\"authorized and directed, for and on behalf of the Company, to enter into the applicable\",\"form of stock purchase agreement with each purchaser and to take such further action and\",\"execute such documents as each may deem necessary or appropriate to carry out the\",\"purposes of the above resolutions, including, but not limited to, filings in accordance with\",\"all applicable state and federal securities laws.\",\"RESOLVED FURTHER, that upon receipt of the consideration set forth in the\",\"applicable stock purchase agreement, the shares of Common Stock issued to a purchaser\",\"pursuant to such stock purchase agreement shall be deemed validly issued, fully paid and\",\"nonassessable.\",\"-3-\",\"LEGAL120777600.1\",\"8.\",\"Common\",\"Stock\",\"Issuances\",\"RESOLVED,\",\"that\",\"the\",\"Board\",\"hereby\",\"determines,\",\"after\",\"consideration\",\"of\",\"all\",\"relevant\",\"factors,\",\"that\",\"the\",\"fair\",\"market\",\"value\",\"per\",\"share\",\"of\",\"the\",\"Common\",\"Stock\",\"as\",\"of\",\"the\",\"date\",\"hereof\",\"is\",\"equal\",\"to\",\"$0.0001.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"Company's\",\"officers\",\"be,\",\"and\",\"each\",\"of\",\"them\",\"hereby\",\"is,\",\"authorized\",\"and\",\"directed,\",\"for\",\"and\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"to\",\"sell\",\"and\",\"issue\",\"to\",\"the\",\"following\",\"purchasers\",\"the\",\"number\",\"of\",\"shares\",\"of\",\"Common\",\"Stock\",\"set\",\"forth\",\"opposite\",\"such\",\"purchaser's\",\"name,\",\"at\",\"the\",\"price\",\"of\",\"$0.0001\",\"per\",\"share,\",\"payable\",\"by\",\"any\",\"of\",\"the\",\"following\",\"means\",\"(or\",\"any\",\"combination\",\"thereof):\",\"(i)\",\"cash\",\"or\",\"check,\",\"(ii)\",\"cancellation\",\"of\",\"indebtedness,\",\"(iii)\",\"assignment\",\"of\",\"technology\",\"or\",\"other\",\"rights,\",\"or\",\"(iv)\",\"contribution\",\"of\",\"assets.\",\"Form\",\"of\",\"Number\",\"Total\",\"Purchase\",\"Name\",\"of\",\"Purchaser\",\"of\",\"Shares\",\"Purchase\",\"Price\",\"Agreement\",\"Gene\",\"Vayngrib\",\"3,200,000\",\"$\",\"320.00\",\"Exhibit\",\"D-1\",\"Ellen\",\"Katsnelson\",\"2,600,000\",\"$\",\"260.00\",\"Exhibit\",\"D-1\",\"Mark\",\"Vayngrib\",\"2,600,000\",\"$\",\"260.00\",\"Exhibit\",\"D-1\",\"Boris\",\"Portnoy\",\"890,000\",\"$\",\"89.00\",\"Exhibit\",\"D-2\",\"Simon\",\"Wilkinson\",\"300,000\",\"$\",\"30.00\",\"Exhibit\",\"D-2\",\"Artem\",\"Portnoy\",\"300,000\",\"$\",\"30.00\",\"Exhibit\",\"D-2\",\"Igor\",\"Levin\",\"100,000\",\"$\",\"10.00\",\"Exhibit\",\"D-2\",\"Eugene\",\"Kovnatsky\",\"10,000\",\"$\",\"1.00\",\"Exhibit\",\"D-2\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"shares\",\"of\",\"Common\",\"Stock\",\"authorized\",\"to\",\"be\",\"sold\",\"and\",\"issued\",\"by\",\"the\",\"Company\",\"individually\",\"to\",\"each\",\"purchaser\",\"named\",\"above\",\"shall\",\"be\",\"offered\",\"and\",\"sold\",\"under\",\"the\",\"terms\",\"of\",\"a\",\"Restricted\",\"Stock\",\"Purchase\",\"Agreement\",\"entered\",\"into\",\"by\",\"the\",\"Company\",\"and\",\"such\",\"purchaser,\",\"in\",\"substantially\",\"the\",\"form\",\"attached\",\"hereto\",\"as\",\"Exhibit\",\"D-1\",\"or\",\"Exhibit\",\"D-2,\",\"as\",\"set\",\"forth\",\"in\",\"the\",\"table\",\"above,\",\"with\",\"such\",\"changes\",\"therein\",\"or\",\"additions\",\"thereto\",\"as\",\"the\",\"officer\",\"executing\",\"the\",\"same\",\"on\",\"behalf\",\"of\",\"the\",\"Company\",\"shall\",\"approve\",\"with\",\"the\",\"advice\",\"of\",\"legal\",\"counsel,\",\"the\",\"execution\",\"and\",\"delivery\",\"of\",\"such\",\"agreements\",\"by\",\"such\",\"officer\",\"to\",\"be\",\"conclusive\",\"evidence\",\"of\",\"the\",\"approval\",\"of\",\"the\",\"Board\",\"thereof\",\"and\",\"all\",\"matters\",\"relating\",\"thereto.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"Company's\",\"officers\",\"be,\",\"and\",\"each\",\"of\",\"them\",\"hereby\",\"is,\",\"authorized\",\"and\",\"directed,\",\"for\",\"and\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"to\",\"enter\",\"into\",\"the\",\"applicable\",\"form\",\"of\",\"stock\",\"purchase\",\"agreement\",\"with\",\"each\",\"purchaser\",\"and\",\"to\",\"take\",\"such\",\"further\",\"action\",\"and\",\"execute\",\"such\",\"documents\",\"as\",\"each\",\"may\",\"deem\",\"necessary\",\"or\",\"appropriate\",\"to\",\"carry\",\"out\",\"the\",\"purposes\",\"of\",\"the\",\"above\",\"resolutions,\",\"including,\",\"but\",\"not\",\"limited\",\"to,\",\"filings\",\"in\",\"accordance\",\"with\",\"all\",\"applicable\",\"state\",\"and\",\"federal\",\"securities\",\"laws.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"upon\",\"receipt\",\"of\",\"the\",\"consideration\",\"set\",\"forth\",\"in\",\"the\",\"applicable\",\"stock\",\"purchase\",\"agreement,\",\"the\",\"shares\",\"of\",\"Common\",\"Stock\",\"issued\",\"to\",\"a\",\"purchaser\",\"pursuant\",\"to\",\"such\",\"stock\",\"purchase\",\"agreement\",\"shall\",\"be\",\"deemed\",\"validly\",\"issued,\",\"fully\",\"paid\",\"and\",\"nonassessable.\",\"-3-\",\"LEGAL120777600.1\"",
//   "\"9.\",\"Submission of Officer and Director Indemnification Provisions to Stockholders\",\"RESOLVED, that the Board deems it to be in the best interests of the Company and its\",\"stockholders, for the purpose of recruiting and retaining the services of qualified directors\",\"and officers, to indemnify its directors and officers to the fullest extent permitted by law,\",\"as contemplated by the Certificate and the Bylaws.\",\"RESOLVED FURTHER, that by virtue of the interests of the Company's directors in the\",\"provisions of Article 6 of the Company's Bylaws regarding indemnification of directors,\",\"officers, employees and agents, Article 6 of the Company's Bylaws is hereby ordered to\",\"be submitted to the Company's stockholders for consideration and ratification.\",\"10.\",\"Form of Indemnification Agreement\",\"RESOLVED, that in furtherance of the indemnification of directors and officers\",\"contemplated by the Certificate and the Bylaws, the Board deems it to be in the best\",\"interests of the Company and its stockholders for the Company to enter into\",\"indemnification agreements with its directors and with such officers, as determined by the\",\"Board, in substantially the form attached hereto as Error: Reference source not foundE.\",\"RESOLVED FURTHER, that the Company's officers are hereby authorized to execute\",\"and deliver an indemnification agreement on behalf of the Company, in substantially the\",\"form attached hereto as Error: Reference source not foundE, with each current and\",\"future director of the Company and with current and future officers of the Company as\",\"determined by the Board.\",\"11.\",\"Proprietary Information and Inventions Agreements\",\"RESOLVED, that the officers of the Company are authorized to enter into a Proprietary\",\"Information and Inventions Agreement on behalf of the Company, in substantially the\",\"form attached hereto as F, with each of the Company's employees.\",\"12.\",\"Issuance of Shares to JFE\",\"RESOLVED, that the officers of the Company are hereby authorized to sell and issue to\",\"Jews for Entrepreneurship (JFE), a California non-profit public benefit corporation, an\",\"aggregate of 222,223 shares of Common Stock at a price of $0.0001 per share, to be paid\",\"in cash.\",\"RESOLVED FURTHER, that such shares shall be issued and held subject to a stock\",\"purchase agreement in substantially the form attached hereto as G, with such changes\",\"therein or additions thereto as the officer executing the same shall approve, the execution\",\"and delivery of such agreement by such officer to be conclusive evidence of the approval\",\"of the Board thereof and all matters relating thereto (the \\\"JFE Stock Purchase\",\"Agreement\\\").\",\"RESOLVED FURTHER, that all of the shares to be issued by the Company in\",\"accordance with the foregoing resolutions shall be issued in compliance with the\",\"-4-\",\"LEGAL120777600.1\",\"9.\",\"Submission\",\"of\",\"Officer\",\"and\",\"Director\",\"Indemnification\",\"Provisions\",\"to\",\"Stockholders\",\"RESOLVED,\",\"that\",\"the\",\"Board\",\"deems\",\"it\",\"to\",\"be\",\"in\",\"the\",\"best\",\"interests\",\"of\",\"the\",\"Company\",\"and\",\"its\",\"stockholders,\",\"for\",\"the\",\"purpose\",\"of\",\"recruiting\",\"and\",\"retaining\",\"the\",\"services\",\"of\",\"qualified\",\"directors\",\"and\",\"officers,\",\"to\",\"indemnify\",\"its\",\"directors\",\"and\",\"officers\",\"to\",\"the\",\"fullest\",\"extent\",\"permitted\",\"by\",\"law,\",\"as\",\"contemplated\",\"by\",\"the\",\"Certificate\",\"and\",\"the\",\"Bylaws.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"by\",\"virtue\",\"of\",\"the\",\"interests\",\"of\",\"the\",\"Company's\",\"directors\",\"in\",\"the\",\"provisions\",\"of\",\"Article\",\"6\",\"of\",\"the\",\"Company's\",\"Bylaws\",\"regarding\",\"indemnification\",\"of\",\"directors,\",\"officers,\",\"employees\",\"and\",\"agents,\",\"Article\",\"6\",\"of\",\"the\",\"Company's\",\"Bylaws\",\"is\",\"hereby\",\"ordered\",\"to\",\"be\",\"submitted\",\"to\",\"the\",\"Company's\",\"stockholders\",\"for\",\"consideration\",\"and\",\"ratification.\",\"10.\",\"Form\",\"of\",\"Indemnification\",\"Agreement\",\"RESOLVED,\",\"that\",\"in\",\"furtherance\",\"of\",\"the\",\"indemnification\",\"of\",\"directors\",\"and\",\"officers\",\"contemplated\",\"by\",\"the\",\"Certificate\",\"and\",\"the\",\"Bylaws,\",\"the\",\"Board\",\"deems\",\"it\",\"to\",\"be\",\"in\",\"the\",\"best\",\"interests\",\"of\",\"the\",\"Company\",\"and\",\"its\",\"stockholders\",\"for\",\"the\",\"Company\",\"to\",\"enter\",\"into\",\"indemnification\",\"agreements\",\"with\",\"its\",\"directors\",\"and\",\"with\",\"such\",\"officers,\",\"as\",\"determined\",\"by\",\"the\",\"Board,\",\"in\",\"substantially\",\"the\",\"form\",\"attached\",\"hereto\",\"as\",\"Error:\",\"Reference\",\"source\",\"not\",\"foundE.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"Company's\",\"officers\",\"are\",\"hereby\",\"authorized\",\"to\",\"execute\",\"and\",\"deliver\",\"an\",\"indemnification\",\"agreement\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"in\",\"substantially\",\"the\",\"form\",\"attached\",\"hereto\",\"as\",\"Error:\",\"Reference\",\"source\",\"not\",\"foundE,\",\"with\",\"each\",\"current\",\"and\",\"future\",\"director\",\"of\",\"the\",\"Company\",\"and\",\"with\",\"current\",\"and\",\"future\",\"officers\",\"of\",\"the\",\"Company\",\"as\",\"determined\",\"by\",\"the\",\"Board.\",\"11.\",\"Proprietary\",\"Information\",\"and\",\"Inventions\",\"Agreements\",\"RESOLVED,\",\"that\",\"the\",\"officers\",\"of\",\"the\",\"Company\",\"are\",\"authorized\",\"to\",\"enter\",\"into\",\"a\",\"Proprietary\",\"Information\",\"and\",\"Inventions\",\"Agreement\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"in\",\"substantially\",\"the\",\"form\",\"attached\",\"hereto\",\"as\",\"F,\",\"with\",\"each\",\"of\",\"the\",\"Company's\",\"employees.\",\"12.\",\"Issuance\",\"of\",\"Shares\",\"to\",\"JFE\",\"RESOLVED,\",\"that\",\"the\",\"officers\",\"of\",\"the\",\"Company\",\"are\",\"hereby\",\"authorized\",\"to\",\"sell\",\"and\",\"issue\",\"to\",\"Jews\",\"for\",\"Entrepreneurship\",\"(JFE),\",\"a\",\"California\",\"non-profit\",\"public\",\"benefit\",\"corporation,\",\"an\",\"aggregate\",\"of\",\"222,223\",\"shares\",\"of\",\"Common\",\"Stock\",\"at\",\"a\",\"price\",\"of\",\"$0.0001\",\"per\",\"share,\",\"to\",\"be\",\"paid\",\"in\",\"cash.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"such\",\"shares\",\"shall\",\"be\",\"issued\",\"and\",\"held\",\"subject\",\"to\",\"a\",\"stock\",\"purchase\",\"agreement\",\"in\",\"substantially\",\"the\",\"form\",\"attached\",\"hereto\",\"as\",\"G,\",\"with\",\"such\",\"changes\",\"therein\",\"or\",\"additions\",\"thereto\",\"as\",\"the\",\"officer\",\"executing\",\"the\",\"same\",\"shall\",\"approve,\",\"the\",\"execution\",\"and\",\"delivery\",\"of\",\"such\",\"agreement\",\"by\",\"such\",\"officer\",\"to\",\"be\",\"conclusive\",\"evidence\",\"of\",\"the\",\"approval\",\"of\",\"the\",\"Board\",\"thereof\",\"and\",\"all\",\"matters\",\"relating\",\"thereto\",\"(the\",\"\\\"JFE\",\"Stock\",\"Purchase\",\"Agreement\\\").\",\"RESOLVED\",\"FURTHER,\",\"that\",\"all\",\"of\",\"the\",\"shares\",\"to\",\"be\",\"issued\",\"by\",\"the\",\"Company\",\"in\",\"accordance\",\"with\",\"the\",\"foregoing\",\"resolutions\",\"shall\",\"be\",\"issued\",\"in\",\"compliance\",\"with\",\"the\",\"-4-\",\"LEGAL120777600.1\"",
//   "\"provisions of such exemption or exemptions from the registration requirements of the\",\"Securities Act of 1933, as amended, as may be determined to be available therefor.\",\"RESOLVED FURTHER, that the Company's officers shall be, and each of them hereby\",\"is, authorized and directed, for and on behalf of the Company, to enter into the JFE Stock\",\"Purchase Agreement and to take such further action and execute such documents as each\",\"may deem necessary or appropriate to carry out the purposes of the above resolutions,\",\"including, but not limited to, filings in accordance with all applicable state and federal\",\"securities laws.\",\"RESOLVED FURTHER, that upon receipt of the consideration set forth in the JFE\",\"Stock Purchase Agreement, the shares of Common Stock issued to JFE pursuant to such\",\"agreement shall be deemed validly issued, fully paid and nonassessable.\",\"13.\",\"Management of Fiscal Affairs\",\"RESOLVED, that the President and Chief Financial Officer of the Company shall be,\",\"and each of them hereby is, authorized:\",\"(a)\",\"to designate one or more banks or similar financial institutions as\",\"depositories of the funds of the Company;\",\"(b)\",\"to open, maintain and close general and special accounts with any such\",\"depositories;\",\"(c)\",\"to cause to be deposited, from time to time in such accounts with any such\",\"depository, such funds of the Company as such officers deem necessary or\",\"advisable, and to designate or change the designation of the officer or\",\"officers or agent or agents of the Company authorized to make such\",\"deposits and to endorse checks, drafts and other instruments for deposit;\",\"(d)\",\"to designate, change or revoke the designation, from time to time, of the\",\"officer or officers or agent or agents of the Company authorized to sign or\",\"countersign checks, drafts or other orders for the payment of money issued\",\"in the name of the Company against any funds deposited in any of such\",\"accounts;\",\"(e)\",\"to authorize the use of facsimile signatures for the signing or\",\"countersigning of checks, drafts or other orders for the payment of money,\",\"and to enter into such agreements as banks and similar financial\",\"institutions customarily require as a condition for permitting the use of\",\"facsimile signatures;\",\"(f)\",\"to enter into credit card agreements for the Company;\",\"(g)\",\"to borrow funds from time to time on the Company's behalf; and\",\"-5-\",\"LEGAL120777600.1\",\"provisions\",\"of\",\"such\",\"exemption\",\"or\",\"exemptions\",\"from\",\"the\",\"registration\",\"requirements\",\"of\",\"the\",\"Securities\",\"Act\",\"of\",\"1933,\",\"as\",\"amended,\",\"as\",\"may\",\"be\",\"determined\",\"to\",\"be\",\"available\",\"therefor.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"the\",\"Company's\",\"officers\",\"shall\",\"be,\",\"and\",\"each\",\"of\",\"them\",\"hereby\",\"is,\",\"authorized\",\"and\",\"directed,\",\"for\",\"and\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"to\",\"enter\",\"into\",\"the\",\"JFE\",\"Stock\",\"Purchase\",\"Agreement\",\"and\",\"to\",\"take\",\"such\",\"further\",\"action\",\"and\",\"execute\",\"such\",\"documents\",\"as\",\"each\",\"may\",\"deem\",\"necessary\",\"or\",\"appropriate\",\"to\",\"carry\",\"out\",\"the\",\"purposes\",\"of\",\"the\",\"above\",\"resolutions,\",\"including,\",\"but\",\"not\",\"limited\",\"to,\",\"filings\",\"in\",\"accordance\",\"with\",\"all\",\"applicable\",\"state\",\"and\",\"federal\",\"securities\",\"laws.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"upon\",\"receipt\",\"of\",\"the\",\"consideration\",\"set\",\"forth\",\"in\",\"the\",\"JFE\",\"Stock\",\"Purchase\",\"Agreement,\",\"the\",\"shares\",\"of\",\"Common\",\"Stock\",\"issued\",\"to\",\"JFE\",\"pursuant\",\"to\",\"such\",\"agreement\",\"shall\",\"be\",\"deemed\",\"validly\",\"issued,\",\"fully\",\"paid\",\"and\",\"nonassessable.\",\"13.\",\"Management\",\"of\",\"Fiscal\",\"Affairs\",\"RESOLVED,\",\"that\",\"the\",\"President\",\"and\",\"Chief\",\"Financial\",\"Officer\",\"of\",\"the\",\"Company\",\"shall\",\"be,\",\"and\",\"each\",\"of\",\"them\",\"hereby\",\"is,\",\"authorized:\",\"(a)\",\"to\",\"designate\",\"one\",\"or\",\"more\",\"banks\",\"or\",\"similar\",\"financial\",\"institutions\",\"as\",\"depositories\",\"of\",\"the\",\"funds\",\"of\",\"the\",\"Company;\",\"(b)\",\"to\",\"open,\",\"maintain\",\"and\",\"close\",\"general\",\"and\",\"special\",\"accounts\",\"with\",\"any\",\"such\",\"depositories;\",\"(c)\",\"to\",\"cause\",\"to\",\"be\",\"deposited,\",\"from\",\"time\",\"to\",\"time\",\"in\",\"such\",\"accounts\",\"with\",\"any\",\"such\",\"depository,\",\"such\",\"funds\",\"of\",\"the\",\"Company\",\"as\",\"such\",\"officers\",\"deem\",\"necessary\",\"or\",\"advisable,\",\"and\",\"to\",\"designate\",\"or\",\"change\",\"the\",\"designation\",\"of\",\"the\",\"officer\",\"or\",\"officers\",\"or\",\"agent\",\"or\",\"agents\",\"of\",\"the\",\"Company\",\"authorized\",\"to\",\"make\",\"such\",\"deposits\",\"and\",\"to\",\"endorse\",\"checks,\",\"drafts\",\"and\",\"other\",\"instruments\",\"for\",\"deposit;\",\"(d)\",\"to\",\"designate,\",\"change\",\"or\",\"revoke\",\"the\",\"designation,\",\"from\",\"time\",\"to\",\"time,\",\"of\",\"the\",\"officer\",\"or\",\"officers\",\"or\",\"agent\",\"or\",\"agents\",\"of\",\"the\",\"Company\",\"authorized\",\"to\",\"sign\",\"or\",\"countersign\",\"checks,\",\"drafts\",\"or\",\"other\",\"orders\",\"for\",\"the\",\"payment\",\"of\",\"money\",\"issued\",\"in\",\"the\",\"name\",\"of\",\"the\",\"Company\",\"against\",\"any\",\"funds\",\"deposited\",\"in\",\"any\",\"of\",\"such\",\"accounts;\",\"(e)\",\"to\",\"authorize\",\"the\",\"use\",\"of\",\"facsimile\",\"signatures\",\"for\",\"the\",\"signing\",\"or\",\"countersigning\",\"of\",\"checks,\",\"drafts\",\"or\",\"other\",\"orders\",\"for\",\"the\",\"payment\",\"of\",\"money,\",\"and\",\"to\",\"enter\",\"into\",\"such\",\"agreements\",\"as\",\"banks\",\"and\",\"similar\",\"financial\",\"institutions\",\"customarily\",\"require\",\"as\",\"a\",\"condition\",\"for\",\"permitting\",\"the\",\"use\",\"of\",\"facsimile\",\"signatures;\",\"(f)\",\"to\",\"enter\",\"into\",\"credit\",\"card\",\"agreements\",\"for\",\"the\",\"Company;\",\"(g)\",\"to\",\"borrow\",\"funds\",\"from\",\"time\",\"to\",\"time\",\"on\",\"the\",\"Company's\",\"behalf;\",\"and\",\"-5-\",\"LEGAL120777600.1\"",
//   "\"(h)\",\"to make such general and special rules and regulations with respect to such\",\"accounts as they may deem necessary and advisable and to complete,\",\"execute and certify any customary printed blank signature card forms in\",\"order to exercise conveniently the authority granted by this resolution, and\",\"any resolutions, printed on such cards are deemed adopted as a part of this\",\"resolution.\",\"RESOLVED FURTHER, that all form resolutions required by any such depository shall\",\"be, and they hereby are, adopted in such form utilized by such depository, and that the\",\"Secretary shall be, and hereby is, authorized to certify such resolutions as having been\",\"adopted by this Board on the date hereof and that the Secretary shall be, and hereby is,\",\"directed to insert a copy of any such form resolutions in the Company's minute book.\",\"RESOLVED FURTHER, that any such depository to which a certified copy of such\",\"resolutions has been delivered by the Secretary of the Company shall be, and it hereby is,\",\"authorized and entitled to rely upon such resolutions for all purposes until it shall have\",\"received written notice of the revocation or amendment of these resolutions adopted by\",\"the Board.\",\"14.\",\"Fiscal Year\",\"RESOLVED, that the Company's fiscal year shall end on December 31 of each year.\",\"15.\",\"Principal Office\",\"RESOLVED, that the Company's principal executive office shall initially be located at\",\"236 Dorchester Road, River Edge, NJ 07661.\",\"16.\",\"Qualification to Do Business\",\"RESOLVED, that for the purpose of authorizing the Company to do business in any\",\"state, territory or dependency of the United States or in any foreign country in which it is\",\"necessary or expedient for the Company to transact business, the Company's officers are\",\"hereby authorized to appoint and substitute all necessary agents and attorneys for service\",\"of process; to designate and change the location of all necessary statutory offices; to\",\"select and designate any alternative corporate names in the event the Company's true\",\"corporate name is unavailable or inappropriate for use in any such foreign jurisdiction;\",\"under the corporate seal, to make and file all necessary certificates, reports, powers of\",\"attorney and other instruments as may be required by the laws of such state, territory,\",\"dependency or country, to authorize the Company to transact business therein; and\",\"whenever it is expedient for the Company to cease doing business therein and withdraw\",\"therefrom, to revoke any appointment of agent or attorney for service of process and to\",\"file such certificates, reports, revocation of appointment or surrender of authority as may\",\"be necessary to terminate the authority of the Company to do business in any such state,\",\"territory, dependency or country.\",\"-6-\",\"LEGAL120777600.1\",\"(h)\",\"to\",\"make\",\"such\",\"general\",\"and\",\"special\",\"rules\",\"and\",\"regulations\",\"with\",\"respect\",\"to\",\"such\",\"accounts\",\"as\",\"they\",\"may\",\"deem\",\"necessary\",\"and\",\"advisable\",\"and\",\"to\",\"complete,\",\"execute\",\"and\",\"certify\",\"any\",\"customary\",\"printed\",\"blank\",\"signature\",\"card\",\"forms\",\"in\",\"order\",\"to\",\"exercise\",\"conveniently\",\"the\",\"authority\",\"granted\",\"by\",\"this\",\"resolution,\",\"and\",\"any\",\"resolutions,\",\"printed\",\"on\",\"such\",\"cards\",\"are\",\"deemed\",\"adopted\",\"as\",\"a\",\"part\",\"of\",\"this\",\"resolution.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"all\",\"form\",\"resolutions\",\"required\",\"by\",\"any\",\"such\",\"depository\",\"shall\",\"be,\",\"and\",\"they\",\"hereby\",\"are,\",\"adopted\",\"in\",\"such\",\"form\",\"utilized\",\"by\",\"such\",\"depository,\",\"and\",\"that\",\"the\",\"Secretary\",\"shall\",\"be,\",\"and\",\"hereby\",\"is,\",\"authorized\",\"to\",\"certify\",\"such\",\"resolutions\",\"as\",\"having\",\"been\",\"adopted\",\"by\",\"this\",\"Board\",\"on\",\"the\",\"date\",\"hereof\",\"and\",\"that\",\"the\",\"Secretary\",\"shall\",\"be,\",\"and\",\"hereby\",\"is,\",\"directed\",\"to\",\"insert\",\"a\",\"copy\",\"of\",\"any\",\"such\",\"form\",\"resolutions\",\"in\",\"the\",\"Company's\",\"minute\",\"book.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"any\",\"such\",\"depository\",\"to\",\"which\",\"a\",\"certified\",\"copy\",\"of\",\"such\",\"resolutions\",\"has\",\"been\",\"delivered\",\"by\",\"the\",\"Secretary\",\"of\",\"the\",\"Company\",\"shall\",\"be,\",\"and\",\"it\",\"hereby\",\"is,\",\"authorized\",\"and\",\"entitled\",\"to\",\"rely\",\"upon\",\"such\",\"resolutions\",\"for\",\"all\",\"purposes\",\"until\",\"it\",\"shall\",\"have\",\"received\",\"written\",\"notice\",\"of\",\"the\",\"revocation\",\"or\",\"amendment\",\"of\",\"these\",\"resolutions\",\"adopted\",\"by\",\"the\",\"Board.\",\"14.\",\"Fiscal\",\"Year\",\"RESOLVED,\",\"that\",\"the\",\"Company's\",\"fiscal\",\"year\",\"shall\",\"end\",\"on\",\"December\",\"31\",\"of\",\"each\",\"year.\",\"15.\",\"Principal\",\"Office\",\"RESOLVED,\",\"that\",\"the\",\"Company's\",\"principal\",\"executive\",\"office\",\"shall\",\"initially\",\"be\",\"located\",\"at\",\"236\",\"Dorchester\",\"Road,\",\"River\",\"Edge,\",\"NJ\",\"07661.\",\"16.\",\"Qualification\",\"to\",\"Do\",\"Business\",\"RESOLVED,\",\"that\",\"for\",\"the\",\"purpose\",\"of\",\"authorizing\",\"the\",\"Company\",\"to\",\"do\",\"business\",\"in\",\"any\",\"state,\",\"territory\",\"or\",\"dependency\",\"of\",\"the\",\"United\",\"States\",\"or\",\"in\",\"any\",\"foreign\",\"country\",\"in\",\"which\",\"it\",\"is\",\"necessary\",\"or\",\"expedient\",\"for\",\"the\",\"Company\",\"to\",\"transact\",\"business,\",\"the\",\"Company's\",\"officers\",\"are\",\"hereby\",\"authorized\",\"to\",\"appoint\",\"and\",\"substitute\",\"all\",\"necessary\",\"agents\",\"and\",\"attorneys\",\"for\",\"service\",\"of\",\"process;\",\"to\",\"designate\",\"and\",\"change\",\"the\",\"location\",\"of\",\"all\",\"necessary\",\"statutory\",\"offices;\",\"to\",\"select\",\"and\",\"designate\",\"any\",\"alternative\",\"corporate\",\"names\",\"in\",\"the\",\"event\",\"the\",\"Company's\",\"true\",\"corporate\",\"name\",\"is\",\"unavailable\",\"or\",\"inappropriate\",\"for\",\"use\",\"in\",\"any\",\"such\",\"foreign\",\"jurisdiction;\",\"under\",\"the\",\"corporate\",\"seal,\",\"to\",\"make\",\"and\",\"file\",\"all\",\"necessary\",\"certificates,\",\"reports,\",\"powers\",\"of\",\"attorney\",\"and\",\"other\",\"instruments\",\"as\",\"may\",\"be\",\"required\",\"by\",\"the\",\"laws\",\"of\",\"such\",\"state,\",\"territory,\",\"dependency\",\"or\",\"country,\",\"to\",\"authorize\",\"the\",\"Company\",\"to\",\"transact\",\"business\",\"therein;\",\"and\",\"whenever\",\"it\",\"is\",\"expedient\",\"for\",\"the\",\"Company\",\"to\",\"cease\",\"doing\",\"business\",\"therein\",\"and\",\"withdraw\",\"therefrom,\",\"to\",\"revoke\",\"any\",\"appointment\",\"of\",\"agent\",\"or\",\"attorney\",\"for\",\"service\",\"of\",\"process\",\"and\",\"to\",\"file\",\"such\",\"certificates,\",\"reports,\",\"revocation\",\"of\",\"appointment\",\"or\",\"surrender\",\"of\",\"authority\",\"as\",\"may\",\"be\",\"necessary\",\"to\",\"terminate\",\"the\",\"authority\",\"of\",\"the\",\"Company\",\"to\",\"do\",\"business\",\"in\",\"any\",\"such\",\"state,\",\"territory,\",\"dependency\",\"or\",\"country.\",\"-6-\",\"LEGAL120777600.1\"\"17.\",\"Incorporation Expenses\",\"RESOLVED, that the Company's officers are hereby authorized and directed to pay and\",\"reimburse the expenses incurred by the Company's founders in connection with the\",\"incorporation and organization of the Company.\",\"18.\",\"Withholding Taxes\",\"RESOLVED, that the Chief Financial Officer are hereby authorized and directed to\",\"consult with the Company's bookkeeper, auditors and attorneys in order to be fully\",\"informed as to, and to collect and pay promptly when due, all withholding taxes that this\",\"Company may now be (or hereinafter become) liable for.\",\"19.\",\"Government Filings\",\"RESOLVED, that the officers of the Company, and each of them with full authority to\",\"act without the others, are authorized to execute and file, or cause to be filed, with the\",\"Secretary of State of the State of Delaware or with any other applicable office or agency\",\"of the State of Delaware or of any county or other governmental entity thereof, such\",\"documents as such officers, or any of them, may deem necessary or appropriate in\",\"connection with the organization of the Company or the initial operation of its business.\",\"20.\",\"Omnibus Resolutions\",\"RESOLVED, that the Company's officers are authorized and empowered, in the name\",\"and on behalf of the Company, to execute, certify, file and record such additional\",\"agreements, documents and instruments as may be or become reasonably necessary or\",\"convenient to carry out and put into effect the purposes of the foregoing resolutions.\",\"RESOLVED FURTHER, that any and all actions heretofore taken by the Company's\",\"officers in the name and on behalf of the Company in furtherance of the preceding\",\"resolutions are ratified, approved and adopted.\",\"[Signature Page Follows]\",\"-7-\",\"LEGAL120777600.1\",\"17.\",\"Incorporation\",\"Expenses\",\"RESOLVED,\",\"that\",\"the\",\"Company's\",\"officers\",\"are\",\"hereby\",\"authorized\",\"and\",\"directed\",\"to\",\"pay\",\"and\",\"reimburse\",\"the\",\"expenses\",\"incurred\",\"by\",\"the\",\"Company's\",\"founders\",\"in\",\"connection\",\"with\",\"the\",\"incorporation\",\"and\",\"organization\",\"of\",\"the\",\"Company.\",\"18.\",\"Withholding\",\"Taxes\",\"RESOLVED,\",\"that\",\"the\",\"Chief\",\"Financial\",\"Officer\",\"are\",\"hereby\",\"authorized\",\"and\",\"directed\",\"to\",\"consult\",\"with\",\"the\",\"Company's\",\"bookkeeper,\",\"auditors\",\"and\",\"attorneys\",\"in\",\"order\",\"to\",\"be\",\"fully\",\"informed\",\"as\",\"to,\",\"and\",\"to\",\"collect\",\"and\",\"pay\",\"promptly\",\"when\",\"due,\",\"all\",\"withholding\",\"taxes\",\"that\",\"this\",\"Company\",\"may\",\"now\",\"be\",\"(or\",\"hereinafter\",\"become)\",\"liable\",\"for.\",\"19.\",\"Government\",\"Filings\",\"RESOLVED,\",\"that\",\"the\",\"officers\",\"of\",\"the\",\"Company,\",\"and\",\"each\",\"of\",\"them\",\"with\",\"full\",\"authority\",\"to\",\"act\",\"without\",\"the\",\"others,\",\"are\",\"authorized\",\"to\",\"execute\",\"and\",\"file,\",\"or\",\"cause\",\"to\",\"be\",\"filed,\",\"with\",\"the\",\"Secretary\",\"of\",\"State\",\"of\",\"the\",\"State\",\"of\",\"Delaware\",\"or\",\"with\",\"any\",\"other\",\"applicable\",\"office\",\"or\",\"agency\",\"of\",\"the\",\"State\",\"of\",\"Delaware\",\"or\",\"of\",\"any\",\"county\",\"or\",\"other\",\"governmental\",\"entity\",\"thereof,\",\"such\",\"documents\",\"as\",\"such\",\"officers,\",\"or\",\"any\",\"of\",\"them,\",\"may\",\"deem\",\"necessary\",\"or\",\"appropriate\",\"in\",\"connection\",\"with\",\"the\",\"organization\",\"of\",\"the\",\"Company\",\"or\",\"the\",\"initial\",\"operation\",\"of\",\"its\",\"business.\",\"20.\",\"Omnibus\",\"Resolutions\",\"RESOLVED,\",\"that\",\"the\",\"Company's\",\"officers\",\"are\",\"authorized\",\"and\",\"empowered,\",\"in\",\"the\",\"name\",\"and\",\"on\",\"behalf\",\"of\",\"the\",\"Company,\",\"to\",\"execute,\",\"certify,\",\"file\",\"and\",\"record\",\"such\",\"additional\",\"agreements,\",\"documents\",\"and\",\"instruments\",\"as\",\"may\",\"be\",\"or\",\"become\",\"reasonably\",\"necessary\",\"or\",\"convenient\",\"to\",\"carry\",\"out\",\"and\",\"put\",\"into\",\"effect\",\"the\",\"purposes\",\"of\",\"the\",\"foregoing\",\"resolutions.\",\"RESOLVED\",\"FURTHER,\",\"that\",\"any\",\"and\",\"all\",\"actions\",\"heretofore\",\"taken\",\"by\",\"the\",\"Company's\",\"officers\",\"in\",\"the\",\"name\",\"and\",\"on\",\"behalf\",\"of\",\"the\",\"Company\",\"in\",\"furtherance\",\"of\",\"the\",\"preceding\",\"resolutions\",\"are\",\"ratified,\",\"approved\",\"and\",\"adopted.\",\"[Signature\",\"Page\",\"Follows]\",\"-7-\",\"LEGAL120777600.1\"",
//   "\"IN WITNESS WHEREOF, this Action by Unanimous Written Consent has been\",\"executed by the undersigned of as of the dates set forth below and shall be effective as of the date\",\"when all of the members of the Board have signed this Consent. This Consent may be signed in\",\"any number of counterparts, each of which shall be deemed an original and all of which shall\",\"constitute one instrument.\",\"Dated: 04/29/2014\",\"ds\",\"Gene Vayngrib\",\"-\",\"Dated: 04/29/2014\",\"Ellen Katsnelson\",\"Dated: 04/29/2014\",\"whin\",\"Mark Vayngrib\",\"ACTION BY UNANIMOUS WRITTEN CONSENT\",\"IN LIEU OF THE ORGANIZATIONAL MEETING OF THE BOARD OF DIRECTORS\",\"IN\",\"WITNESS\",\"WHEREOF,\",\"this\",\"Action\",\"by\",\"Unanimous\",\"Written\",\"Consent\",\"has\",\"been\",\"executed\",\"by\",\"the\",\"undersigned\",\"of\",\"as\",\"of\",\"the\",\"dates\",\"set\",\"forth\",\"below\",\"and\",\"shall\",\"be\",\"effective\",\"as\",\"of\",\"the\",\"date\",\"when\",\"all\",\"of\",\"the\",\"members\",\"of\",\"the\",\"Board\",\"have\",\"signed\",\"this\",\"Consent.\",\"This\",\"Consent\",\"may\",\"be\",\"signed\",\"in\",\"any\",\"number\",\"of\",\"counterparts,\",\"each\",\"of\",\"which\",\"shall\",\"be\",\"deemed\",\"an\",\"original\",\"and\",\"all\",\"of\",\"which\",\"shall\",\"constitute\",\"one\",\"instrument.\",\"Dated:\",\"04/29/2014\",\"ds\",\"Gene\",\"Vayngrib\",\"-\",\"Dated:\",\"04/29/2014\",\"Ellen\",\"Katsnelson\",\"Dated:\",\"04/29/2014\",\"whin\",\"Mark\",\"Vayngrib\",\"ACTION\",\"BY\",\"UNANIMOUS\",\"WRITTEN\",\"CONSENT\",\"IN\",\"LIEU\",\"OF\",\"THE\",\"ORGANIZATIONAL\",\"MEETING\",\"OF\",\"THE\",\"BOARD\",\"OF\",\"DIRECTORS\"\"EXHIBIT A\",\"CERTIFICATE OF INCORPORATION\",\"LEGAL120777600.1\",\"EXHIBIT\",\"A\",\"CERTIFICATE\",\"OF\",\"INCORPORATION\",\"LEGAL120777600.1\"\"EXHIBIT B\",\"BYLAWS\",\"LEGAL120777600.1\",\"EXHIBIT\",\"B\",\"BYLAWS\",\"LEGAL120777600.1\"\"EXHIBIT C\",\"FORM OF COMMON STOCK CERTIFICATE\",\"LEGAL120777600.1\",\"EXHIBIT\",\"C\",\"FORM\",\"OF\",\"COMMON\",\"STOCK\",\"CERTIFICATE\",\"LEGAL120777600.1\"\"EXHIBIT D-1\",\"FORM OF RESTRICTED STOCK PURCHASE AGREEMENT\",\"LEGAL120777600.1\",\"EXHIBIT\",\"D-1\",\"FORM\",\"OF\",\"RESTRICTED\",\"STOCK\",\"PURCHASE\",\"AGREEMENT\",\"LEGAL120777600.1\"\"EXHIBIT D-2\",\"FORM OF RESTRICTED STOCK PURCHASE AGREEMENT\",\"LEGAL120777600.1\",\"EXHIBIT\",\"D-2\",\"FORM\",\"OF\",\"RESTRICTED\",\"STOCK\",\"PURCHASE\",\"AGREEMENT\",\"LEGAL120777600.1\"\"EXHIBIT E\",\"FORM OF INDEMNIFICATION AGREEMENT\",\"LEGAL120777600.1\",\"EXHIBIT\",\"E\",\"FORM\",\"OF\",\"INDEMNIFICATION\",\"AGREEMENT\",\"LEGAL120777600.1\"\"EXHIBIT F\",\"FORM OF PROPRIETARY INFORMATION AND INVENTIONS AGREEMENT\",\"LEGAL120777600.1\",\"EXHIBIT\",\"F\",\"FORM\",\"OF\",\"PROPRIETARY\",\"INFORMATION\",\"AND\",\"INVENTIONS\",\"AGREEMENT\",\"LEGAL120777600.1\"\"EXHIBIT G\",\"FORM OF JEWS FOR ENTREPRENEURSHIP\",\"STOCK PURCHASE AGREEMENT\",\"LEGAL120777600.1\",\"EXHIBIT\",\"G\",\"FORM\",\"OF\",\"JEWS\",\"FOR\",\"ENTREPRENEURSHIP\",\"STOCK\",\"PURCHASE\",\"AGREEMENT\",\"LEGAL120777600.1\""
// ].map(p => p.replace(/\\"/, '"'));

