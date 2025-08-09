// add-more-questions.js - Add comprehensive questions for all categories
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
};

const questionsByCategory = {
    1: [ // Phone Safety
        {
            questionText: "Someone calls and says they're from your school. They ask for your home address. What should you do?",
            explanation: "Never give personal information to unknown callers, even if they claim to be from your school. Always check with a trusted adult first.",
            hintText: "What would your parents want you to do?",
            type: 1, // multiple_choice
            options: [
                { text: "Give them the address", icon: "🏠", isCorrect: false },
                { text: "Ask a trusted adult first", icon: "👨‍👩‍👧", isCorrect: true },
                { text: "Hang up immediately", icon: "📞", isCorrect: false },
                { text: "Ask them to call back later", icon: "⏰", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: It's safe to answer unknown phone numbers when you're home alone.",
            explanation: "It's safer to let unknown calls go to voicemail when you're alone. You can always have an adult call back if it's important.",
            hintText: "Think about what keeps you safest.",
            type: 2, // true_false
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        },
        {
            questionText: "Your phone rings and the caller ID shows a number you don't recognize. What's the BEST thing to do?",
            explanation: "Letting unknown calls go to voicemail is the safest choice. Important callers will leave a message.",
            hintText: "What would keep you safest?",
            type: 1,
            options: [
                { text: "Answer and see who it is", icon: "📞", isCorrect: false },
                { text: "Let it go to voicemail", icon: "📧", isCorrect: true },
                { text: "Call the number back", icon: "↩️", isCorrect: false }
            ]
        },
        {
            questionText: "Someone calls asking for your mom's work information. They say it's urgent. What should you do?",
            explanation: "Never give out information about your family to strangers, even if they say it's urgent. Tell a trusted adult about the call.",
            hintText: "Remember: strangers shouldn't ask for family information.",
            type: 1,
            options: [
                { text: "Give them the information", icon: "📋", isCorrect: false },
                { text: "Say she's not home and hang up", icon: "🏠", isCorrect: false },
                { text: "Tell them to call back later", icon: "⏰", isCorrect: false },
                { text: "Tell a trusted adult about the call", icon: "👨‍👩‍👧", isCorrect: true }
            ]
        },
        {
            questionText: "True or False: If someone calls saying they have a prize for you, it's okay to give them your address.",
            explanation: "Real prizes don't require you to give personal information over the phone. These calls are often scams.",
            hintText: "Do real prizes usually work this way?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        }
    ],
    
    2: [ // Passwords
        {
            questionText: "Which password is the STRONGEST?",
            explanation: "Strong passwords use a mix of letters, numbers, and symbols. They're also longer and don't use common words.",
            hintText: "Look for the longest one with different types of characters.",
            type: 1,
            options: [
                { text: "password123", icon: "🔓", isCorrect: false },
                { text: "MyBirthday2023", icon: "🎂", isCorrect: false },
                { text: "Blue7$Elephant!Fun", icon: "🔐", isCorrect: true },
                { text: "123456789", icon: "🔢", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: It's okay to share your password with your best friend.",
            explanation: "Passwords should only be shared with trusted adults like parents. Even best friends shouldn't know your passwords.",
            hintText: "Who should know your secret information?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        },
        {
            questionText: "Your friend asks for your tablet password so they can play games. What should you do?",
            explanation: "Keep your passwords private, even from friends. You can let them play games while you're watching, but don't share the password.",
            hintText: "Think about keeping your stuff safe.",
            type: 1,
            options: [
                { text: "Give them the password", icon: "🔑", isCorrect: false },
                { text: "Let them play while you watch", icon: "👀", isCorrect: true },
                { text: "Tell them to ask their parents", icon: "👨‍👩‍👧", isCorrect: false },
                { text: "Say your tablet is broken", icon: "💻", isCorrect: false }
            ]
        },
        {
            questionText: "Which of these should NEVER be used in a password?",
            explanation: "Your real name, birthday, and pet's name are easy for others to guess. Good passwords use information that's hard to guess.",
            hintText: "What information about you do other people know?",
            type: 1,
            options: [
                { text: "Your favorite color", icon: "🎨", isCorrect: false },
                { text: "Your real name", icon: "👤", isCorrect: true },
                { text: "Random words", icon: "🎲", isCorrect: false },
                { text: "Made-up words", icon: "✨", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: Writing down passwords on paper and keeping them safe is better than using the same easy password for everything.",
            explanation: "It's better to write down different strong passwords and keep the paper safe than to use one weak password everywhere.",
            hintText: "Think about what's safer overall.",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: true },
                { text: "False", icon: "❌", isCorrect: false }
            ]
        }
    ],
    
    3: [ // Safe Clicking
        {
            questionText: "You get a popup that says 'You've won $1000! Click here!' What should you do?",
            explanation: "Popup ads that claim you've won prizes are usually fake and can be dangerous. Close them without clicking.",
            hintText: "Do you remember entering any contests?",
            type: 1,
            options: [
                { text: "Click to see what you won", icon: "🎁", isCorrect: false },
                { text: "Close the popup without clicking", icon: "❌", isCorrect: true },
                { text: "Share it with friends", icon: "👥", isCorrect: false },
                { text: "Take a screenshot first", icon: "📸", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: If a website looks colorful and fun, it's always safe for kids.",
            explanation: "The way a website looks doesn't tell you if it's safe. Even colorful sites can have dangerous content or links.",
            hintText: "Can appearances be deceiving?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        },
        {
            questionText: "Which link looks SAFEST to click on a kids' website?",
            explanation: "Links to games on trusted kids' sites are usually safe. Avoid links asking for downloads or personal information.",
            hintText: "Look for something fun but not asking for anything.",
            type: 1,
            options: [
                { text: "Download Free Games Now!", icon: "⬇️", isCorrect: false },
                { text: "Enter Your Info to Win!", icon: "📝", isCorrect: false },
                { text: "Play Puzzle Game", icon: "🧩", isCorrect: true },
                { text: "Click for Secret Prize!", icon: "🎁", isCorrect: false }
            ]
        },
        {
            questionText: "A website wants you to download something to 'make games run faster.' What should you do?",
            explanation: "Never download software without asking a trusted adult first. Many downloads can contain viruses or unwanted programs.",
            hintText: "Who should help you decide about downloads?",
            type: 1,
            options: [
                { text: "Download it right away", icon: "⬇️", isCorrect: false },
                { text: "Ask a trusted adult first", icon: "👨‍👩‍👧", isCorrect: true },
                { text: "Only download if it's free", icon: "💰", isCorrect: false },
                { text: "Check with friends first", icon: "👥", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: It's safe to click on ads that appear in your games.",
            explanation: "Game ads can sometimes lead to inappropriate websites or try to trick you. It's better to avoid clicking on ads.",
            hintText: "What are ads trying to do?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        }
    ],
    
    4: [ // Stranger Danger
        {
            questionText: "Someone you don't know sends you a friend request online and wants to meet in person. What should you do?",
            explanation: "Never agree to meet someone in person that you only know online. Always tell a trusted adult about these requests.",
            hintText: "Who should help you make decisions about meeting new people?",
            type: 1,
            options: [
                { text: "Agree to meet in a public place", icon: "🏪", isCorrect: false },
                { text: "Tell a trusted adult immediately", icon: "👨‍👩‍👧", isCorrect: true },
                { text: "Ask them more questions first", icon: "❓", isCorrect: false },
                { text: "Block them but don't tell anyone", icon: "🚫", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: If someone online says they're the same age as you, it's okay to share personal information.",
            explanation: "People online can lie about their age and identity. Never share personal information with people you meet online.",
            hintText: "Can people lie about who they are online?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        },
        {
            questionText: "An online friend asks for photos of you. What's the BEST response?",
            explanation: "Never send photos to people you only know online. This could be dangerous and the photos could be misused.",
            hintText: "Think about what could happen to your photos.",
            type: 1,
            options: [
                { text: "Send a recent school photo", icon: "📷", isCorrect: false },
                { text: "Don't send photos and tell an adult", icon: "🛡️", isCorrect: true },
                { text: "Only send photos of your pets", icon: "🐕", isCorrect: false },
                { text: "Ask them to send photos first", icon: "📸", isCorrect: false }
            ]
        },
        {
            questionText: "Someone in an online game offers you free items if you give them your real name and address. What should you do?",
            explanation: "This is a common trick used by dangerous people online. Never give personal information for 'free' items in games.",
            hintText: "Why would they need your real information for a game?",
            type: 1,
            options: [
                { text: "Give them the information", icon: "📝", isCorrect: false },
                { text: "Only give your first name", icon: "👤", isCorrect: false },
                { text: "Refuse and report them", icon: "🚨", isCorrect: true },
                { text: "Ask your friends what to do", icon: "👥", isCorrect: false }
            ]
        },
        {
            questionText: "True or False: It's safe to video chat with someone you met in an online game.",
            explanation: "Video chatting with strangers from online games can be very dangerous. Stick to the game's safe chat features only.",
            hintText: "What could strangers see or learn about you on video?",
            type: 2,
            options: [
                { text: "True", icon: "✅", isCorrect: false },
                { text: "False", icon: "❌", isCorrect: true }
            ]
        }
    ]
};

async function addMoreQuestions() {
    let connection;
    
    try {
        console.log('🔄 Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database');

        for (const [categoryId, questions] of Object.entries(questionsByCategory)) {
            console.log(`\n📚 Adding questions for category ${categoryId}...`);
            
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                
                // Insert question
                const [result] = await connection.execute(`
                    INSERT INTO questions (category_id, question_type_id, question_text, explanation, hint_text, points, difficulty_level)
                    VALUES (?, ?, ?, ?, ?, 15, 'easy')
                `, [categoryId, q.type, q.questionText, q.explanation, q.hintText]);

                const questionId = result.insertId;
                console.log(`  ✅ Added question ${questionId}: ${q.questionText.substring(0, 50)}...`);

                // Insert answer options
                for (let j = 0; j < q.options.length; j++) {
                    await connection.execute(`
                        INSERT INTO answer_options (question_id, option_text, icon, is_correct, order_position)
                        VALUES (?, ?, ?, ?, ?)
                    `, [questionId, q.options[j].text, q.options[j].icon, q.options[j].isCorrect, j + 1]);
                }
            }
        }

        // Update category totals
        console.log('\n🔄 Updating category question counts...');
        await connection.execute(`
            UPDATE categories c 
            SET total_questions = (
                SELECT COUNT(*) FROM questions q 
                WHERE q.category_id = c.id AND q.is_active = true
            )
        `);

        console.log('✅ All questions added and category counts updated!');
        console.log('\nQuestion counts per category:');
        
        const [counts] = await connection.execute(`
            SELECT c.name, c.total_questions 
            FROM categories c 
            ORDER BY c.id
        `);
        
        counts.forEach(cat => {
            console.log(`  ${cat.name}: ${cat.total_questions} questions`);
        });

    } catch (error) {
        console.error('❌ Error adding questions:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addMoreQuestions();