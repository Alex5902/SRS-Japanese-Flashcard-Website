document.addEventListener("DOMContentLoaded", () => {

    const signup = document.querySelector(".signup");
    const login = document.querySelector("#loginForm .login");
    const modal = document.getElementById("loginModal");

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    fetch('/setUserTimeZone', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timeZone: userTimeZone }),
    });

    fetch('/api/isLoggedIn')
    .then(response => response.json())
    .then(data => {
        if (data.isLoggedIn) {
            modal.style.display = "none";
            document.querySelector(".banner h1").innerText = "Welcome to N2 Kanji " + data.username;
            signup.removeEventListener("click", signUp);
            login.removeEventListener("click", logIn);
            console.log("logged in");
            initialise();
        } else {
            modal.style.display = "flex";
            signup.addEventListener("click", async (event) => {
                await signUp(event);
            });
            login.addEventListener("click", async (event) => {
                await logIn(event);
            });
        }
    });
    
    const loginButton = document.querySelector("button");
    const closeButton = document.querySelector(".close");

    const loginHeader = document.getElementById("loginHeader");
    const signupHeader = document.getElementById("signupHeader");
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    // signup.addEventListener("click", signUp);
    // signup.addEventListener("click", async (event) => {
    //     await signUp(event);
    //     initialise();
    // });
    async function logIn(event) {
        event.preventDefault();
        try {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('error-message-login');
    
            errorMessage.style.display = 'none';
    
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            console.log('Request body:', { username, password });
            console.log(response);

            if (response.status == 200) {
                const result = await response.json();
                modal.style.display = "none";
                document.querySelector(".banner h1").innerText = "Welcome to N2 Kanji " + username;
                initialise();
            } else {
                const result = await response.json();
                console.log(result.message);
                if (result.message == "User not found") {
                    errorMessage.textContent = "Incorrect username!";
                } else if (result.message == "Invalid credentials") {
                    errorMessage.textContent = "Incorrect password!";
                } else {
                    errorMessage.textContent = "Login failed. Please try again.";
                }
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Error during login:', error);
            errorMessage.textContent = "An error occurred. Please try again.";
            errorMessage.style.display = 'block';
        }
    }
    
    async function signUp(event) {
        event.preventDefault();
        try {
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const errorMessage = document.getElementById('error-message');

            // window.localStorage.setItem('username', username);

            console.log(`password ${password}`);
            console.log(`confirm password ${confirmPassword}`);
            console.log(`username ${username}`);

            // Check if passwords match
            if (password != confirmPassword) {
                errorMessage.textContent = "Passwords do not match!";
                errorMessage.style.display = 'block';
                return;
            }

            errorMessage.style.display = 'none';
            const response = await fetch('/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            if (response.status === 201) {
                const result = await response.json();
                modal.style.display = "none";
                document.querySelector(".banner h1").innerText = "Welcome to N2 Kanji " + username;
                initialise();
              } else {
                const result = await response.json();
                if (result.message === "invalid") {
                  errorMessage.textContent = "Username is already taken!";
                } else {
                  errorMessage.textContent = "Signup failed. Please try again.";
                }
                errorMessage.style.display = 'block';
            }       
        } catch (error) {
            console.error('Error during signup:', error);
            errorMessage.textContent = "An error occurred. Please try again.";
            errorMessage.style.display = 'block';
        }
    }

    loginHeader.addEventListener("click", function() {
        loginForm.style.display = "block";
        signupForm.style.display = "none";

        loginHeader.classList.add("active");
        signupHeader.classList.remove("active");
    });

    signupHeader.addEventListener("click", function() {
        signupForm.style.display = "block";
        loginForm.style.display = "none";

        signupHeader.classList.add("active");
        loginHeader.classList.remove("active");
    });

    // loginButton.onclick = function () {
    //     modal.style.display = "flex";
    // };

    closeButton.onclick = function () {
        modal.style.display = "none";
    }
      
    async function numberOfReviewCards() {
        try {
            const response = await fetch("/numberOfReviewCards");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const numberOfCards = data.numberOfCards;
            document.querySelector(".review h3").innerText = numberOfCards;
            return numberOfCards;
        } catch (error) {
            console.error("Error fetching number of review cards:", error);
        }
    }

    async function numberOfNewCards() {
        try {
            const response = await fetch("/numberOfNewCards");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const numberOfCards = data.numberOfCards;

            document.querySelector(".new-words h3").innerText = numberOfCards;
            return numberOfCards;
        } catch (error) {
            console.error("Error fetching number of new cards:", error);
        }
    }

    async function levels() {
        try {
            const response = await fetch("/levels");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const novice = data.levelsCount.novice;
            const familiar = data.levelsCount.familiar;
            const competent = data.levelsCount.competent;
            const proficient = data.levelsCount.proficient;
            const master = data.levelsCount.master;
            const level = data.currentUserLevel;
           
            document.querySelector(".novice h2").innerText = novice;
            document.querySelector(".familiar h2").innerText = familiar;
            document.querySelector(".competent h2").innerText = competent;
            document.querySelector(".proficient h2").innerText = proficient;
            document.querySelector(".master h2").innerText = master;

            document.querySelector(".message h1").innerText = `You are currently LEVEL ${level}`;
        } catch (error) {
            console.error("Error fetching levels:", error);
        }
    }

    function convertToAnalog(hour) {
        const period = hour >= 12 ? 'pm' : 'am';  // Determine AM or PM
        const analogHour = hour % 12 || 12;       // Convert hour to 12-hour format
        return `${analogHour} ${period}`;
    }

    async function reviews() {
        try {
            const response = await fetch("/forReviewToday");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Initialize an array with 24 elements, each set to an empty array
            const hours = Array.from({ length: 24 }, () => []);

            const reviewToday = data.reviewToday;
            const reviewFromBefore = data.reviewFromBefore;
            const reviewFromBeforeCount = reviewFromBefore.length;
            const reviewTodayCount = reviewToday.length;

            const forecastContainer = document.querySelector('.forecast');
            forecastContainer.innerHTML = '';

            reviewToday.forEach(review => {
                const utcDate = new Date(review.next_read);
            
                if (isNaN(utcDate.getTime())) {
                    console.error(`Invalid date for next_read: ${review.next_read}`);
                    return;
                }
            
                const formatter = new Intl.DateTimeFormat('en-GB', {
                    hour: 'numeric',
                    hour12: false,
                    timeZone: userTimeZone
                });
                
                const hour = formatter.format(utcDate);  
                const hourNum = parseInt(hour, 10);
            
                console.log(`UTC Date: ${utcDate}, Local Hour: ${hourNum}`);
            
                if (hourNum >= 0 && hourNum < 24) {
                    hours[hourNum].push(review);
                } else {
                    console.error(`Invalid hour: ${hourNum}, review:`, review);
                }
            });
            
            
            let reviewCount = reviewFromBeforeCount;
            for (let hour = 0; hour <= 23; hour++) {
                if (hours[hour].length > 0) {
                    
                    reviewCount += hours[hour].length;

                    const rowDiv = document.createElement('div');
                    const timesDiv = document.createElement('div');
                    const barDiv = document.createElement('div');
                    const addedDiv = document.createElement('div');
                    const totalDiv = document.createElement('div');
                    const ratioDiv = document.createElement('div');
            
                    rowDiv.className = "row";
                    timesDiv.className = "times";
                    barDiv.className = "bar";
                    addedDiv.className = "added";
                    totalDiv.className = "total";
                    ratioDiv.className = "ratio";
            
                    timesDiv.textContent = convertToAnalog(hour);
                    addedDiv.textContent = `+${hours[hour].length}`;
                    totalDiv.textContent = reviewCount;
                    const percentage = 100*(hours[hour].length) / reviewTodayCount;
                    ratioDiv.style.width = percentage + '%';
            
                    rowDiv.appendChild(timesDiv);
                    rowDiv.appendChild(barDiv);
                    rowDiv.appendChild(addedDiv);
                    rowDiv.appendChild(totalDiv);
                    barDiv.appendChild(ratioDiv);

                    forecastContainer.appendChild(rowDiv);
                }
            }

            if (reviewTodayCount == 0) {
                const rowDiv = document.createElement('div');
                const timesDiv = document.createElement('div');
                const barDiv = document.createElement('div');
                const addedDiv = document.createElement('div');
                const totalDiv = document.createElement('div');
        
                rowDiv.className = "row";
                timesDiv.className = "times";
                barDiv.className = "bar";
                addedDiv.className = "added";
                totalDiv.className = "total";
        
                timesDiv.textContent = "Today";
                barDiv.textContent = "No reviews";
                barDiv.style.textAlign = "center";
                addedDiv.textContent = "+0";
                totalDiv.textContent = reviewFromBeforeCount;
        
                rowDiv.appendChild(timesDiv);
                rowDiv.appendChild(barDiv);
                rowDiv.appendChild(addedDiv);
                rowDiv.appendChild(totalDiv);

                forecastContainer.appendChild(rowDiv);
            }           

        } catch (error) {
            console.error("Error fetching reviews:", error);
        }
    }
    

    async function initialise() {
        levels();
        reviews();

        const numberOfReview = await numberOfReviewCards();
        const numberOfNew = await numberOfNewCards();

        const review = document.querySelector(".review");
        const learn = document.querySelector(".new-words");

        if (numberOfReview > 0) {
            review.addEventListener("click", () => {
                window.localStorage.setItem('revision', 'true');
                window.location.href = "/revision.html";
            });
        }

        if (numberOfNew > 0) {
            learn.addEventListener("click", () => {
                window.localStorage.setItem('revision', 'false');
                window.location.href = "/revision.html";
            });
        }
    }

    // initialise();
});
