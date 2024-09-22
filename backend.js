import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import session from "express-session";
import { DateTime } from "luxon";
import dotenv from "dotenv";
import Redis from "ioredis";
import RedisStore from 'connect-redis'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
      rejectUnauthorized: false
  }
});

db.connect();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "home.html"));
});

console.log('Connecting to Redis at:', process.env.REDIS_URL);
const redisClient = new Redis(process.env.REDIS_URL);

app.set('trust proxy', 1); // Trust the first proxy (Render's reverse proxy)

// Configure session to use Redis store
app.use(session({
  store: new RedisStore({ client: redisClient}),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    name: 'sessionId',
    // maxAge: 1000 * 60 * 60 * 24,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
  }
}));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/api/isLoggedIn", (req, res) => {
  if (req.session.userId) {
      res.json({ isLoggedIn: true, username: req.session.username });
  } else {
      res.json({ isLoggedIn: false });
  }
});

let userTimeZone = null;

// Retrieve cards that are due for review
async function cardsForReview(currentUser, userTimeZone) {
  let currentDate = DateTime.now().setZone(userTimeZone);
  if (currentDate.minute !== 0 || currentDate.second !== 0 || currentDate.millisecond !== 0) {
    currentDate = currentDate.plus({ hours: 1 }).startOf('hour');
  }
  const currentDateUTC = currentDate.toUTC().toISO();

  const result = await db.query(`
    SELECT *
    FROM n2kanji 
    JOIN progress 
    ON n2kanji.id = progress.flashcard_id
    WHERE 
      progress.next_read <= $1
      AND progress.user_id = $2;
    `,
    [currentDateUTC, currentUser]
  );

  return result;
}

// returns number of cards that are for review
app.get("/numberOfReviewCards", async (req, res) => {
  try {
    const currentUser = req.session.userId;
    const currentUserLevel = req.session.userLevel;
    const userTimeZone = req.session.userTimeZone;
    let result = await cardsForReview(currentUser, userTimeZone);
    const numberOfCards = result.rows.length;
    // console.log(numberOfCards);

    res.json({ numberOfCards });
  } catch (err) {
    console.error("Error counting revision flashcards", err);
    res.status(500).send("Error counting revision flashcards");
  }
})

// returns number of new cards to be learnt
app.get("/numberOfNewCards", async (req, res) => {
  try {
    console.log("Session data numberofnewcards:", req.session);
    const currentUser = req.session.userId;
    const currentUserLevel = req.session.userLevel;

    console.log(`currentuser: ${currentUser}`);
    console.log(`currentuserlevel: ${currentUserLevel}`);
    let result = await checkCards(currentUser, currentUserLevel);
    const numberOfCards = result && result.rows ? result.rows.length : 0;

    res.json({ numberOfCards });
  } catch (err) {
    console.error("Error counting new flashcards", err);
    res.status(500).send("Error counting new flashcards");
  }
})

let kanjiCompleted = false;
let vocabCompleted = false;
let kanjiNow = false;
let vocabNow = false;

// check if new kanji or vocab cards need to be retrieved for learning
async function checkCards (currentUser, currentUserLevel) {
  let result = null;

  const completedKanji = await db.query(`SELECT * FROM progress WHERE japanese_level = $1 AND user_id = $2 AND type = 'kanji' AND levels > 0`, [currentUserLevel, currentUser]);
  const totalKanji = await db.query(`SELECT * FROM n2kanji WHERE japanese_level = $1 AND type = 'kanji'`, [currentUserLevel]);
  const goToVocab = await db.query(`SELECT * FROM progress WHERE japanese_level = $1 AND user_id = $2 AND type = 'kanji' AND levels > 3`, [currentUserLevel, currentUser]);

  const completedVocab = await db.query(`SELECT * FROM progress WHERE japanese_level = $1 AND user_id = $2 AND type = 'vocab' AND levels > 0`, [currentUserLevel, currentUser]);
  const totalVocab = await db.query(`SELECT * FROM n2kanji WHERE japanese_level = $1 AND type = 'vocab'`, [currentUserLevel]);
  const goToKanji = await db.query(`SELECT * FROM progress WHERE japanese_level = $1 AND user_id = $2 AND type = 'vocab' AND levels > 3`, [currentUserLevel, currentUser]);

  if (completedKanji && completedKanji.rows.length == totalKanji.rows.length) {
    kanjiCompleted = true;    
  } else {
    kanjiCompleted = false;
  }
  
  if (completedVocab && completedVocab.rows.length == totalVocab.rows.length) {
    vocabCompleted = true;
  } else {
    vocabCompleted = false;
  }

  if (totalVocab && goToKanji && goToKanji.rows.length == totalVocab.rows.length) {
    currentUserLevel += 1;
    await db.query(`
      UPDATE users
      SET current_level = $1
      WHERE user_id = $2;
    `, [currentUserLevel, currentUser]);
  }
  // 3 cases to access new cards, 1) first kanji batch, 2) move to vocab after mastering kanji, 3) move to kanji after mastering vocab
  (!kanjiCompleted && currentUserLevel == 1) || (goToVocab.rows.length == totalKanji.rows.length) || (goToKanji.rows.length == totalVocab.rows.length) ? result = await newCards(currentUser, currentUserLevel) : null;

  return result;
}

// fetch the new cards to learn
async function newCards (currentUser, currentUserLevel) {
    let result = null;

    if (!kanjiCompleted) {

      result = await db.query(`
        SELECT * 
        FROM n2kanji 
        WHERE japanese_level = $1 
          AND type = 'kanji' 
          AND NOT EXISTS (
            SELECT 1
            FROM progress 
            WHERE progress.flashcard_id = n2kanji.id 
              AND progress.user_id = $2
              AND meaning_status = 'completed'
              AND reading_status = 'completed'
          )
        ORDER BY id ASC
      `, [currentUserLevel, currentUser]);
      
    }
    if (kanjiCompleted && !vocabCompleted) {

      result = await db.query(`
        SELECT * 
        FROM n2kanji 
        WHERE japanese_level = $1 
          AND type = 'vocab' 
          AND NOT EXISTS (
            SELECT 1 
            FROM progress 
            WHERE progress.flashcard_id = n2kanji.id 
              AND progress.user_id = $2
              AND meaning_status = 'completed'
              AND reading_status = 'completed'
          )
        ORDER BY id ASC
      `, [currentUserLevel, currentUser]);
      
    }
    
    return result;
}

let question = "reading";

// retrieve new flashcard to learn
app.get("/newFlashcard", async (req, res) => {
  try {
    const currentUser = req.session.userId;
    const currentUserLevel = req.session.userLevel;
    kanjiCompleted = req.session.kanjiCompleted || false;
    vocabCompleted = req.session.vocabCompleted || false;

    let result = await checkCards(currentUser, currentUserLevel);
    req.session.kanjiCompleted = kanjiCompleted;
    req.session.vocabCompleted = vocabCompleted;
    req.session.userLevel = currentUserLevel;

    const options = ['meaning', 'reading'];
    
    let kanjiCount = 0;
    let vocabCount = 0;

    if (!result || result.rows.length == 0) {
      await db.query(`
      UPDATE progress
      SET  meaning_status = 'incomplete',
	    reading_status = 'incomplete'
      WHERE user_id = $1;
      `, [currentUser]);
      const question = null;
      const newFlashcard = null;
      res.json({ newFlashcard, question, kanjiCount, vocabCount });
      return;
    }

    const newFlashcard = result.rows;

    result.rows.forEach(row => {
    if (row.type === 'kanji') {
        kanjiCount++;
    } else if (row.type === 'vocab') {
        vocabCount++;
    }
    });

    question == "meaning" ? question = "reading" : question = "meaning";

    res.json({ newFlashcard, question, kanjiCount, vocabCount });

  } catch (err) {
    console.error("Error generating new flashcard", err);
    res.status(500).send("Error generating new flashcard");
  }
 });

// retrieve revision flashcard
app.get('/flashcard', async (req, res) => {
    try {
      const currentUser = req.session.userId;

      const options = ['meaning', 'reading'];
      const randomNumber = Math.floor(Math.random()*2);
      const question = options[randomNumber];
      let result = await cardsForReview(currentUser, userTimeZone);

      const flashcard = result.rows;

      let kanjiCount = 0;
      let vocabCount = 0;

      flashcard.forEach(row => {
      if (row.type === 'kanji') {
          kanjiCount++;
      } else if (row.type === 'vocab') {
          vocabCount++;
      }
      });
      
      if (result.rows.length == 0) {
        await db.query(`
          UPDATE progress
          SET  meaning_status = 'incomplete',
          reading_status = 'incomplete'
          WHERE user_id = $1;
          `, [currentUser]);
        res.json({ flashcard, question, kanjiCount, vocabCount });
        return;
      }

      res.json({ flashcard, question, kanjiCount, vocabCount });
    } catch (err) {
      console.error('Error retrieving flashcard:', err);
      res.status(500).send('Error retrieving random word');
    }
  });

// determine when to next view a flashcard
async function nextView(correct, flashcard, currentUser, currentUserLevel) {
    let level = isNaN(flashcard.levels) ? 0 : flashcard.levels;
    const id = flashcard.id;

    let currentDate = DateTime.now().setZone(userTimeZone); 
    let hoursToAdd = 0;
    let daysToAdd = 0;
    let monthsToAdd = 0;
    let yearsToAdd = 0;

    if (correct) {
      level += 1;
    } else if (!correct && (level == 1 || level == 0)) {
      
    } else {
      level -= 1;
    }

    if (level == 1) {
        hoursToAdd = 4; 
    } else if (level == 2) {
        hoursToAdd = 8;
    } else if (level == 3) {
        daysToAdd = 1;
    } else if (level == 4) {
        daysToAdd = 2;
    } else if (level == 5) {
        daysToAdd = 7;
    } else if (level == 6) {
        daysToAdd = 14;
    } else if (level == 7) {
        monthsToAdd = 1;
    } else if (level == 8) {
        monthsToAdd = 4;
    }

    currentDate = currentDate.plus({ hours: hoursToAdd });
    currentDate = currentDate.plus({ days: daysToAdd });
    currentDate = currentDate.plus({ months: monthsToAdd });

    let nextReadUTC = currentDate.toUTC().toISO();

    if (correct) {
      await db.query(`
        INSERT INTO progress (flashcard_id, user_id, next_read, levels, type, japanese_level, ${question}_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'completed')
        ON CONFLICT (flashcard_id, user_id)
        DO UPDATE 
        SET 
          next_read = EXCLUDED.next_read, levels = EXCLUDED.levels;
      `, [id, currentUser, nextReadUTC, level, flashcard.type, currentUserLevel]);
    } else {
      await db.query(`
        UPDATE progress
        SET levels = $1
        WHERE flashcard_id = $2
        AND user_id = $3;
      `, [level, id, currentUser]);
    }
}

// deal with user's input
app.post('/answer', async (req, res) => {
    try {
      const currentUser = req.session.userId;
      const currentUserLevel = req.session.userLevel;
  
      let isCorrect = null;
      const { answer, flashcard, question } = req.body;

      const realAnswer = flashcard[question];
      const id = flashcard.id;
  
      if (!flashcard) {
        return res.status(400).json({ message: 'No flashcard provided' });
      }
  
      const possibleAnswers = realAnswer.split('/').map(ans => ans.trim());

      if (possibleAnswers.includes(answer.trim()) || answer == realAnswer) {
        isCorrect = true;

        await db.query(`
          INSERT INTO progress (flashcard_id, user_id, type, japanese_level, ${question}_status)
          VALUES ($1, $2, $3, $4, 'completed')
          ON CONFLICT (flashcard_id, user_id)
          DO UPDATE SET ${question}_status = 'completed';
        `, [id, currentUser, flashcard.type, currentUserLevel]);

        res.status(200).json({ message: 'Correct answer', answer: realAnswer });
      } else {
        isCorrect = false;

        nextView(isCorrect, flashcard, currentUser, currentUserLevel);

        res.status(200).json({ message: 'Incorrect answer', answer: realAnswer });
      }
      const result = await db.query(`
        SELECT *
        FROM progress
        WHERE flashcard_id = $1
          AND meaning_status = 'completed'
          AND reading_status = 'completed'
          AND user_id = $2;
    `, [id, currentUser]);

      result.rows.length == 1 ? nextView(isCorrect, flashcard, currentUser, currentUserLevel) : console.log(false);

    } catch (error) {
      console.error('Error handling the answer:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

// retrieve understanding levels for each flaschard for the user
async function cardLevels(currentUser) {
  const resultNovice = await db.query(`SELECT * FROM progress WHERE levels IN (1, 2, 3, 4) AND user_id = $1`, [currentUser]);
  const resultFamiliar = await db.query(`SELECT * FROM progress WHERE levels IN (5, 6) AND user_id = $1`, [currentUser]);
  const resultCompetent = await db.query(`SELECT * FROM progress WHERE levels = 7 AND user_id = $1`, [currentUser]);
  const resultProficient = await db.query(`SELECT * FROM progress WHERE levels = 8 AND user_id = $1`, [currentUser]);
  const resultMaster = await db.query(`SELECT * FROM progress WHERE levels = 9 AND user_id = $1`, [currentUser]);

  return {
    novice: resultNovice.rows.length,
    familiar: resultFamiliar.rows.length,
    competent: resultCompetent.rows.length,
    proficient: resultProficient.rows.length,
    master: resultMaster.rows.length
  };
}

// retrieve user level
app.get('/levels', async (req, res) => {

  const currentUser = req.session.userId;
  const currentUserLevel = req.session.userLevel;
  const levelsCount = await cardLevels(currentUser);

  res.json({ levelsCount, currentUserLevel });
})

// retrieve how many cards are for review today and before today
app.get("/forReviewToday", async (req, res) => {
  try {
    const currentUser = req.session.userId;
    const userTimeZone = req.session.userTimeZone;

    const startOfToday = DateTime.now().setZone(userTimeZone).startOf('day');
    const endOfToday = DateTime.now().setZone(userTimeZone).endOf('day');

    const startOfTodayUTC = startOfToday.toUTC().toISO();
    const endOfTodayUTC = endOfToday.toUTC().toISO();


    const reviewToday = await db.query(`
      SELECT DISTINCT* 
      FROM progress
      WHERE 
        next_read >= $1
        AND next_read <= $2
        AND user_id = $3;
      `,
      [startOfTodayUTC, endOfTodayUTC, currentUser]
    );

    const reviewFromBefore = await db.query(`
      SELECT *
      FROM progress
      WHERE 
        next_read < $1
        AND user_id = $2;
      `,
      [startOfTodayUTC, currentUser]
    );

    res.json({ reviewFromBefore: reviewFromBefore.rows, reviewToday: reviewToday.rows });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// user signup
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    const userCheck = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);

    if (userCheck.rows.length > 0) {
      res.status(400).json({ message: "invalid" });
      return;
    }

    // Salting and hashing the password
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);

    await db.query(`
      INSERT INTO users (username, hashed_password, current_level)
      VALUES ($1, $2, 1)
      `, [username, hash]);

    const user = await db.query(`
      SELECT user_id
      FROM users
      WHERE username = $1
      `, [username]);

    req.session.userId = user.rows[0].user_id;
    req.session.userLevel = 1;
    req.session.username = username;

    res.status(201).json({ message: 'valid'});
    
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

// user login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const userCheck = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);

    if (userCheck.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const hashedPassword = userCheck.rows[0].hashed_password;
    const match = await bcrypt.compare(password, hashedPassword);

    if (match) {
      req.session.userId = userCheck.rows[0].user_id;
      req.session.userLevel = userCheck.rows[0].current_level;
      req.session.username = username;

      req.session.save(async (err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Server error" });
        }
        res.status(200).json({ message: "Login successful" });
    });
    } else {
      return res.status(400).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// get user's local time zone
app.post("/setUserTimeZone", (req, res) => {
  const { timeZone } = req.body;
  if (timeZone) {
    req.session.userTimeZone = timeZone;
    console.log(timeZone);
    res.status(200).json({ message: "Time zone saved." });
  } else {
    res.status(400).json({ message: "Time zone not provided." });
  }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
