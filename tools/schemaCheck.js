const fs = require("fs")
const Ajv = require("ajv")
const ajv = new Ajv()
const schema = require("./schema/chainSchema.json")
const { exit } = require("process")
const path = require('path')

const resolve = (_path) => path.resolve(__dirname, _path)

// Only .json files are chain definitions. Directory listings can also contain
// editor and OS artefacts (.DS_Store, .swp, Thumbs.db); feeding one of those to
// JSON.parse used to abort the entire check with a parse error that named no file.
const chainFiles = fs
  .readdirSync(resolve("../_data/chains/"))
  .filter((chainFile) => chainFile.endsWith(".json"))

// https://chainagnostic.org/CAIPs/caip-2
const parseChainId = (chainId) =>
  /^(?<namespace>[-a-z0-9]{3,8})-(?<reference>[-a-zA-Z0-9]{1,32})$/u.exec(
    chainId
  )

// Compile the schema once instead of passing it to ajv.validate on every
// iteration. With 2600+ chain files this removes 2600+ schema cache lookups and
// makes the validator a plain function call.
const validateChain = ajv.compile(schema)

const errors = []
for (const chainFile of chainFiles) {
  const fileLocation = resolve(`../_data/chains/${chainFile}`)
  const fileData = fs.readFileSync(fileLocation, "utf8")

  // Parse defensively: an unhandled SyntaxError here aborted the run at the
  // first malformed file and reported only a byte offset, so a contributor had
  // no way to tell which of the 2600+ files was broken.
  let fileDataJson
  try {
    fileDataJson = JSON.parse(fileData)
  } catch (error) {
    errors.push(`Invalid JSON in ${chainFile}: ${error.message}`)
    continue
  }

  const fileName = chainFile.split(".")[0]
  const parsedChainId = parseChainId(fileName)?.groups
  const chainIdFromFileName = parsedChainId?.reference

  if (chainIdFromFileName === undefined) {
    // Previously this fell through to the comparison below and surfaced as a
    // "File Name does not match with ChainID" error, which pointed at the wrong
    // problem: the real fault is that the file name is not a CAIP-2 identifier.
    errors.push(
      `File name ${chainFile} is not a valid CAIP-2 identifier (expected <namespace>-<reference>.json)`
    )
    continue
  }

  // The reference parsed out of the file name is a string while chainId in the
  // document is a number, so the original loose `!=` comparison only ever
  // matched because of implicit coercion. Compare numerically and explicitly so
  // the intent survives a future tightening to strict equality.
  if (Number(chainIdFromFileName) !== Number(fileDataJson.chainId)) {
    errors.push(
      `File name does not match chainId in ${chainFile} (file name says ${chainIdFromFileName}, document says ${fileDataJson.chainId})`
    )
    continue
  }

  if (!validateChain(fileDataJson)) {
    console.error(`Schema errors in ${chainFile}:`, validateChain.errors)
    errors.push(`Invalid JSON Schema in ${chainFile}`)
  }
}

// Report every problem found in a single run. The file-name mismatch used to
// throw immediately, so a pull request with several bad files had to be fixed and
// re-pushed once per file to discover the next error.
if (errors.length > 0) {
  errors.forEach((error) => {
    console.error(error)
  })
  console.error(`\nSchema check failed: ${errors.length} problem(s) in ${chainFiles.length} file(s)`)
  // exit(1) rather than exit(-1): a negative status is truncated to 255 by the
  // operating system, which reads as a signal-style failure in CI logs.
  exit(1)
} else {
  console.info(`Schema check completed successfully (${chainFiles.length} files)`)
  exit(0)
}
