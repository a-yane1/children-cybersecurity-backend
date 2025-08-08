// server.js - Main server file
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'yourpassword',
  database: process.env.DB_NAME || 'cybersecurity_quiz',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

// Initialize database connection
async function initializeDatabase() {
  try {
    db = mysql.createPool(dbConfig);
    
    // Test connection
    const connection = await db.getConnection();
    console.log('Connected to MySQL database');
    connection.release();
    
    // Create tables if they don't exist
    await createTables();
    
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Create database tables
async function createTables() {
  const tables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      total_points INT DEFAULT 0,
      badges_earned JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // Categories table
    `CREATE TABLE IF NOT EXISTS categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      icon VARCHAR(50) NOT NULL,
      description TEXT,
      total_questions INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Questions table
    `CREATE TABLE IF NOT EXISTS questions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category_id INT,
      question_text TEXT NOT NULL,
      question_type ENUM('multiple_choice', 'true_false', 'visual') NOT NULL,
      options JSON NOT NULL,
      correct_answer VARCHAR(255) NOT NULL,
      explanation TEXT NOT NULL,
      difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'easy',
      points INT DEFAULT 10,
      image_url VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    
    // User progress table
    `CREATE TABLE IF NOT EXISTS user_progress (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT,
      category_id INT,
      questions_answered INT DEFAULT 0,
      questions_correct INT DEFAULT 0,
      current_streak INT DEFAULT 0,
      best_streak INT DEFAULT 0,
      last_question_id INT,
      progress_percentage DECIMAL(5,2) DEFAULT 0.00,
      difficulty_adaptations JSON,
      last_5_answers JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE KEY unique_user_category (user_id, category_id)
    )`,
    
    // Quiz sessions table
    `CREATE TABLE IF NOT EXISTS quiz_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT,
      category_id INT,
      questions_answered JSON,
      current_question_index INT DEFAULT 0,
      session_score INT DEFAULT 0,
      session_status ENUM('active', 'completed', 'paused') DEFAULT 'active',
      adaptive_settings JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`
  ];
  
  for (const table of tables) {
    await db.execute(table);
  }
  
  console.log('Database tables created successfully');
  
  // Seed initial data
  await seedInitialData();
}

// Seed initial data
async function seedInitialData() {
  // Check if categories exist
  const [categories] = await db.execute('SELECT COUNT(*) as count FROM categories');
  
  if (categories[0].count === 0) {
    const initialCategories = [
      ['Phone Safety', '📱', 'Learn to stay safe when using phones and getting calls', 10],
      ['Password Safety', '🔐', 'Keep your passwords secret and secure', 8],
      ['Safe Clicking', '🖱️', 'Know what links are safe to click', 12],
      ['Stranger Danger Online', '👤', 'Recognize and avoid online strangers', 15]
    ];
    
    for (const category of initialCategories) {
      await db.execute(
        'INSERT INTO categories (name, icon, description, total_questions) VALUES (?, ?, ?, ?)',
        category
      );
    }
    
    console.log('Initial categories seeded');
    await seedSampleQuestions();
  }
}

// Seed sample questions
async function seedSampleQuestions() {
  const sampleQuestions = [
    // Phone Safety Questions
    {
      category_id: 1,
      question_text: "Someone calls asking for the numbers mom just got. What should you do?",
      question_type: "multiple_choice",
      options: JSON.stringify([
        { id: "a", text: "Give them the numbers", icon: "📞" },
        { id: "b", text: "Tell mom about the call", icon: "👩" },
        { id: "c", text: "Hang up and ignore", icon: "🔇" }
      ]),
      correct_answer: "b",
      explanation: "Never give codes to strangers on the phone! Always ask a grown-up first.",
      difficulty_level: "easy",
      points: 10
    },
    {
      category_id: 1,
      question_text: "Is it safe to answer calls from numbers you don't know?",
      question_type: "true_false",
      options: JSON.stringify([
        { id: "true", text: "Yes, it's always safe", icon: "✅" },
        { id: "false", text: "No, ask a grown-up first", icon: "❌" }
      ]),
      correct_answer: "false",
      explanation: "Unknown numbers might be strangers. Always let a grown-up answer first!",
      difficulty_level: "easy",
      points: 10
    },
    
    // Password Safety Questions
    {
      category_id: 2,
      question_text: "Your friend wants to know your tablet password. What do you do?",
      question_type: "multiple_choice",
      options: JSON.stringify([
        { id: "a", text: "Share it - friends are trusted", icon: "👥" },
        { id: "b", text: "Keep it secret", icon: "🔒" },
        { id: "c", text: "Ask mom or dad first", icon: "👨‍👩‍👧‍👦" }
      ]),
      correct_answer: "b",
      explanation: "Passwords should always stay secret, even from friends! Ask a grown-up to help set up safe sharing.",
      difficulty_level: "easy",
      points: 10
    },
    
    // Safe Clicking Questions
    {
      category_id: 3,
      question_text: "You see a popup saying 'You Won $1000! Click Here!' What do you do?",
      question_type: "multiple_choice",
      options: JSON.stringify([
        { id: "a", text: "Click it quickly!", icon: "💰" },
        { id: "b", text: "Close it and tell an adult", icon: "👨‍👩‍👧‍👦" },
        { id: "c", text: "Share it with friends first", icon: "👥" }
      ]),
      correct_answer: "b",
      explanation: "Popups like this are tricks! Close them and always tell a grown-up about strange messages.",
      difficulty_level: "easy",
      points: 10
    },
    
    // Stranger Danger Questions
    {
      category_id: 4,
      question_text: "Someone online asks for your home address. What should you do?",
      question_type: "true_false",
      options: JSON.stringify([
        { id: "true", text: "Share it if they seem nice", icon: "😊" },
        { id: "false", text: "Never share personal information", icon: "🚫" }
      ]),
      correct_answer: "false",
      explanation: "Never share your address, phone number, or school name with strangers online!",
      difficulty_level: "easy",
      points: 10
    }
  ];
  
  for (const question of sampleQuestions) {
    await db.execute(
      `INSERT INTO questions (category_id, question_text, question_type, options, correct_answer, explanation, difficulty_level, points) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        question.category_id,
        question.question_text,
        question.question_type,
        question.options,
        question.correct_answer,
        question.explanation,
        question.difficulty_level,
        question.points
      ]
    );
  }
  
  console.log('Sample questions seeded');
}

// Adaptive Learning Algorithm
function determineNextQuestion(recentAnswers, categoryQuestions) {
  if (!recentAnswers || recentAnswers.length === 0) {
    // First question - start with easy multiple choice
    return categoryQuestions.find(q => 
      q.difficulty_level === 'easy' && q.question_type === 'multiple_choice'
    ) || categoryQuestions[0];
  }
  
  const lastFive = recentAnswers.slice(-5);
  const correctCount = lastFive.filter(a => a.correct).length;
  
  // If struggling (less than 2 out of 5 correct)
  if (correctCount < 2) {
    // Switch to visual or easier questions
    const visualQuestions = categoryQuestions.filter(q => 
      q.question_type === 'visual' && q.difficulty_level === 'easy'
    );
    
    if (visualQuestions.length > 0) {
      return visualQuestions[Math.floor(Math.random() * visualQuestions.length)];
    }
    
    // Fall back to easy multiple choice
    const easyMC = categoryQuestions.filter(q => 
      q.question_type === 'multiple_choice' && q.difficulty_level === 'easy'
    );
    
    return easyMC[Math.floor(Math.random() * easyMC.length)] || categoryQuestions[0];
  }
  
  // If doing well (4+ out of 5 correct)
  if (correctCount >= 4) {
    // Increase difficulty
    const harderQuestions = categoryQuestions.filter(q => 
      q.difficulty_level === 'medium' || q.difficulty_level === 'hard'
    );
    
    if (harderQuestions.length > 0) {
      return harderQuestions[Math.floor(Math.random() * harderQuestions.length)];
    }
  }
  
  // Normal progression - random question
  return categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];
}

// API Routes

// Create new user
app.post('/api/users', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const [result] = await db.execute(
      'INSERT INTO users (name, total_points, badges_earned) VALUES (?, 0, ?)',
      [name.trim(), JSON.stringify([])]
    );
    
    res.status(201).json({
      success: true,
      user: {
        id: result.insertId,
        name: name.trim(),
        total_points: 0,
        badges_earned: []
      }
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const [users] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[0];
    user.badges_earned = JSON.parse(user.badges_earned || '[]');
    
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get categories with progress
app.get('/api/categories/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    let query = `
      SELECT c.*, 
             COALESCE(up.progress_percentage, 0) as progress_percentage,
             COALESCE(up.questions_answered, 0) as questions_answered,
             COALESCE(up.current_streak, 0) as current_streak
      FROM categories c
      LEFT JOIN user_progress up ON c.id = up.category_id AND up.user_id = ?
      ORDER BY c.id
    `;
    
    const [categories] = await db.execute(query, [userId || 0]);
    
    res.json({ success: true, categories });
    
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get adaptive question for category
app.get('/api/questions/:categoryId/:userId', async (req, res) => {
  try {
    const { categoryId, userId } = req.params;
    
    // Get all questions for the category
    const [questions] = await db.execute(
      'SELECT * FROM questions WHERE category_id = ?',
      [categoryId]
    );
    
    if (questions.length === 0) {
      return res.status(404).json({ error: 'No questions found for this category' });
    }
    
    // Get user's recent answers for adaptive learning
    const [progress] = await db.execute(
      'SELECT last_5_answers FROM user_progress WHERE user_id = ? AND category_id = ?',
      [userId, categoryId]
    );
    
    const recentAnswers = progress[0]?.last_5_answers ? 
      JSON.parse(progress[0].last_5_answers) : [];
    
    // Use adaptive algorithm to select next question
    const nextQuestion = determineNextQuestion(recentAnswers, questions);
    
    // Parse options JSON
    nextQuestion.options = JSON.parse(nextQuestion.options);
    
    res.json({ success: true, question: nextQuestion });
    
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Submit answer
app.post('/api/quiz/answer', async (req, res) => {
  try {
    const { userId, questionId, categoryId, selectedAnswer } = req.body;
    
    // Get question details
    const [questions] = await db.execute(
      'SELECT * FROM questions WHERE id = ?',
      [questionId]
    );
    
    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    const question = questions[0];
    const isCorrect = selectedAnswer === question.correct_answer;
    const pointsEarned = isCorrect ? question.points : 0;
    
    // Update user progress
    await db.execute(
      `INSERT INTO user_progress (user_id, category_id, questions_answered, questions_correct, last_5_answers)
       VALUES (?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
       questions_answered = questions_answered + 1,
       questions_correct = questions_correct + ?,
       current_streak = CASE WHEN ? THEN current_streak + 1 ELSE 0 END,
       best_streak = GREATEST(best_streak, CASE WHEN ? THEN current_streak + 1 ELSE current_streak END),
       last_5_answers = JSON_ARRAY_APPEND(
         CASE 
           WHEN JSON_LENGTH(COALESCE(last_5_answers, '[]')) >= 5 
           THEN JSON_REMOVE(last_5_answers, '$[0]')
           ELSE COALESCE(last_5_answers, '[]')
         END,
         '$',
         JSON_OBJECT('questionId', ?, 'correct', ?, 'timestamp', NOW())
       ),
       progress_percentage = (questions_correct / questions_answered) * 100,
       updated_at = CURRENT_TIMESTAMP`,
      [
        userId, categoryId, isCorrect ? 1 : 0, 
        JSON.stringify([{ questionId, correct: isCorrect, timestamp: new Date() }]),
        isCorrect ? 1 : 0, isCorrect, isCorrect,
        questionId, isCorrect
      ]
    );
    
    // Update user total points
    if (isCorrect) {
      await db.execute(
        'UPDATE users SET total_points = total_points + ? WHERE id = ?',
        [pointsEarned, userId]
      );
    }
    
    // Get current streak for response
    const [progress] = await db.execute(
      'SELECT current_streak FROM user_progress WHERE user_id = ? AND category_id = ?',
      [userId, categoryId]
    );
    
    res.json({
      success: true,
      correct: isCorrect,
      explanation: question.explanation,
      points_earned: pointsEarned,
      current_streak: progress[0]?.current_streak || 0
    });
    
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// Get user progress
app.get('/api/progress/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const [progress] = await db.execute(`
      SELECT up.*, c.name as category_name, c.icon as category_icon
      FROM user_progress up
      JOIN categories c ON up.category_id = c.id
      WHERE up.user_id = ?
      ORDER BY c.id
    `, [userId]);
    
    res.json({ success: true, progress });
    
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});