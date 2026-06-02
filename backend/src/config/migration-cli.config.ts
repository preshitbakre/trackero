import { DataSource } from 'typeorm';
import * as path from 'path';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'trackero',
  entities: [path.join(__dirname, '..', '**', '*.entity.js')],
  migrations: [path.join(__dirname, '..', '..', 'migrations', '*.js')],
  synchronize: false,
});
