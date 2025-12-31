import { Client } from 'pg';
import { DatabaseConfig } from '../types';

export class Database {
    private client: Client;
    private config: DatabaseConfig;
    private connected: boolean = false;

    constructor(config: DatabaseConfig) {
        this.config = config;
        this.client = new Client({
            connectionString: config.connectionString,
            ssl: config.ssl || { rejectUnauthorized: false }
        });
    }

    async connect(): Promise<void> {
        if (!this.connected) {
            await this.client.connect();
            this.connected = true;
        }
    }

    async disconnect(): Promise<void> {
        if (this.connected) {
            await this.client.end();
            this.connected = false;
        }
    }

    async query(sql: string, params?: any[]): Promise<any> {
        if (!this.connected) {
            await this.connect();
        }
        return await this.client.query(sql, params);
    }

    getMaskedConnectionString(): string {
        return this.config.connectionString.replace(/:[^:]*@/, ':****@');
    }

    isConnected(): boolean {
        return this.connected;
    }
}
