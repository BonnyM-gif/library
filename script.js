// ========== FIREBASE CONFIG (REPLACE WITH YOUR OWN) ==========
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

let currentUser = null;
let currentUserRole = null;
let currentUserName = "";
const ADMIN_SECRET_KEY = "supersecret2026"; // change this!

// ========== AUTHENTICATION & ROLE ==========
async function register() {
    const name = document.getElementById("regName").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const adminSecret = document.getElementById("adminSecret").value;

    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        await userCred.user.sendEmailVerification();
        const role = (adminSecret === ADMIN_SECRET_KEY) ? "admin" : "student";
        await db.collection("users").doc(userCred.user.uid).set({
            name: name, email: email, role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (role === "student") {
            await db.collection("scores").doc(userCred.user.uid).set({ points: 0 });
        }
        alert("Registration successful! Please verify your email (check inbox) and then log in.");
        window.location.href = "login.html";
    } catch (err) {
        alert("Registration error: " + err.message);
    }
}

async function login() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    try {
        const userCred = await auth.signInWithEmailAndPassword(email, password);
        if (!userCred.user.emailVerified) {
            alert("Please verify your email before logging in. A verification link has been sent.");
            await auth.signOut();
            return;
        }
        const userDoc = await db.collection("users").doc(userCred.user.uid).get();
        if (!userDoc.exists) throw new Error("User role not found");
        const role = userDoc.data().role;
        if (role === "admin") {
            window.location.href = "admin.html";
        } else {
            window.location.href = "dashboard.html";
        }
    } catch (err) {
        alert("Login failed: " + err.message);
    }
}

function logout() {
    auth.signOut().then(() => {
        window.location.href = "login.html";
    });
}

function forgotPassword() {
    const email = prompt("Enter your email address:");
    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => alert("Password reset email sent! Check your inbox."))
            .catch(err => alert("Error: " + err.message));
    }
}

// ========== PAGE PROTECTION ==========
async function protectPage() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = "login.html";
                reject();
            } else {
                currentUser = user;
                const userDoc = await db.collection("users").doc(user.uid).get();
                if (userDoc.exists) {
                    currentUserRole = userDoc.data().role;
                    currentUserName = userDoc.data().name;
                }
                if (window.location.pathname.includes("admin.html") && currentUserRole !== "admin") {
                    alert("Access denied. Admins only.");
                    window.location.href = "dashboard.html";
                    reject();
                }
                resolve();
            }
        });
    });
}

// ========== DASHBOARD ==========
async function loadDashboard() {
    if (!currentUser) return;
    document.getElementById("userName").innerText = currentUserName;
    const scoreDoc = await db.collection("scores").doc(currentUser.uid).get();
    const points = scoreDoc.exists ? scoreDoc.data().points : 0;
    document.getElementById("dashboardScore").innerText = points;
}

// ========== LIBRARY ==========
async function displayBooks() {
    const listDiv = document.getElementById("bookList");
    if (!listDiv) return;
    const snapshot = await db.collection("books").orderBy("timestamp").get();
    listDiv.innerHTML = "";
    snapshot.forEach(doc => {
        const book = doc.data();
        listDiv.innerHTML += `
            <div class="book-card">
                <strong>${book.title}</strong>
                <a href="${book.link}" target="_blank" style="color:#22c55e;">📖 Read</a>
            </div>
        `;
    });
}

async function addBook() {
    if (currentUserRole !== "admin") return alert("Admin only");
    const title = document.getElementById("bookTitle").value;
    const link = document.getElementById("bookLink").value;
    if (!title || !link) return alert("Fill both fields");
    await db.collection("books").add({ title, link, timestamp: Date.now() });
    document.getElementById("bookTitle").value = "";
    document.getElementById("bookLink").value = "";
    displayBooks();
    if (document.getElementById("deleteBookSelect")) loadBooksForDeletion();
}

async function deleteBook() {
    if (currentUserRole !== "admin") return alert("Admin only");
    const select = document.getElementById("deleteBookSelect");
    const bookId = select.value;
    if (!bookId) return;
    await db.collection("books").doc(bookId).delete();
    loadBooksForDeletion();
    displayBooks();
}

async function loadBooksForDeletion() {
    if (currentUserRole !== "admin") return;
    const select = document.getElementById("deleteBookSelect");
    if (!select) return;
    select.innerHTML = '<option value="">-- Select book to delete --</option>';
    const snapshot = await db.collection("books").get();
    snapshot.forEach(doc => {
        const book = doc.data();
        select.innerHTML += `<option value="${doc.id}">${book.title}</option>`;
    });
}

function searchBooks() {
    const input = document.getElementById("search").value.toLowerCase();
    const cards = document.querySelectorAll(".book-card");
    cards.forEach(card => {
        const title = card.innerText.toLowerCase();
        card.style.display = title.includes(input) ? "flex" : "none";
    });
}

// ========== CALENDAR ==========
async function addEvent() {
    const date = document.getElementById("eventDate").value;
    const text = document.getElementById("eventText").value;
    if (!date || !text) return alert("Fill all fields");
    await db.collection("events").add({ date, text, timestamp: Date.now() });
    document.getElementById("eventDate").value = "";
    document.getElementById("eventText").value = "";
    displayEvents();
}

async function displayEvents() {
    const list = document.getElementById("events");
    if (!list) return;
    const snapshot = await db.collection("events").orderBy("date").get();
    list.innerHTML = "";
    for (const doc of snapshot.docs) {
        const ev = doc.data();
        list.innerHTML += `
            <li class="event-item">
                <span>📅 ${ev.date} – ${ev.text}</span>
                ${currentUserRole === "admin" ? `<button class="delete-btn" onclick="deleteEvent('${doc.id}')">🗑️</button>` : ""}
            </li>
        `;
    }
}

async function deleteEvent(eventId) {
    if (currentUserRole !== "admin") return;
    await db.collection("events").doc(eventId).delete();
    displayEvents();
}

// ========== RIDDLES ==========
const riddles = [
    { q: "I speak without a mouth. What am I?", a: "Echo" },
    { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
    { q: "What has keys but no locks?", a: "Piano" },
    { q: "What can you catch but not throw?", a: "Cold" },
    { q: "What is always in front of you but can’t be seen?", a: "Future" },
    { q: "I have cities, but no houses. I have mountains, but no trees. What am I?", a: "Map" },
    { q: "What gets wetter as it dries?", a: "Towel" },
    { q: "What has a heart that doesn’t beat?", a: "Artichoke" },
    { q: "I have a face and two hands, but no arms or legs. What am I?", a: "Clock" },
    { q: "What has words but never speaks?", a: "Book" }
];

let currentRiddleIndex = 0;
let currentScore = 0;

async function loadRiddleScore() {
    if (!currentUser) return;
    const doc = await db.collection("scores").doc(currentUser.uid).get();
    currentScore = doc.exists ? doc.data().points : 0;
    updateScoreDisplay();
}

async function updateScoreDisplay() {
    const scoreSpan = document.getElementById("score");
    if (scoreSpan) scoreSpan.innerText = currentScore;
    if (currentUser) {
        await db.collection("scores").doc(currentUser.uid).set({ points: currentScore });
    }
}

function nextRiddle() {
    currentRiddleIndex = (currentRiddleIndex + 1) % riddles.length;
    renderCurrentRiddle();
}

function prevRiddle() {
    currentRiddleIndex = (currentRiddleIndex - 1 + riddles.length) % riddles.length;
    renderCurrentRiddle();
}

function renderCurrentRiddle() {
    const box = document.getElementById("riddleBox");
    if (!box) return;
    const r = riddles[currentRiddleIndex];
    box.innerHTML = `
        <h3>❓ ${r.q}</h3>
        <button onclick="revealAnswer('${r.a.replace(/'/g, "\\'")}')">🔍 Reveal Answer</button>
        <button onclick="addPoint()">⭐ +1 point (solved)</button>
    `;
}

function revealAnswer(answer) {
    alert(`Answer: ${answer}`);
}

async function addPoint() {
    currentScore++;
    await updateScoreDisplay();
    alert("➕ +1 point! Great job!");
}

async function resetScore() {
    currentScore = 0;
    await updateScoreDisplay();
    alert("Score reset to 0");
}

// ========== PUBLIC CHAT ==========
async function sendPublicMessage() {
    const input = document.getElementById("messageInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await db.collection("messages").add({
        text: text,
        uid: currentUser.uid,
        name: currentUserName,
        type: "message",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function postAnnouncement() {
    if (currentUserRole !== "admin") return alert("Only admins can post announcements");
    const text = document.getElementById("announcementText").value.trim();
    if (!text) return;
    await db.collection("messages").add({
        text: text,
        uid: currentUser.uid,
        name: currentUserName,
        type: "announcement",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("announcementText").value = "";
}

function listenForPublicMessages() {
    const chatDiv = document.getElementById("chatMessages");
    if (!chatDiv) return;
    db.collection("messages")
        .orderBy("timestamp", "asc")
        .limit(50)
        .onSnapshot(snapshot => {
            chatDiv.innerHTML = "";
            snapshot.forEach(doc => {
                const msg = doc.data();
                const time = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString() : "";
                const isAnnouncement = msg.type === "announcement";
                const msgClass = isAnnouncement ? "announcement" : "message";
                chatDiv.innerHTML += `
                    <div class="${msgClass}">
                        <strong>${isAnnouncement ? "📢 ANNOUNCEMENT: " + msg.name : msg.name}</strong> <small>${time}</small><br>
                        ${msg.text}
                    </div>
                `;
            });
            chatDiv.scrollTop = chatDiv.scrollHeight;
        });
}

// ========== PRIVATE MESSAGING ==========
async function loadUsers() {
    const container = document.getElementById("userList");
    if (!container) return;
    const snapshot = await db.collection("users").where("role", "==", "student").get();
    container.innerHTML = "";
    snapshot.forEach(doc => {
        const user = doc.data();
        if (doc.id === currentUser.uid) return;
        container.innerHTML += `
            <div class="user-card">
                <span>${user.name} (${user.email})</span>
                <button onclick="startChat('${doc.id}', '${user.name}')">💬 Message</button>
            </div>
        `;
    });
}

function startChat(otherUserId, otherUserName) {
    sessionStorage.setItem("chatWithId", otherUserId);
    sessionStorage.setItem("chatWithName", otherUserName);
    window.location.href = "messages.html";
}

async function loadConversations() {
    const container = document.getElementById("conversationsList");
    if (!container) return;
    const sentSnapshot = await db.collection("private_messages")
        .where("senderId", "==", currentUser.uid).get();
    const receivedSnapshot = await db.collection("private_messages")
        .where("receiverId", "==", currentUser.uid).get();
    const otherUserIds = new Set();
    sentSnapshot.forEach(doc => otherUserIds.add(doc.data().receiverId));
    receivedSnapshot.forEach(doc => otherUserIds.add(doc.data().senderId));
    if (otherUserIds.size === 0) {
        container.innerHTML = "<p>No conversations yet. Start one from the user list!</p>";
        return;
    }
    const userPromises = Array.from(otherUserIds).map(id => db.collection("users").doc(id).get());
    const userDocs = await Promise.all(userPromises);
    const users = userDocs.map(doc => ({ id: doc.id, name: doc.data().name }));
    container.innerHTML = "<h3>Your Conversations</h3>";
    users.forEach(user => {
        container.innerHTML += `
            <div class="conversation" onclick="openChat('${user.id}', '${user.name}')">
                💬 ${user.name}
            </div>
        `;
    });
}

let currentChatWithId = null;
let currentChatWithName = null;
let unsubscribeMessages = null;

function openChat(otherUserId, otherUserName) {
    currentChatWithId = otherUserId;
    currentChatWithName = otherUserName;
    document.getElementById("chatWithName").innerText = otherUserName;
    document.getElementById("conversationsList").style.display = "none";
    document.getElementById("chatView").style.display = "block";
    loadPrivateMessages();
}

function closeChat() {
    if (unsubscribeMessages) unsubscribeMessages();
    document.getElementById("conversationsList").style.display = "block";
    document.getElementById("chatView").style.display = "none";
    currentChatWithId = null;
}

function loadPrivateMessages() {
    const messagesDiv = document.getElementById("privateMessages");
    if (!messagesDiv) return;
    if (unsubscribeMessages) unsubscribeMessages();
    const participants = [currentUser.uid, currentChatWithId].sort();
    const conversationId = participants.join("_");
    unsubscribeMessages = db.collection("private_messages")
        .where("conversationId", "==", conversationId)
        .orderBy("timestamp", "asc")
        .onSnapshot(snapshot => {
            messagesDiv.innerHTML = "";
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.senderId === currentUser.uid;
                const time = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString() : "";
                messagesDiv.innerHTML += `
                    <div class="message ${isMe ? 'me' : ''}">
                        <strong>${isMe ? "You" : msg.senderName}</strong> <small>${time}</small><br>
                        ${msg.text}
                    </div>
                `;
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
}

async function sendPrivateMessage() {
    const input = document.getElementById("privateMessageInput");
    const text = input.value.trim();
    if (!text || !currentChatWithId) return;
    input.value = "";
    const participants = [currentUser.uid, currentChatWithId].sort();
    const conversationId = participants.join("_");
    await db.collection("private_messages").add({
        conversationId: conversationId,
        senderId: currentUser.uid,
        senderName: currentUserName,
        receiverId: currentChatWithId,
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ========== ASSIGNMENTS ==========
async function uploadAssignment() {
    const title = document.getElementById("assignmentTitle").value;
    const file = document.getElementById("assignmentFile").files[0];
    if (!title || !file) return alert("Please fill title and select a file.");
    const storageRef = storage.ref(`assignments/${currentUser.uid}/${Date.now()}_${file.name}`);
    try {
        const snapshot = await storageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        await db.collection("assignments").add({
            studentId: currentUser.uid,
            studentName: currentUserName,
            title: title,
            fileUrl: downloadURL,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("Assignment uploaded successfully!");
        loadStudentAssignments();
        document.getElementById("assignmentTitle").value = "";
        document.getElementById("assignmentFile").value = "";
    } catch (err) {
        alert("Upload failed: " + err.message);
    }
}

async function loadStudentAssignments() {
    const container = document.getElementById("studentAssignments");
    if (!container) return;
    let query = db.collection("assignments").orderBy("timestamp", "desc");
    if (currentUserRole !== "admin") {
        query = query.where("studentId", "==", currentUser.uid);
    }
    const snapshot = await query.get();
    container.innerHTML = "";
    snapshot.forEach(doc => {
        const a = doc.data();
        container.innerHTML += `
            <div class="assignment-item">
                <strong>${a.title}</strong> – by ${a.studentName}<br>
                <a href="${a.fileUrl}" target="_blank">📎 View File</a>
                ${currentUserRole === "admin" ? `<button onclick="deleteAssignment('${doc.id}')">Delete</button>` : ""}
            </div>
        `;
    });
}

async function deleteAssignment(assignmentId) {
    if (currentUserRole !== "admin") return;
    await db.collection("assignments").doc(assignmentId).delete();
    loadStudentAssignments();
}

async function loadAllAssignmentsForAdmin() {
    const container = document.getElementById("adminAssignments");
    if (!container) return;
    const snapshot = await db.collection("assignments").orderBy("timestamp", "desc").get();
    container.innerHTML = "";
    snapshot.forEach(doc => {
        const a = doc.data();
        container.innerHTML += `
            <div class="assignment-item">
                <strong>${a.title}</strong> – by ${a.studentName}<br>
                <a href="${a.fileUrl}" target="_blank">📎 View File</a>
                <button onclick="deleteAssignment('${doc.id}')">Delete</button>
            </div>
        `;
    });
}

// ========== INITIALIZE PAGE BASED ON URL ==========
document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname.split("/").pop();
    const unprotected = ["login.html", "register.html", "index.html"];
    if (!unprotected.includes(path)) {
        try {
            await protectPage();
        } catch (e) { return; }
    }

    if (path === "dashboard.html") loadDashboard();
    if (path === "library.html") displayBooks();
    if (path === "calendar.html") displayEvents();
    if (path === "admin.html" && currentUserRole === "admin") {
        loadBooksForDeletion();
        displayBooks();
        loadAllAssignmentsForAdmin();
    }
    if (path === "riddles.html") {
        await loadRiddleScore();
        renderCurrentRiddle();
    }
    if (path === "chat.html") listenForPublicMessages();
    if (path === "user_list.html") loadUsers();
    if (path === "messages.html") {
        const chatWithId = sessionStorage.getItem("chatWithId");
        const chatWithName = sessionStorage.getItem("chatWithName");
        if (chatWithId && chatWithName) {
            openChat(chatWithId, chatWithName);
            sessionStorage.removeItem("chatWithId");
            sessionStorage.removeItem("chatWithName");
        } else {
            loadConversations();
        }
    }
    if (path === "assignments.html") loadStudentAssignments();
});