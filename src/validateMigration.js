const fs = require('fs');
const path = require('path');

/**
 * Schema names recognised as valid targets for migration files.
 * Adapt this list to your own environment's schema conventions.
 */
const VALID_SCHEMAS = ['APP', 'AUDIT', 'REPORTING'];

/** Prefix pattern: V_<1-4>_<YYYYMMDD>_<nnnn>__ */
const NAME_PREFIX_RE = /^V_([1-4])_(\d{8})_(\d{4})__/;

/** Only letters, digits, underscore, hyphen, dot allowed in the file name. */
const SAFE_NAME_RE = /^[A-Za-z0-9_\-.]+$/;

const SET_SCHEMA_RE = /^SET\s+SCHEMA\s*=\s*([A-Za-z0-9_]+)\s*;?\s*$/i;
const SET_CURRENT_PATH_RE = /^SET\s+CURRENT\s+PATH\s*=\s*([A-Za-z0-9_]+)/i;
const SET_TERMINATOR_RE = /^SET\s+TERMINATOR\s+(\S+)\s*$/i;

/**
 * Extracts the version prefix (e.g. "V_1_20260627_0001") from a file name, or null.
 * @param {string} fileName
 */
function getVersionPrefix(fileName) {
  const m = fileName.match(NAME_PREFIX_RE);
  if (!m) return null;
  return `V_${m[1]}_${m[2]}_${m[3]}`;
}

function checkNaming(fileName, errors) {
  if (!fileName.toLowerCase().endsWith('.sql')) {
    errors.push({ code: 'E_N01', message: `File "${fileName}" must have a .sql extension.` });
  }

  if (!NAME_PREFIX_RE.test(fileName)) {
    errors.push({
      code: 'E_N02',
      message: `File name must match the "V_[1-4]_YYYYMMDD_nnnn__" prefix pattern (e.g. V_1_20260627_0001__description.sql).`,
    });
  }

  if (!SAFE_NAME_RE.test(fileName)) {
    errors.push({
      code: 'E_N03',
      message: `File name must contain only letters, digits, underscore, hyphen, and dot — no spaces or special characters.`,
    });
  }
}

function firstNonEmptyLines(content, count) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, count);
}

function checkContent(content, errors) {
  const lines = firstNonEmptyLines(content, 3);
  const [line1, line2, line3] = lines;

  let schemaFromSet = null;
  let schemaFromPath = null;

  // Line 1: SET SCHEMA
  if (!line1 || !SET_SCHEMA_RE.test(line1)) {
    errors.push({
      code: 'E_C02',
      message: 'Line 1 is missing or is not a "SET SCHEMA = <schema>;" statement.',
    });
  } else {
    const m = line1.match(SET_SCHEMA_RE);
    schemaFromSet = m[1].toUpperCase();
    if (!VALID_SCHEMAS.includes(schemaFromSet)) {
      errors.push({
        code: 'E_C01',
        message: `Line 1 uses an unrecognised schema "${schemaFromSet}". Valid schemas: ${VALID_SCHEMAS.join(', ')}.`,
      });
    }
  }

  // Line 2: SET CURRENT PATH
  if (!line2 || !SET_CURRENT_PATH_RE.test(line2)) {
    errors.push({
      code: 'E_C04',
      message: 'Line 2 is missing or is not a "SET CURRENT PATH = <schema>, ..." statement.',
    });
  } else {
    const m = line2.match(SET_CURRENT_PATH_RE);
    schemaFromPath = m[1].toUpperCase();
    if (!VALID_SCHEMAS.includes(schemaFromPath)) {
      errors.push({
        code: 'E_C03',
        message: `Line 2 uses an unrecognised schema "${schemaFromPath}". Valid schemas: ${VALID_SCHEMAS.join(', ')}.`,
      });
    }
  }

  // Line 3: SET TERMINATOR
  if (!line3 || !SET_TERMINATOR_RE.test(line3)) {
    errors.push({
      code: 'E_C06',
      message: 'Line 3 is missing or is not a "SET TERMINATOR #" statement.',
    });
  } else {
    const m = line3.match(SET_TERMINATOR_RE);
    if (m[1] !== '#') {
      errors.push({
        code: 'E_C05',
        message: `Line 3 must use "#" as the terminator character (found "${m[1]}").`,
      });
    }
  }

  // Cross-check schema consistency
  if (schemaFromSet && schemaFromPath && schemaFromSet !== schemaFromPath) {
    errors.push({
      code: 'E_C07',
      message: `Schema mismatch: "SET SCHEMA" uses "${schemaFromSet}" but "SET CURRENT PATH" uses "${schemaFromPath}".`,
    });
  }

  // File must end with # as the last non-whitespace character
  const trimmedEnd = content.replace(/\s+$/, '');
  if (!trimmedEnd.endsWith('#')) {
    errors.push({
      code: 'E_C08',
      message: 'File must end with "#" as the last non-whitespace character.',
    });
  }
}

/**
 * Validates a single migration SQL file's naming and content conventions.
 * @param {string} filePath
 * @returns {Promise<{code: string, message: string}[]>}
 */
async function validateFile(filePath) {
  const errors = [];
  const fileName = path.basename(filePath);

  checkNaming(fileName, errors);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    checkContent(content, errors);
  } catch (e) {
    errors.push({ code: 'E_N04', message: `File could not be read: ${e.message}` });
  }

  return errors;
}

module.exports = {
  validateFile,
  getVersionPrefix,
  VALID_SCHEMAS,
};
