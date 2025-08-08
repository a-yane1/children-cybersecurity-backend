// debug-connection.js - Test database connection
require('dotenv').config();

console.log('🔍 Debugging database connection...');
console.log('Environment variables:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***hidden***' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME);

const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4'
};

console.log('\n🔄 Attempting connection with config:');
console.log('Host:', dbConfig.host);
console.log('Port:', dbConfig.port);
console.log('User:', dbConfig.user);
console.log('Database:', dbConfig.database);

async function testConnection() {
    try {
        console.log('\n🔗 Connecting...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connection successful!');
        
        console.log('\n🧪 Testing query...');
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ Query successful:', rows);
        
        await connection.end();
        console.log('✅ Connection closed successfully');
        
    } catch (error) {
        console.log('\n❌ Connection failed:');
        console.log('Error code:', error.code);
        console.log('Error message:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.log('\n💡 Suggestions:');
            console.log('1. Check if DB_HOST is correct in .env file');
            console.log('2. Make sure you copied the external Railway host (not internal)');
            console.log('3. Try using Railway\'s DATABASE_URL instead');
        }
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n💡 Suggestions:');
            console.log('1. Check DB_USER and DB_PASSWORD in .env file');
            console.log('2. Make sure the credentials match Railway exactly');
        }
    }
}

testConnection();