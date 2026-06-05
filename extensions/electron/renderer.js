let port = 0;

const petContainer = document.getElementById("pet-container");
const canvas = document.getElementById("pet-canvas");
const ctx = canvas.getContext("2d");
const speechBubbleEl = document.getElementById("speech-bubble");
const bubbleTextEl = document.getElementById("bubble-text");

// State representation
let state = {
	slug: "",
	displayName: "",
	description: "",
	nick: "",
	mood: "idle",
	message: "",
	energy: 85,
	personality: { tier: "Common", chaos: 10, curiosity: 10, snark: 10 },
};

let clickActive = false;
let overrideMood = null;
let clickTimeout = null;
let bubbleTimeout = null;

const GENERAL_QUOTES = [
	"Keep coding, you're doing great! ✦",
	"Need a break? Remember to hydrate! 💧",
	"Are we building something amazing today? ✨",
	"Don't forget to commit your changes! 🚀",
	"You're the best dev ever! 🌟",
];

const CHAOS_QUOTES = [
	"*flips a bit in memory* Did you hear that?",
	"Let's delete package-lock.json just to feel something!",
	"Why write unit tests when we can live on the edge?",
	"*happy chaotic wiggling* Bug or feature? Let's find out!",
	"01001000 01000101 01001100 01010000!",
];

const CURIOSITY_QUOTES = [
	"What does this function do? Can I eat it? ✦",
	"Ooh, a new library! What does it import?",
	"Tell me about this project. Are we making a game?",
	"*stares at your code* What happens if we run this loop?",
	"Why are there so many folders here? 📂",
];

const SNARK_QUOTES = [
	"Is this compile error art, or did you write it on purpose?",
	"Oh, refactoring again? Groundhog Day vibes.",
	"A loop a day keeps the clean code away, apparently.",
	"At least the comments look nice. The code... well.",
	"Another dependency? Are we building a rocket or a website?",
];

const HURTING_QUOTES = [
	"Ouch! Tummy rumbles... need a berry! 🍇",
	"Too tired... it hurts! 😿",
	"Running on fumes here... got food? 😿",
	"Oof! My energy is flatlining... 💔",
];

function showBubble(text, duration = 5000) {
	if (!text) {
		speechBubbleEl.classList.remove("visible");
		speechBubbleEl.classList.remove("success");
		speechBubbleEl.classList.remove("error");
		return;
	}

	bubbleTextEl.textContent = text;
	speechBubbleEl.classList.add("visible");

	// Detect notifications and apply styling
	speechBubbleEl.classList.remove("success");
	speechBubbleEl.classList.remove("error");

	let finalDuration = duration;
	if (text.includes("Build complete") || text.includes("Tests passed")) {
		speechBubbleEl.classList.add("success");
		finalDuration = 7000;
	} else if (text.includes("Build failed") || text.includes("Tests failed")) {
		speechBubbleEl.classList.add("error");
		finalDuration = 7000;
	}

	if (bubbleTimeout) clearTimeout(bubbleTimeout);
	bubbleTimeout = setTimeout(() => {
		speechBubbleEl.classList.remove("visible");
		speechBubbleEl.classList.remove("success");
		speechBubbleEl.classList.remove("error");
	}, finalDuration);
}

// Animation properties
const spritesheetImage = new Image();
let spritesheetLoaded = false;
let currentFrame = 0;
let lastFrameTime = 0;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 9;

// Pacing state
let posX = 60; // Start near the center (max offset is 120px)
let direction = 1; // 1 = right, -1 = left
const speed = 1.0; // Pacing speed in pixels per frame

const STATE_ROWS = {
	idle: 0,
	runRight: 1,
	runLeft: 2,
	wave: 3,
	jump: 4,
	failed: 5,
	waiting: 6,
	running: 7,
	review: 8,
};

const FRAME_COUNTS = {
	idle: 6,
	runRight: 8,
	runLeft: 8,
	wave: 4,
	jump: 5,
	failed: 8,
	waiting: 6,
	running: 6,
	review: 6,
};

function selectPetState(mood) {
	// Pacing mood choice
	if (mood === "working") {
		return direction === 1 ? "runRight" : "runLeft";
	}

	switch (mood) {
		case "idle":
		case "sleep":
			return "idle";
		case "talking":
			return "wave";
		case "thinking":
			return "review";
		case "happy":
		case "hatch":
			return "jump";
		case "panic":
			return "failed";
		case "guard":
			return "waiting";
		case "running":
			return "running";
		default:
			return "idle";
	}
}

async function connectToAgent() {
	if (window.api?.getPort) {
		port = await window.api.getPort();
	} else {
		const params = new URLSearchParams(window.location.search);
		port = parseInt(params.get("port") || "0", 10);
	}

	if (!port) {
		console.error("Agent port not configured.");
		return;
	}

	const eventSource = new EventSource(`http://localhost:${port}/events`);

	eventSource.onmessage = (event) => {
		const data = JSON.parse(event.data);

		const slugChanged = data.slug !== state.slug;
		state = data;

		if (!clickActive) {
			showBubble(state.message, 5000);
		}

		// Reload spritesheet if pet slug changes
		if (slugChanged) {
			spritesheetLoaded = false;
			spritesheetImage.src = `http://localhost:${port}/spritesheet?t=${Date.now()}`;
			spritesheetImage.onload = () => {
				spritesheetLoaded = true;
				currentFrame = 0;
			};
		}
	};

	eventSource.onerror = (err) => {
		console.error("SSE connection error:", err);
		showBubble("Reconnecting to agent...");
	};
}

connectToAgent();

// Handle click reaction on pet
canvas.onclick = () => {
	clickActive = true;
	currentFrame = 0; // Reset frame to start reaction from beginning

	if (state.energy < 20) {
		overrideMood = "panic"; // maps to failed (row 5)
		const randomQuote = HURTING_QUOTES[Math.floor(Math.random() * HURTING_QUOTES.length)];
		showBubble(randomQuote, 4000);
	} else {
		overrideMood = "happy"; // maps to jump (row 4)
		let pool = GENERAL_QUOTES;
		if (state.personality) {
			const { chaos, curiosity, snark } = state.personality;
			const maxVal = Math.max(chaos || 0, curiosity || 0, snark || 0);
			if (maxVal > 0) {
				if (maxVal === chaos) {
					pool = CHAOS_QUOTES;
				} else if (maxVal === curiosity) {
					pool = CURIOSITY_QUOTES;
				} else if (maxVal === snark) {
					pool = SNARK_QUOTES;
				}
			}
		}
		const randomQuote = pool[Math.floor(Math.random() * pool.length)];
		showBubble(randomQuote, 4000);
	}

	if (clickTimeout) clearTimeout(clickTimeout);
	clickTimeout = setTimeout(() => {
		overrideMood = null;
		clickActive = false;
	}, 1500);
};

function animate(timestamp) {
	if (!lastFrameTime) lastFrameTime = timestamp;
	const elapsed = timestamp - lastFrameTime;

	const currentMood = overrideMood || state.mood;
	const animState = selectPetState(currentMood);
	const row = STATE_ROWS[animState] ?? 0;
	const totalFrames = FRAME_COUNTS[animState] ?? 6;

	// Frame tick duration (adjust based on speed of mood)
	let frameDuration = 180;
	if (currentMood === "working") {
		frameDuration = 100; // run faster
	} else if (currentMood === "talking") {
		frameDuration = 130;
	} else if (currentMood === "idle") {
		frameDuration = 220; // relax
	} else if (currentMood === "happy") {
		frameDuration = 120; // energetic jump
	} else if (currentMood === "panic" || currentMood === "failed") {
		frameDuration = 100; // frantic/failed
	}

	if (elapsed >= frameDuration) {
		currentFrame = (currentFrame + 1) % totalFrames;
		lastFrameTime = timestamp;

		// Move horizontally if working
		if (currentMood === "working") {
			posX += direction * speed;
			const maxPosX = 120; // 200px width - 80px container
			if (posX >= maxPosX) {
				posX = maxPosX;
				direction = -1;
			} else if (posX <= 0) {
				posX = 0;
				direction = 1;
			}
		} else {
			// Decelerate and slide back to center slowly when stationary
			const targetX = 60;
			const diff = targetX - posX;
			if (Math.abs(diff) > 0.5) {
				posX += diff * 0.1;
			}
		}
	}

	// Always compute and apply transforms on every animation frame for smoothness
	let translateY = 0;
	if (clickActive && state.energy < 20) {
		// Frantic jumping: bounce up and down rapidly
		const cycle = (timestamp % 250) / 250; // 0 to 1
		translateY = -Math.abs(Math.sin(cycle * Math.PI)) * 25; // Bounce up by 25px
	}

	let transformStr = `translateX(${posX - 60}px)`;
	if (translateY !== 0) {
		transformStr += ` translateY(${translateY}px)`;
	}
	petContainer.style.transform = transformStr;

	// Render canvas frame
	if (spritesheetLoaded) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const frameWidth = spritesheetImage.width / ATLAS_COLS;
		const frameHeight = spritesheetImage.height / ATLAS_ROWS;

		ctx.drawImage(
			spritesheetImage,
			currentFrame * frameWidth,
			row * frameHeight,
			frameWidth,
			frameHeight,
			0,
			0,
			canvas.width,
			canvas.height,
		);
	}

	requestAnimationFrame(animate);
}

// Start animation loop
requestAnimationFrame(animate);
