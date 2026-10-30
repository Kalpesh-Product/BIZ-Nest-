import { isDeepStrictEqual } from 'node:util';

// Explicit storage schemas: submitted answers cannot overwrite system metadata.
export const businessFieldNames = {
  inquiries: ['name', 'email', 'mobile', 'count', 'sdate', 'pagename', 'category'],
  jobApplications: ['name', 'email', 'dob', 'mobile', 'location', 'experience', 'linkedin', 'currentmonthlysalary', 'expectedsalary', 'canjoin', 'relocategoa', 'personality', 'skills', 'specialexperience', 'willing', 'message', 'job_position'],
  partnerships: ['name', 'email', 'mobile', 'message', 'pagename'],
};

export function businessFieldsFor(collectionName, fields) {
  const allowed = businessFieldNames[collectionName];
  if (!allowed || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid submission fields.');
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key) || typeof value !== 'string') throw new Error('Unexpected business field; storage or migration stopped.');
  }
  return Object.fromEntries(allowed.filter(key => Object.hasOwn(fields, key)).map(key => [key, fields[key]]));
}

export function flatSubmission(collectionName, record) {
  if (!Object.hasOwn(record, 'fields')) return record;
  const answers = businessFieldsFor(collectionName, record.fields);
  for (const [key, value] of Object.entries(answers)) {
    if (Object.hasOwn(record, key) && !isDeepStrictEqual(record[key], value)) throw new Error('Conflicting nested and top-level values; original record retained.');
  }
  const { fields, ...metadata } = record;
  void fields;
  return { ...metadata, ...answers };
}
