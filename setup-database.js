// Database Setup Script for Kids Cybersecurity Quiz
// Run this script to set up your database with tables and sample data
// Usage: node setup-database.js

const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true
};

async function setupDatabase() {
    let connection;
    
    try {
        console.log('🔄 Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MySQL database');

        // Create tables
        console.log('🔄 Creating tables...');
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS categories (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                icon VARCHAR(50) NOT NULL,
                description TEXT,
                total_questions INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS question_types (
                id INT PRIMARY KEY AUTO_INCREMENT,
                type_name VARCHAR(50) NOT NULL,
                difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'easy',
                description TEXT
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                category_id INT NOT NULL,
                question_type_id INT NOT NULL,
                question_text TEXT NOT NULL,
                image_url VARCHAR(255),
                difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'easy',
                points INT DEFAULT 10,
                explanation TEXT,
                hint_text TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id),
                FOREIGN KEY (question_type_id) REFERENCES question_types(id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS answer_options (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question_id INT NOT NULL,
                option_text VARCHAR(255) NOT NULL,
                icon VARCHAR(50),
                image_url VARCHAR(255),
                is_correct BOOLEAN NOT NULL DEFAULT FALSE,
                order_position INT DEFAULT 1,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS badges (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                category_id INT,
                requirement_type ENUM('points', 'category_complete', 'streak', 'questions_answered') NOT NULL,
                requirement_value INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                total_points INT DEFAULT 0,
                current_streak INT DEFAULT 0,
                best_streak INT DEFAULT 0,
                preferred_question_type_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (preferred_question_type_id) REFERENCES question_types(id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_progress (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                category_id INT NOT NULL,
                questions_answered INT DEFAULT 0,
                correct_answers INT DEFAULT 0,
                points_earned INT DEFAULT 0,
                is_completed BOOLEAN DEFAULT FALSE,
                last_question_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (category_id) REFERENCES categories(id),
                FOREIGN KEY (last_question_id) REFERENCES questions(id),
                UNIQUE KEY unique_user_category (user_id, category_id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_badges (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                badge_id INT NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (badge_id) REFERENCES badges(id),
                UNIQUE KEY unique_user_badge (user_id, badge_id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS question_attempts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                question_id INT NOT NULL,
                question_type_id INT NOT NULL,
                selected_answer_id INT,
                is_correct BOOLEAN NOT NULL,
                time_taken INT,
                hint_used BOOLEAN DEFAULT FALSE,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (question_id) REFERENCES questions(id),
                FOREIGN KEY (question_type_id) REFERENCES question_types(id),
                FOREIGN KEY (selected_answer_id) REFERENCES answer_options(id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_question_type_performance (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                question_type_id INT NOT NULL,
                total_attempts INT DEFAULT 0,
                correct_attempts INT DEFAULT 0,
                success_rate DECIMAL(5,2) DEFAULT 0.00,
                avg_time_taken DECIMAL(6,2) DEFAULT 0.00,
                last_attempted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (question_type_id) REFERENCES question_types(id),
                UNIQUE KEY unique_user_question_type (user_id, question_type_id)
            )
        `);

        console.log('✅ All tables created successfully');

        // Insert initial data
        console.log('🔄 Inserting initial data...');

        // Categories
        await connection.execute(`
            INSERT IGNORE INTO categories (id, name, icon, description, total_questions) VALUES
            (1, 'Phone Safety', '📱', 'Learn how to use phones safely and avoid dangerous calls', 5),
            (2, 'Passwords', '🔐', 'Understand why passwords are important and how to keep them secret', 5),
            (3, 'Safe Clicking', '🖱️', 'Learn what links and buttons are safe to click', 5),
            (4, 'Stranger Danger', '👤', 'Know how to stay safe from strangers online and offline', 5)
        `);

        // Question Types
        await connection.execute(`
            INSERT IGNORE INTO question_types (id, type_name, difficulty_level, description) VALUES
            (1, 'multiple_choice', 'easy', 'Choose the best answer from multiple options'),
            (2, 'true_false', 'easy', 'Decide if a statement is true or false'),
            (3, 'visual_choice', 'easy', 'Choose the correct answer using pictures'),
            (4, 'drag_drop', 'medium', 'Drag items to the correct places'),
            (5, 'scenario_based', 'medium', 'Answer based on a real-life situation')
        `);

        // Badges
        await connection.execute(`
            INSERT IGNORE INTO badges (id, name, description, icon, category_id, requirement_type, requirement_value) VALUES
            (1, 'First Steps', 'Answer your first question correctly!', '⭐', NULL, 'questions_answered', 1),
            (2, 'Phone Guardian', 'Complete all Phone Safety questions', '📱', 1, 'category_complete', 1),
            (3, 'Password Hero', 'Complete all Password questions', '🔐', 2, 'category_complete', 1),
            (4, 'Click Champion', 'Complete all Safe Clicking questions', '🖱️', 3, 'category_complete', 1),
            (5, 'Safety Star', 'Complete all Stranger Danger questions', '👤', 4, 'category_complete', 1),
            (6, 'Point Collector', 'Earn 100 points', '💯', NULL, 'points', 100),
            (7, 'Streak Master', 'Get 5 questions right in a row', '🔥', NULL, 'streak', 5),
            (8, 'Quiz Pro', 'Answer 50 questions', '🏆', NULL, 'questions_answered', 50)
        `);

        console.log('✅ Initial data inserted successfully');

        // Insert sample questions (you can add more later)
        console.log('🔄 Adding sample questions...');
        
        // Phone Safety Questions
        const phoneQuestions = [
            {
                questionText: "Someone you don't know calls and asks for your mom's credit card number. What should you do?",
                explanation: "Never give personal information to strangers on the phone. Always tell a grown-up about these calls.",
                hintText: "Think about what your parents taught you about talking to strangers.",
                options: [
                    { text: "Give them the numbers", icon: "📞", isCorrect: false },
                    { text: "Tell mom about the call", icon: "👩", isCorrect: true },
                    { text: "Hang up and ignore", icon: "🔇", isCorrect: false }
                ]
            },
            {
                questionText: "True or False: It's okay to answer the phone when mom and dad are not home.",
                explanation: "It's safer to let the answering machine or voicemail pick up when parents aren't around.",
                hintText: "What would keep you safest?",
                options: [
                    { text: "True", icon: "✅", isCorrect: false },
                    { text: "False", icon: "❌", isCorrect: true }
                ]
            }
        ];

        for (let i = 0; i < phoneQuestions.length; i++) {
            const q = phoneQuestions[i];
            const questionType = q.options.length === 2 ? 2 : 1; // true/false or multiple choice
            
            const [result] = await connection.execute(`
                INSERT INTO questions (category_id, question_type_id, question_text, explanation, hint_text, points)
                VALUES (1, ?, ?, ?, ?, 15)
            `, [questionType, q.questionText, q.explanation, q.hintText]);

            const questionId = result.insertId;

            for (let j = 0; j < q.options.length; j++) {
                await connection.execute(`
                    INSERT INTO answer_options (question_id, option_text, icon, is_correct, order_position)
                    VALUES (?, ?, ?, ?, ?)
                `, [questionId, q.options[j].text, q.options[j].icon, q.options[j].isCorrect, j + 1]);
            }
        }

        console.log('✅ Sample questions added successfully');
        console.log('🎉 Database setup completed!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Start your server: npm start');
        console.log('2. Test the API: http://localhost:3000/health');
        console.log('3. Connect your Flutter app to the API');

    } catch (error) {
        console.error('❌ Error setting up database:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Check if required environment variables are set
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    console.error('❌ Missing required environment variables.');
    console.error('Please make sure you have a .env file with:');
    console.error('- DB_HOST');
    console.error('- DB_USER'); 
    console.error('- DB_PASSWORD');
    console.error('- DB_NAME');
    process.exit(1);
}

// Run the setup
setupDatabase();