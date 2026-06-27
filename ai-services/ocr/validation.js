/**
 * Computes the Levenshtein distance (edit distance) between two strings.
 */
export function levenshteinDistance(s1, s2) {
  const clean1 = s1.toLowerCase().trim();
  const clean2 = s2.toLowerCase().trim();
  const m = clean1.length;
  const n = clean2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (clean1[i - 1] === clean2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // Deletion
          dp[i][j - 1] + 1,    // Insertion
          dp[i - 1][j - 1] + 1 // Substitution
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculates a similarity score [0.0, 1.0] between two strings.
 */
export function calculateSimilarity(s1, s2) {
  const clean1 = s1.toLowerCase().trim();
  const clean2 = s2.toLowerCase().trim();
  if (clean1 === clean2) return 1.0;
  const maxLen = Math.max(clean1.length, clean2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(clean1, clean2);
  return (maxLen - dist) / maxLen;
}

/**
 * Parses and extracts key fields from the text based on document type.
 */
export function extractFields(text, docType) {
  const fields = { id: null, name: null, amount: null, date: null };
  const lines = text.split('\n');

  // Regex patterns
  const patterns = {
    taxId: /(TX-\d{5})/i,
    receiptNoLabel: /(?:Receipt No|Tax ID|Receipt #):\s*([A-Za-z0-9-]+)/i,
    licenseId: /(LIC-\d{5})/i,
    licenseNoLabel: /(?:License Number|License No|License #):\s*([A-Za-z0-9-]+)/i,
    permitId: /(BP-\d{5})/i,
    permitNoLabel: /(?:Permit Number|Permit No|Permit #):\s*([A-Za-z0-9-]+)/i,
    
    nameLabel: /(?:Taxpayer Name|Owner|Applicant|Licensee|Name):\s*([^\n\r]+)/i,
    amountLabel: /(?:Rs\.\s*([\d,]+)|Amount:\s*(?:Rs\.\s*)?([\d,]+))/i,
    dateLabel: /(?:Date|Expires|Expiry):\s*([\d\-/]+)/i
  };

  // 1. Extract ID
  if (docType === 'tax_receipt') {
    const matchDirect = text.match(patterns.taxId);
    if (matchDirect) fields.id = matchDirect[1];
    else {
      const matchLabel = text.match(patterns.receiptNoLabel);
      if (matchLabel) fields.id = matchLabel[1];
    }
  } else if (docType === 'property_license') {
    const matchDirect = text.match(patterns.licenseId);
    if (matchDirect) fields.id = matchDirect[1];
    else {
      const matchLabel = text.match(patterns.licenseNoLabel);
      if (matchLabel) fields.id = matchLabel[1];
    }
  } else if (docType === 'building_permit') {
    const matchDirect = text.match(patterns.permitId);
    if (matchDirect) fields.id = matchDirect[1];
    else {
      const matchLabel = text.match(patterns.permitNoLabel);
      if (matchLabel) fields.id = matchLabel[1];
    }
  }

  // 2. Extract Name
  const nameMatch = text.match(patterns.nameLabel);
  if (nameMatch) {
    fields.name = nameMatch[1].trim();
  }

  // 3. Extract Amount
  const amountMatch = text.match(patterns.amountLabel);
  if (amountMatch) {
    const rawVal = amountMatch[1] || amountMatch[2];
    fields.amount = parseFloat(rawVal.replace(/,/g, ''));
  }

  // 4. Extract Date
  const dateMatch = text.match(patterns.dateLabel);
  if (dateMatch) {
    fields.date = dateMatch[1].trim();
  }

  return fields;
}

/**
 * Validates extracted document text against expected credentials using tolerance limits.
 */
export function validateDocument(text, docType, credentials) {
  const extracted = extractFields(text, docType);
  const result = {
    valid: true,
    score: 1.0,
    matches: { id: false, name: false, amount: true, date: true },
    details: { extracted, expected: credentials }
  };

  // Tolerances
  const nameMinSimilarity = 0.80; // 80% Levenshtein similarity
  const idMaxLevenshtein = 1;      // at most 1 typo character

  // 1. Validate ID
  if (credentials.id) {
    if (extracted.id) {
      const dist = levenshteinDistance(extracted.id, credentials.id);
      if (dist <= idMaxLevenshtein) {
        result.matches.id = true;
      } else {
        result.valid = false;
        result.matches.id = false;
      }
    } else {
      result.valid = false;
      result.matches.id = false;
    }
  } else {
    result.matches.id = true; // Not required
  }

  // 2. Validate Name
  if (credentials.name) {
    if (extracted.name) {
      const sim = calculateSimilarity(extracted.name, credentials.name);
      result.score = sim;
      if (sim >= nameMinSimilarity) {
        result.matches.name = true;
      } else {
        result.valid = false;
        result.matches.name = false;
      }
    } else {
      result.valid = false;
      result.matches.name = false;
      result.score = 0.0;
    }
  } else {
    result.matches.name = true; // Not required
  }

  // 3. Validate Amount (Receipts only)
  if (docType === 'tax_receipt' && credentials.amount !== undefined) {
    if (extracted.amount !== null && extracted.amount === credentials.amount) {
      result.matches.amount = true;
    } else {
      result.valid = false;
      result.matches.amount = false;
    }
  }

  // 4. Validate Date
  if (credentials.date) {
    if (extracted.date) {
      // Compare dates directly or check close matching
      const sim = calculateSimilarity(extracted.date, credentials.date);
      if (sim >= 0.90) {
        result.matches.date = true;
      } else {
        result.valid = false;
        result.matches.date = false;
      }
    } else {
      result.valid = false;
      result.matches.date = false;
    }
  }

  return result;
}
