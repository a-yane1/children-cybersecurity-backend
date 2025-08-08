// Kids Cybersecurity Quiz - Node.js Backend API
// File: server.js

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kids_cybersecurity_quiz',
    charset: 'utf8mb4'
};

let db;

async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

// Initialize database connection
connectDB();

// ===============================
// UTILITY FUNCTIONS
// ===============================

// Adaptive Learning Algorithm
async function getAdaptiveQuestion(userId, categoryId) {
    try {
        // Get user's performance by question type
        const [performance] = await db.execute(`
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
            const [easierTypes] = await db.execute(`
                SELECT id FROM question_types 
                WHERE difficulty_level = 'easy' AND type_name IN ('visual_choice', 'true_false')
                ORDER BY RAND() LIMIT 1
            `);
            if (easierTypes.length > 0) {
                targetQuestionTypeId = easierTypes[0].id;
            }
        }

        // Get a question the user hasn't answered yet
        const [questions] = await db.execute(`
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
            const [fallbackQuestions] = await db.execute(`
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
    }
}

// Badge checking function
async function checkAndAwardBadges(userId) {
    try {
        const newBadges = [];
        
        // Get user stats
        const [userStats] = await db.execute(`
            SELECT total_points, current_streak 
            FROM users WHERE id = ?
        `, [userId]);
        
        if (userStats.length === 0) return [];
        
        const { total_points, current_streak } = userStats[0];

        // Check all badges
        const [badges] = await db.execute(`
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
                    const [questionCount] = await db.execute(`
                        SELECT COUNT(*) as count FROM question_attempts WHERE user_id = ?
                    `, [userId]);
                    shouldAward = questionCount[0].count >= badge.requirement_value;
                    break;
                
                case 'category_complete':
                    if (badge.category_id) {
                        const [progress] = await db.execute(`
                            SELECT is_completed FROM user_progress 
                            WHERE user_id = ? AND category_id = ?
                        `, [userId, badge.category_id]);
                        shouldAward = progress.length > 0 && progress[0].is_completed;
                    }
                    break;
            }

            if (shouldAward) {
                await db.execute(`
                    INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)
                `, [userId, badge.id]);
                newBadges.push(badge);
            }
        }

        return newBadges;
    } catch (error) {
        console.error('Error checking badges:', error);
        return [];
    }
}

// ===============================
// API ROUTES
// ===============================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===============================
// USER MANAGEMENT
// ===============================

// Create or get user
app.post('/api/users', async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Check if user exists
        const [existingUsers] = await db.execute(`
            SELECT * FROM users WHERE name = ?
        `, [name.trim()]);

        if (existingUsers.length > 0) {
            // Update last_active
            await db.execute(`
                UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?
            `, [existingUsers[0].id]);
            
            return res.json({ 
                message: 'Welcome back!', 
                user: existingUsers[0] 
            });
        }

        // Create new user
        const [result] = await db.execute(`
            INSERT INTO users (name) VALUES (?)
        `, [name.trim()]);

        const [newUser] = await db.execute(`
            SELECT * FROM users WHERE id = ?
        `, [result.insertId]);

        res.status(201).json({ 
            message: 'User created successfully', 
            user: newUser[0] 
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [users] = await db.execute(`
            SELECT * FROM users WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===============================
// CATEGORIES
// ===============================

// Get all categories with progress
app.get('/api/categories/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [categories] = await db.execute(`
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
    }
});

// ===============================
// QUESTIONS & QUIZ
// ===============================

// Get adaptive question for category
app.get('/api/questions/:userId/:categoryId', async (req, res) => {
    try {
        const { userId, categoryId } = req.params;
        
        const question = await getAdaptiveQuestion(userId, categoryId);
        
        if (!question) {
            return res.json({ 
                message: 'No more questions available', 
                question: null 
            });
        }

        // Get answer options
        const [options] = await db.execute(`
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
    }
});

// Submit answer
app.post('/api/answers', async (req, res) => {
    try {
        const { 
            userId, 
            questionId, 
            selectedAnswerId, 
            timeTaken, 
            hintUsed = false 
        } = req.body;

        // Get question details
        const [questions] = await db.execute(`
            SELECT q.*, ao.is_correct, qt.type_name
            FROM questions q
            JOIN answer_options ao ON ao.question_id = q.id
            JOIN question_types qt ON q.question_type_id = qt.id
            WHERE q.id = ? AND ao.id = ?
        `, [questionId, selectedAnswerId]);

        if (questions.length === 0) {
            return res.status(400).json({ error: 'Invalid question or answer' });
        }

        const question = questions[0];
        const isCorrect = question.is_correct;
        const pointsEarned = isCorrect ? question.points : 0;

        // Record the attempt
        await db.execute(`
            INSERT INTO question_attempts 
            (user_id, question_id, question_type_id, selected_answer_id, is_correct, time_taken, hint_used)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, questionId, question.question_type_id, selectedAnswerId, isCorrect, timeTaken, hintUsed]);

        // Update user stats
        if (isCorrect) {
            await db.execute(`
                UPDATE users 
                SET total_points = total_points + ?, 
                    current_streak = current_streak + 1,
                    best_streak = GREATEST(best_streak, current_streak + 1)
                WHERE id = ?
            `, [pointsEarned, userId]);
        } else {
            await db.execute(`
                UPDATE users SET current_streak = 0 WHERE id = ?
            `, [userId]);
        }

        // Update user progress for category
        await db.execute(`
            INSERT INTO user_progress (user_id, category_id, questions_answered, correct_answers, points_earned)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
                questions_answered = questions_answered + 1,
                correct_answers = correct_answers + ?,
                points_earned = points_earned + ?
        `, [userId, question.category_id, isCorrect ? 1 : 0, pointsEarned, isCorrect ? 1 : 0, pointsEarned]);

        // Update question type performance for adaptive learning
        await db.execute(`
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
        const [correctAnswer] = await db.execute(`
            SELECT option_text FROM answer_options 
            WHERE question_id = ? AND is_correct = true
        `, [questionId]);

        res.json({
            isCorrect,
            pointsEarned,
            explanation: question.explanation,
            correctAnswer: correctAnswer[0]?.option_text || '',
            newBadges
        });
    } catch (error) {
        console.error('Error submitting answer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===============================
// PROGRESS & ACHIEVEMENTS
// ===============================

// Get user progress dashboard
app.get('/api/progress/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get user stats
        const [userStats] = await db.execute(`
            SELECT * FROM users WHERE id = ?
        `, [userId]);

        if (userStats.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get category progress
        const [categoryProgress] = await db.execute(`
            SELECT c.name, c.icon, c.total_questions,
                   COALESCE(up.questions_answered, 0) as questions_answered,
                   COALESCE(up.correct_answers, 0) as correct_answers,
                   COALESCE(up.points_earned, 0) as points_earned,
                   COALESCE(up.is_completed, false) as is_completed
            FROM categories c
            LEFT JOIN user_progress up ON c.id = up.category_id AND up.user_id = ?
            ORDER BY c.id
        `, [userId]);

        // Get earned badges
        const [earnedBadges] = await db.execute(`
            SELECT b.*, ub.earned_at
            FROM badges b
            JOIN user_badges ub ON b.id = ub.badge_id
            WHERE ub.user_id = ?
            ORDER BY ub.earned_at DESC
        `, [userId]);

        // Get all badges for progress tracking
        const [allBadges] = await db.execute(`
            SELECT * FROM badges ORDER BY requirement_value
        `, []);

        res.json({
            user: userStats[0],
            categoryProgress,
            earnedBadges,
            allBadges
        });
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leaderboard (top users by points)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const [topUsers] = await db.execute(`
            SELECT name, total_points, best_streak,
                   (SELECT COUNT(*) FROM user_badges WHERE user_id = users.id) as badge_count
            FROM users 
            WHERE total_points > 0
            ORDER BY total_points DESC, best_streak DESC
            LIMIT 10
        `);

        res.json({ leaderboard: topUsers });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===============================
// ADMIN ENDPOINTS (Optional)
// ===============================

// Add new question (for future content updates)
app.post('/api/admin/questions', async (req, res) => {
    try {
        const {
            categoryId,
            questionTypeId,
            questionText,
            explanation,
            hintText,
            points = 10,
            options = []
        } = req.body;

        // Insert question
        const [questionResult] = await db.execute(`
            INSERT INTO questions (category_id, question_type_id, question_text, explanation, hint_text, points)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [categoryId, questionTypeId, questionText, explanation, hintText, points]);

        const questionId = questionResult.insertId;

        // Insert answer options
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            await db.execute(`
                INSERT INTO answer_options (question_id, option_text, icon, is_correct, order_position)
                VALUES (?, ?, ?, ?, ?)
            `, [questionId, option.text, option.icon || '', option.isCorrect || false, i + 1]);
        }

        res.status(201).json({ 
            message: 'Question created successfully', 
            questionId 
        });
    } catch (error) {
        console.error('Error creating question:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===============================
// ERROR HANDLING & SERVER START
// ===============================

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Kids Cybersecurity Quiz API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;