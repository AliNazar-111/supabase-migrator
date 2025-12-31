import { DataExporter } from '../src/lib/data-exporter';
import { Database } from '../src/lib/database';
import { Logger } from '../src/lib/logger';

const mockDb = {} as unknown as Database;
const mockLogger = {} as unknown as Logger;

describe('DataExporter (SQL Escaping)', () => {
    let exporter: DataExporter;

    beforeEach(() => {
        exporter = new DataExporter(mockDb, mockLogger, './test-output');
    });

    process.env.TZ = 'UTC'; // Ensure consistent date stringification

    it('should escape strings with single quotes', () => {
        expect(exporter.escapeSQLValue("It's a test")).toBe("'It''s a test'");
    });

    it('should return NULL for null/undefined', () => {
        expect(exporter.escapeSQLValue(null)).toBe('NULL');
        expect(exporter.escapeSQLValue(undefined)).toBe('NULL');
    });

    it('should return string representations for numbers and booleans', () => {
        expect(exporter.escapeSQLValue(123)).toBe('123');
        expect(exporter.escapeSQLValue(true)).toBe('true');
        expect(exporter.escapeSQLValue(false)).toBe('false');
    });

    it('should format dates as ISO strings', () => {
        const date = new Date('2024-01-01T12:00:00Z');
        expect(exporter.escapeSQLValue(date)).toBe("'2024-01-01T12:00:00.000Z'");
    });

    it('should stringify and escape JSON objects', () => {
        const obj = { key: "value's" };
        expect(exporter.escapeSQLValue(obj)).toBe("'{\"key\":\"value''s\"}'");
    });
});
