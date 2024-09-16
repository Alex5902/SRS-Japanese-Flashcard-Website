document.addEventListener("DOMContentLoaded", () => {

let revision = window.localStorage.getItem('revision');

// document.addEventListener("DOMContentLoaded", () => {
//     revision = window.localStorage.getItem('revision');
// });
// console.log(revision);
const flashcardDiv = document.querySelector(".flashcard");
const questionDiv = document.querySelector(".question");
const flashcardH1 = document.querySelector(".flashcard h1");
const questionH1 = document.querySelector(".question h1");

let currentFlashcard = null;
let currentQuestion = null;

function wanakanaHandler(event) {
    const originalValue = event.target.value;
    const hiraganaValue = wanakana.toHiragana(originalValue, { IMEMode: true });
    event.target.value = hiraganaValue;
}

function progressBar (flashcardLength, count) {
    const progressBar = document.querySelector(".progress");

    const percentage = 100*(count)/(flashcardLength*2);
    // console.log(count);
    // console.log(flashcardLength);
    // console.log(percentage);
    progressBar.style.width = percentage + '%';
    progressBar.style.backgroundColor = "green";
}

let count = 0;
let flashcardCount = null;

async function fetchFlashcard () {
    await fetch("/flashcard")
    // .then(response => response.json())
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(text) });
        }
        return response.json();
    })
    .then(data => {
        const flashcard = data.flashcard;
        const question = data.question;
        const kanjiCount = data.kanjiCount;
        const vocabCount = data.vocabCount;

        const randomNumber = Math.floor(Math.random()*flashcard.length);

        if (!flashcard[0]) {
            console.log("no cards");
            count = 0;
            flashcardCount = null;
            window.location.href = "/home.html";
        }

        currentFlashcard = flashcard[randomNumber];
        currentQuestion = question;

        if (currentQuestion == "meaning") {
            currentFlashcard.meaning_status == "completed" ? currentQuestion = "reading" : null;
        } else if (currentQuestion == "reading") {
            currentFlashcard.reading_status == "completed" ? currentQuestion = "meaning" : null;
        }

        // progress bar
        flashcardCount ? null : flashcardCount = flashcard.length;    
        progressBar(flashcardCount, count);

        // changing revision page text depending on flashcard
        flashcardH1.innerText = currentFlashcard.vocabkanji;
        questionH1.innerText = currentFlashcard.type + " " + currentQuestion;
        console.log(currentQuestion);
        currentQuestion == 'meaning' ? questionDiv.classList.add("meaning-question") : questionDiv.classList.add("reading-question");
        currentQuestion == 'meaning' ? questionDiv.classList.remove("reading-question") : questionDiv.classList.remove("meaning-question");
        currentQuestion == 'meaning' ? questionH1.style.color = 'black' : questionH1.style.color = "white";
        currentFlashcard.type == 'kanji' ? flashcardDiv.classList.add("kanji-question") : flashcardDiv.classList.add("vocab-question");
        currentFlashcard.type == 'kanji' ? flashcardDiv.classList.remove("vocab-question") : flashcardDiv.classList.remove("kanji-question");
        document.querySelector(".kanji h1").innerText = kanjiCount;
        document.querySelector(".vocab h1").innerText = vocabCount;
        // console.log(currentQuestion);

        // converting to hiragana when necessary
        const inputField = document.querySelector("#answer");
        if (currentQuestion == "reading") {
            inputField.addEventListener('input', wanakanaHandler);
        } else {
            inputField.removeEventListener('input', wanakanaHandler);
        }
    })
    .catch(error => {
        console.log("Error fetching flashcard:", error);
    });
}

console.log(revision);
revision == "true" ? fetchFlashcard() : fetchNewFlashcard();

async function fetchNewFlashcard () {
    await fetch("/newFlashcard")
    .then(response => response.json())
    .then(data => {
        const newFlashcard = data.newFlashcard;
        const question = data.question;
        // const flashcardLength = data.count;
        const kanjiCount = data.kanjiCount;
        const vocabCount = data.vocabCount;

        if (!newFlashcard || !newFlashcard[0]) {
            console.log("go home");
            count = 0;
            flashcardCount = null;
            window.location.href = "/home.html";
        }

        currentFlashcard = newFlashcard[0];
        currentQuestion = question;
        // console.log(currentQuestion);

        // progress bar
        flashcardCount ? null : flashcardCount = newFlashcard.length;  
        // console.log(flashcardCount);
        progressBar(flashcardCount, count);
        
        flashcardH1.innerText = currentFlashcard.vocabkanji;
        questionH1.innerText = currentFlashcard.type + " " + currentQuestion;
        currentQuestion == 'meaning' ? questionDiv.classList.add("meaning-question") : questionDiv.classList.add("reading-question");
        currentQuestion == 'meaning' ? questionDiv.classList.remove("reading-question") : questionDiv.classList.remove("meaning-question");
        currentQuestion == 'meaning' ? questionH1.style.color = 'black' : questionH1.style.color = "white";
        // console.log(questionH1.style.color);
        currentFlashcard.type == 'kanji' ? flashcardDiv.classList.add("kanji-question") : flashcardDiv.classList.add("vocab-question");
        currentFlashcard.type == 'kanji' ? flashcardDiv.classList.remove("vocab-question") : flashcardDiv.classList.remove("kanji-question");
        document.querySelector(".kanji h1").innerText = kanjiCount;
        document.querySelector(".vocab h1").innerText = vocabCount;
        const inputField = document.querySelector("#answer");
        currentQuestion == "reading" ? inputField.value = currentFlashcard.reading : inputField.value = currentFlashcard.meaning;
        window.addEventListener('load', () => {
            inputField.focus();
        });
    })
}

document.querySelector("#answer").addEventListener("keydown", inputAnswer);

let hasAnswered = false;

function inputAnswer(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        if (!hasAnswered) {
            const answer = event.target.value;
            fetch("/answer", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ answer: answer, flashcard: currentFlashcard, question: currentQuestion })
            })
            .then(response => response.json())
            .then(data => {
                // console.log("Success:", data);
                hasAnswered = true;

                if (data.message === 'Correct answer') {
                    count += 1;
                    document.querySelector("#answer").style.backgroundColor = "lightgreen";
                } else {
                    document.querySelector("#answer").style.backgroundColor = "lightcoral";
                    document.querySelector(".flashcard h1"). innerText += " " + data.answer;
                }

                console.log("Press Enter again to fetch the flashcard.");
            })
            .catch(error => {
                console.log("Error:", error);
            });
        } else {
            revision == "true" ? fetchFlashcard() : fetchNewFlashcard();
            hasAnswered = false;

            // reset form input
            document.querySelector("#answer").style.backgroundColor = "";
            document.querySelector("#answer").value = "";
        }
    }
}

const homeButton = document.querySelector(".fa-house");
homeButton.addEventListener("click", returnHome);

function returnHome () {
    count = 0;
    flashcardCount = null;
    homeButton.removeEventListener("click", returnHome);
    window.location.href = "/home.html";
}

});