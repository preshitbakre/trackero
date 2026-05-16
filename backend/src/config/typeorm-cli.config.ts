import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'preshitbakre',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'trackero',
  entities: [__dirname + '/../**/*.entity.ts'],
  migrations: [__dirname + '/../../migrations/*.ts'],
  synchronize: false,
});
