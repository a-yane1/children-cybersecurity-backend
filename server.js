// Fixed server.js with proper database connection handling
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// NEW CODE:
const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway proxy - ADD THIS LINE
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : true, // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting with proxy support
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    trustProxy: true, // ADD THIS LINE
    skipSuccessfulRequests: false
});
app.use(limiter);;

// Database connection pool configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection function
async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();
        await connection.execute('SELECT 1');
        connection.release();
        console.log('✅ Database connection pool established');
        return true;
    } catch (error) {
        console.error('⚠️ Database connection failed:', error.message);
        console.log('🔄 Server will start but database operations may fail');
        return false;
    }
}

// Helper function to get database connection
async function getDbConnection() {
    try {
        return await pool.getConnection();
    } catch (error) {
        console.error('Database connection error:', error);
        throw new Error('Database connection failed');
    }
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

// Adaptive Learning Algorithm
async function getAdaptiveQuestion(userId, categoryId) {
    const connection = await getDbConnection();
    try {
        // Get user's performance by question type
        const [performance] = await connection.execute(`
            SELECT qt.id, qt.type_name, 
                   COALESCE(utqp.success_rate, 0) as success_rate,
                   COALESCE(utqp.total_attempts, 0) as total_attempts
            FROM question_types qt
            LEFT JOIN user_question_type_performance utqp 
                ON qt.id = utqp.question_type_id AND utqp.user_id = ?
            ORDER BY utqp.success_rate ASC, utqp.total_attempts ASC
        `, [userId]);

        // Find the question type the user struggles with most
        let targetQuestionTypeId = performance[0]?.id || 1;
        
        // If user has low success rate (< 60%) on any type, prioritize easier formats
        const strugglingType = performance.find(p => p.success_rate < 60 && p.total_attempts >= 3);
        if (strugglingType) {
            // Switch to visual or easier question types
            const [easierTypes] = await connection.execute(`
                SELECT id FROM question_types 
                WHERE difficulty_level = 'easy' AND type_name IN ('visual_choice', 'true_false')
                ORDER BY RAND() LIMIT 1
            `);
            if (easierTypes.length > 0) {
                targetQuestionTypeId = easierTypes[0].id;
            }
        }

        // Get a question the user hasn't answered yet
        const [questions] = await connection.execute(`
            SELECT q.*, qt.type_name 
            FROM questions q
            JOIN question_types qt ON q.question_type_id = qt.id
            WHERE q.category_id = ? 
            AND q.question_type_id = ?
            AND q.is_active = true
            AND q.id NOT IN (
                SELECT question_id FROM question_attempts WHERE user_id = ?
            )
            ORDER BY RAND() 
            LIMIT 1
        `, [categoryId, targetQuestionTypeId, userId]);

        if (questions.length === 0) {
            // If no new questions of preferred type, get any unanswered question
            const [fallbackQuestions] = await connection.execute(`
                SELECT q.*, qt.type_name 
                FROM questions q
                JOIN question_types qt ON q.question_type_id = qt.id
                WHERE q.category_id = ? 
                AND q.is_active = true
                AND q.id NOT IN (
                    SELECT question_id FROM question_attempts WHERE user_id = ?
                )
                ORDER BY RAND() 
                LIMIT 1
            `, [categoryId, userId]);
            
            return fallbackQuestions[0] || null;
        }

        return questions[0];
    } catch (error) {
        console.error('Error in adaptive question selection:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Badge checking function
async function checkAndAwardBadges(userId) {
    const connection = await getDbConnection();
    try {
        const newBadges = [];
        
        // Get user stats
        const [userStats] = await connection.execute(`
            SELECT total_points, current_streak 
            FROM users WHERE id = ?
        `, [userId]);
        
        if (userStats.length === 0) return [];
        
        const { total_points, current_streak } = userStats[0];

        // Check all badges
        const [badges] = await connection.execute(`
            SELECT * FROM badges 
            WHERE id NOT IN (
                SELECT badge_id FROM user_badges WHERE user_id = ?
            )
        `, [userId]);

        for (const badge of badges) {
            let shouldAward = false;

            switch (badge.requirement_type) {
                case 'points':
                    shouldAward = total_points >= badge.requirement_value;
                    break;
                
                case 'streak':
                    shouldAward = current_streak >= badge.requirement_value;
                    break;
                
                case 'questions_answered':
                    const [questionCount] = await connection.execute(`
                        SELECT COUNT(*) as count FROM question_attempts WHERE user_id = ?
                    `, [userId]);
                    shouldAward = questionCount[0].count >= badge.requirement_value;
                    break;
                
                case 'category_complete':
                    if (badge.category_id) {
                        const [progress] = await connection.execute(`
                            SELECT is_completed FROM user_progress 
                            WHERE user_id = ? AND category_id = ?
                        `, [userId, badge.category_id]);
                        shouldAward = progress.length > 0 && progress[0].is_completed;
                    }
                    break;
            }

            if (shouldAward) {
                await connection.execute(`
                    INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)
                `, [userId, badge.id]);
                newBadges.push(badge);
            }
        }

        return newBadges;
    } catch (error) {
        console.error('Error checking badges:', error);
        return [];
    } finally {
        connection.release();
    }
}

// ===============================
// API ROUTES
// ===============================

// Health check
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        const connection = await getDbConnection();
        await connection.execute('SELECT 1');
        connection.release();
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            warning: 'Database connection failed but server is running'
        });
    }
});

// Create or get user
app.post('/api/users', async (req, res) => {
    let connection;
    try {
        const { name } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        connection = await getDbConnection();

        // Check if user exists
        const [existingUsers] = await connection.execute(`
            SELECT * FROM users WHERE name = ?
        `, [name.trim()]);

        if (existingUsers.length > 0) {
            // Update last_active
            await connection.execute(`
                UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?
            `, [existingUsers[0].id]);
            
            return res.json({ 
                message: 'Welcome back!', 
                user: existingUsers[0] 
            });
        }

        // Create new user
        const [result] = await connection.execute(`
            INSERT INTO users (name) VALUES (?)
        `, [name.trim()]);

        const [newUser] = await connection.execute(`
            SELECT * FROM users WHERE id = ?
        `, [result.insertId]);

        res.status(201).json({ 
            message: 'User created successfully', 
            user: newUser[0] 
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

// Get all categories with progress
app.get('/api/categories/:userId', async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        
        connection = await getDbConnection();
        
        const [categories] = await connection.execute(`
            SELECT c.*, 
                   COALESCE(up.questions_answered, 0) as questions_answered,
                   COALESCE(up.correct_answers, 0) as correct_answers,
                   COALESCE(up.points_earned, 0) as points_earned,
                   COALESCE(up.is_completed, false) as is_completed,
                   c.total_questions
            FROM categories c
            LEFT JOIN user_progress up ON c.id = up.category_id AND up.user_id = ?
            ORDER BY c.id
        `, [userId]);

        res.json({ categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

// Get user progress dashboard
app.get('/api/progress/:userId', async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        
        connection = await getDbConnection();
        
        // Get updated user info
        const [users] = await connection.execute(`
            SELECT * FROM users WHERE id = ?
        `, [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get category progress
        const [categoryProgress] = await connection.execute(`
            SELECT c.*, 
                   COALESCE(up.questions_answered, 0) as questions_answered,
                   COALESCE(up.correct_answers, 0) as correct_answers,
                   COALESCE(up.points_earned, 0) as points_earned,
                   COALESCE(up.is_completed, false) as is_completed
            FROM categories c
            LEFT JOIN user_progress up ON c.id = up.category_id AND up.user_id = ?
            ORDER BY c.id
        `, [userId]);
        
        // Get earned badges
        const [earnedBadges] = await connection.execute(`
            SELECT b.*, ub.earned_at
            FROM badges b
            JOIN user_badges ub ON b.id = ub.badge_id
            WHERE ub.user_id = ?
            ORDER BY ub.earned_at DESC
        `, [userId]);
        
        // Get all badges
        const [allBadges] = await connection.execute(`
            SELECT b.*, 
                   CASE WHEN ub.badge_id IS NOT NULL THEN TRUE ELSE FALSE END as is_earned,
                   ub.earned_at
            FROM badges b
            LEFT JOIN user_badges ub ON b.id = ub.badge_id AND ub.user_id = ?
            ORDER BY b.id
        `, [userId]);
        
        res.json({
            user: users[0],
            categoryProgress,
            earnedBadges,
            allBadges
        });
        
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

// Get adaptive question for category
app.get('/api/questions/:userId/:categoryId', async (req, res) => {
    let connection;
    try {
        const { userId, categoryId } = req.params;
        
        const question = await getAdaptiveQuestion(userId, categoryId);
        
        if (!question) {
            return res.json({ 
                message: 'No more questions available', 
                question: null 
            });
        }

        connection = await getDbConnection();
        
        // Get answer options
        const [options] = await connection.execute(`
            SELECT id, option_text, icon, image_url, order_position
            FROM answer_options 
            WHERE question_id = ? 
            ORDER BY order_position
        `, [question.id]);

        question.options = options;

        res.json({ question });
    } catch (error) {
        console.error('Error fetching question:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

// Submit answer
// Submit answer
app.post('/api/answers', async (req, res) => {
    let connection;
    try {
        const { 
            userId, 
            questionId, 
            selectedAnswerId, 
            timeTaken, 
            hintUsed = false 
        } = req.body;

        console.log('📝 Submit answer request:', { userId, questionId, selectedAnswerId, timeTaken });

        connection = await getDbConnection();

        // Get question details and check if the selected answer is correct
        const [questions] = await connection.execute(`
            SELECT q.*, qt.type_name
            FROM questions q
            JOIN question_types qt ON q.question_type_id = qt.id
            WHERE q.id = ?
        `, [questionId]);

        if (questions.length === 0) {
            console.log('❌ Question not found:', questionId);
            return res.status(400).json({ error: 'Question not found' });
        }

        const question = questions[0];

        // Check if the selected answer is correct
        const [selectedAnswer] = await connection.execute(`
            SELECT is_correct FROM answer_options WHERE id = ?
        `, [selectedAnswerId]);

        if (selectedAnswer.length === 0) {
            console.log('❌ Answer option not found:', selectedAnswerId);
            return res.status(400).json({ error: 'Answer option not found' });
        }

        const isCorrect = selectedAnswer[0].is_correct === 1; // Handle MySQL boolean as int
        const pointsEarned = isCorrect ? question.points : 0;

        console.log('✅ Answer check:', { isCorrect, pointsEarned });

        // Record the attempt
        await connection.execute(`
            INSERT INTO question_attempts 
            (user_id, question_id, question_type_id, selected_answer_id, is_correct, time_taken, hint_used)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, questionId, question.question_type_id, selectedAnswerId, isCorrect, timeTaken, hintUsed]);

        // Update user stats
        if (isCorrect) {
            await connection.execute(`
                UPDATE users 
                SET total_points = total_points + ?, 
                    current_streak = current_streak + 1,
                    best_streak = GREATEST(best_streak, current_streak + 1)
                WHERE id = ?
            `, [pointsEarned, userId]);
        } else {
            await connection.execute(`
                UPDATE users SET current_streak = 0 WHERE id = ?
            `, [userId]);
        }

        // Update user progress for category
        await connection.execute(`
            INSERT INTO user_progress (user_id, category_id, questions_answered, correct_answers, points_earned)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
                questions_answered = questions_answered + 1,
                correct_answers = correct_answers + ?,
                points_earned = points_earned + ?,
                is_completed = CASE 
                    WHEN (questions_answered + 1) >= (SELECT total_questions FROM categories WHERE id = ?) 
                    THEN 1 ELSE 0 
                END
        `, [
            userId, question.category_id, isCorrect ? 1 : 0, pointsEarned,
            isCorrect ? 1 : 0, pointsEarned, question.category_id
        ]);

        // Update question type performance for adaptive learning
        await connection.execute(`
            INSERT INTO user_question_type_performance 
            (user_id, question_type_id, total_attempts, correct_attempts, avg_time_taken)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_attempts = total_attempts + 1,
                correct_attempts = correct_attempts + ?,
                success_rate = (correct_attempts + ?) / (total_attempts + 1) * 100,
                avg_time_taken = ((avg_time_taken * total_attempts) + ?) / (total_attempts + 1)
        `, [
            userId, question.question_type_id, isCorrect ? 1 : 0, timeTaken,
            isCorrect ? 1 : 0, isCorrect ? 1 : 0, timeTaken
        ]);

        // Check for new badges
        const newBadges = await checkAndAwardBadges(userId);

        // Get correct answer for explanation
        const [correctAnswer] = await connection.execute(`
            SELECT option_text FROM answer_options 
            WHERE question_id = ? AND is_correct = 1
        `, [questionId]);

        const response = {
            isCorrect,
            pointsEarned,
            explanation: question.explanation || 'Great job!',
            correctAnswer: correctAnswer[0]?.option_text || '',
            newBadges
        };

        console.log('📤 Sending response:', response);
        res.json(response);
    } catch (error) {
        console.error('❌ Error submitting answer:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Reset category progress
app.post('/api/reset-progress', async (req, res) => {
    let connection;
    try {
        const { userId, categoryId } = req.body;
        
        if (!userId || !categoryId) {
            return res.status(400).json({ error: 'UserId and categoryId are required' });
        }

        connection = await getDbConnection();

        console.log(`Resetting progress for user ${userId}, category ${categoryId}`);

        // Start transaction
        await connection.beginTransaction();

        try {
            // Delete all question attempts for this user and category
            await connection.execute(`
                DELETE qa FROM question_attempts qa
                JOIN questions q ON qa.question_id = q.id
                WHERE qa.user_id = ? AND q.category_id = ?
            `, [userId, categoryId]);

            // Reset user progress for this category
            await connection.execute(`
                DELETE FROM user_progress 
                WHERE user_id = ? AND category_id = ?
            `, [userId, categoryId]);

            // Reset question type performance for this category's questions
            await connection.execute(`
                UPDATE user_question_type_performance utqp
                JOIN questions q ON q.question_type_id = utqp.question_type_id
                SET utqp.total_attempts = GREATEST(0, utqp.total_attempts - (
                    SELECT COUNT(*) FROM question_attempts qa2 
                    JOIN questions q2 ON qa2.question_id = q2.id 
                    WHERE qa2.user_id = ? AND q2.category_id = ? AND qa2.question_type_id = utqp.question_type_id
                )),
                utqp.correct_attempts = GREATEST(0, utqp.correct_attempts - (
                    SELECT COUNT(*) FROM question_attempts qa3 
                    JOIN questions q3 ON qa3.question_id = q3.id 
                    WHERE qa3.user_id = ? AND q3.category_id = ? AND qa3.question_type_id = utqp.question_type_id AND qa3.is_correct = 1
                ))
                WHERE utqp.user_id = ?
            `, [userId, categoryId, userId, categoryId, userId]);

            // Recalculate user's total points
            const [totalPoints] = await connection.execute(`
                SELECT COALESCE(SUM(points_earned), 0) as total
                FROM user_progress 
                WHERE user_id = ?
            `, [userId]);

            // Update user's total points but keep streak as is
            await connection.execute(`
                UPDATE users 
                SET total_points = ?
                WHERE id = ?
            `, [totalPoints[0].total, userId]);

            // Commit transaction
            await connection.commit();

            console.log(`Successfully reset progress for user ${userId}, category ${categoryId}`);
            res.json({ message: 'Category progress reset successfully' });

        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error resetting category progress:', error);
        res.status(500).json({ error: 'Failed to reset progress: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize and start server
async function startServer() {
    // Test database connection on startup (but don't fail if it doesn't work)
    await testDatabaseConnection();
    
    // Start server regardless of database connection status
    app.listen(PORT, () => {
        console.log(`🚀 Kids Cybersecurity Quiz API running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`🎯 Ready to serve requests!`);
    });
}

startServer();

module.exports = app;