import { Sequelize } from 'sequelize';

// Один экземпляр Sequelize на всё приложение — через него идут все запросы к БД.
export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false, // не засоряем консоль SQL-запросами; включи true, если хочешь их видеть
  }
);

// Проверяем, что до БД реально можем достучаться. Бросит ошибку, если нет.
export async function connectDB() {
  await sequelize.authenticate();
}
