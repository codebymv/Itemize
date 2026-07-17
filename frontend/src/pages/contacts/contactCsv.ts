import type { ImportContactData } from '@/services/contactsApi';

export const MAX_CONTACT_CSV_BYTES = 1024 * 1024;
export const MAX_CONTACT_CSV_ROWS = 10_000;
export const MAX_CONTACT_CSV_COLUMNS = 20;

const headerMap: Record<string, keyof ImportContactData> = {
    first_name: 'first_name',
    firstname: 'first_name',
    first: 'first_name',
    last_name: 'last_name',
    lastname: 'last_name',
    last: 'last_name',
    email: 'email',
    email_address: 'email',
    phone: 'phone',
    phone_number: 'phone',
    mobile: 'phone',
    company: 'company',
    company_name: 'company',
    organization: 'company',
    job_title: 'job_title',
    jobtitle: 'job_title',
    title: 'job_title',
    position: 'job_title',
    street: 'street',
    address: 'street',
    street_address: 'street',
    city: 'city',
    state: 'state',
    province: 'state',
    zip: 'zip',
    zipcode: 'zip',
    zip_code: 'zip',
    postal_code: 'zip',
    country: 'country',
    status: 'status',
    tags: 'tags',
};

const normalizedHeader = (value: string): string =>
    value
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

const csvRecords = (csvText: string): string[][] => {
    const records: string[][] = [];
    let record: string[] = [];
    let value = '';
    let quoted = false;

    const pushValue = () => {
        record.push(value);
        value = '';
    };
    const pushRecord = () => {
        pushValue();
        records.push(record);
        record = [];
    };

    for (let index = 0; index < csvText.length; index += 1) {
        const character = csvText[index];
        if (quoted) {
            if (character === '"') {
                if (csvText[index + 1] === '"') {
                    value += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                value += character;
            }
            continue;
        }
        if (character === '"' && value.length === 0) {
            quoted = true;
        } else if (character === ',') {
            pushValue();
        } else if (character === '\n') {
            pushRecord();
        } else if (character !== '\r') {
            value += character;
        }
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted value.');
    if (value.length > 0 || record.length > 0) pushRecord();
    return records;
};

const byteLength = (value: string): number =>
    new TextEncoder().encode(value).byteLength;

export const parseContactCsv = (csvText: string): ImportContactData[] => {
    if (byteLength(csvText) > MAX_CONTACT_CSV_BYTES) {
        throw new Error('CSV files are limited to 1 MB.');
    }
    const records = csvRecords(csvText);
    if (records.length < 2) return [];

    const rawHeaders = records[0];
    if (rawHeaders.length > MAX_CONTACT_CSV_COLUMNS) {
        throw new Error(
            `CSV files are limited to ${MAX_CONTACT_CSV_COLUMNS} columns.`,
        );
    }
    const headers = rawHeaders.map(header => headerMap[normalizedHeader(header)]);
    const mapped = headers.filter(
        (header): header is keyof ImportContactData => header !== undefined,
    );
    if (mapped.length === 0) {
        throw new Error('CSV does not contain any recognized contact columns.');
    }
    if (new Set(mapped).size !== mapped.length) {
        throw new Error('CSV contains duplicate contact columns.');
    }

    const rows = records
        .slice(1)
        .filter(record => record.some(value => value.trim().length > 0));
    if (rows.length > MAX_CONTACT_CSV_ROWS) {
        throw new Error(
            `Contact imports are limited to ${MAX_CONTACT_CSV_ROWS} rows.`,
        );
    }

    return rows.flatMap((values) => {
        if (values.length > rawHeaders.length) {
            throw new Error('A CSV row contains more values than the header.');
        }
        const row: ImportContactData = {};
        headers.forEach((field, index) => {
            const value = values[index]?.trim();
            if (field && value) row[field] = value;
        });
        return row.first_name || row.last_name || row.email || row.company
            ? [row]
            : [];
    });
};
