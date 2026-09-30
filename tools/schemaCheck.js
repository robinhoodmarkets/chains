const fs = require("fs")
const Ajv = require("ajv")
const ajv = new Ajv()
const schema = require("./schema/chainSchema.json")
const { exit } = require("process")
const path = require('path')

const resolve = (_path) => path.resolve(__dirname, _path)
const chainFiles = fs.readdirSync(resolve("../_data/chains/"))

// https://chainagnostic.org/CAIPs/caip-2
// Matches the full file name, e.g. "eip155-1.json", not just the stem, so a
// file name that doesn't conform to CAIP-2 is rejected explicitly instead of
// silently producing undefined capture groups.
const CAIP2_FILE_NAME = /^(?<namespace>[-a-z0-9]{3,8})-(?<reference>[-a-zA-Z0-9]{1,32})\.json$/u

// Compiled once and reused for every file, instead of re-parsing the schema
// on each iteration (ajv.validate(schema, data) recompiles the schema every
// call).
const validate = ajv.compile(schema)

const filesWithErrors = []
for (const chainFile of chainFiles) {
  const fileLocation = resolve(`../_data/chains/${chainFile}`)
  const fileData = fs.readFileSync(fileLocation, "utf8")
  const fileDataJson = JSON.parse(fileData)

  const parsedFileName = CAIP2_FILE_NAME.exec(chainFile)?.groups
  if (!parsedFileName) {
    throw new Error(
      `File name "${chainFile}" does not match the CAIP-2 format <namespace>-<reference>.json`
    )
  }

  // Compare numerically so e.g. "1" and "01" or a stray leading/trailing
  // space don't coerce into a false match under ==.
  const chainIdFromFileName = Number(parsedFileName.reference)
  const chainIdFromFile = Number(fileDataJson.chainId)
  if (
    Number.isNaN(chainIdFromFileName) ||
    Number.isNaN(chainIdFromFile) ||
    chainIdFromFileName !== chainIdFromFile
  ) {
    throw new Error(`File Name does not match with ChainID in ${chainFile}`)
  }

  const valid = validate(fileDataJson)
  if (!valid) {
    console.error(validate.errors)
    filesWithErrors.push(chainFile)
  }
}

if (filesWithErrors.length > 0) {
  filesWithErrors.forEach(file => {
    console.error(`Invalid JSON Schema in ${file}`)
  })
  exit(1);
}
else {
  console.info("Schema check completed successfully");
  exit(0);
}