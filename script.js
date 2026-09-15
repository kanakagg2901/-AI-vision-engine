/* =========================================================
   AEGIS — WEBSITE INTERACTIONS
   ========================================================= */

/* ---------------------------------------------------------
   Smooth scrolling
--------------------------------------------------------- */

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");

    if (!targetId || targetId === "#") {
      return;
    }

    const target = document.querySelector(targetId);

    if (!target) {
      return;
    }

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});


/* ---------------------------------------------------------
   Navbar shadow while scrolling
--------------------------------------------------------- */

const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {
  if (!navbar) {
    return;
  }

  if (window.scrollY > 20) {
    navbar.style.boxShadow = "0 10px 35px rgba(0, 0, 0, 0.25)";
  } else {
    navbar.style.boxShadow = "none";
  }
});


/* ---------------------------------------------------------
   Step cards reveal animation
--------------------------------------------------------- */

const cards = document.querySelectorAll(".step-card");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  },
  {
    threshold: 0.15
  }
);

cards.forEach((card) => {
  card.style.opacity = "0";
  card.style.transform = "translateY(25px)";
  card.style.transition = "opacity 0.6s ease, transform 0.6s ease";

  observer.observe(card);
});


/* ---------------------------------------------------------
   Fake live agent telemetry
--------------------------------------------------------- */

const perceptionItems = document.querySelectorAll(
  ".perception-item b"
);

const telemetryValues = ["✓", "2", "✓", "✓"];

let telemetryIndex = 0;

function updateTelemetry() {
  if (!perceptionItems.length) {
    return;
  }

  perceptionItems.forEach((item, index) => {
    item.textContent = telemetryValues[index];
  });

  telemetryIndex++;

  if (telemetryIndex > 3) {
    telemetryIndex = 0;
  }
}

setInterval(updateTelemetry, 2500);


/* ---------------------------------------------------------
   Demo action animation
--------------------------------------------------------- */

const actionValue = document.querySelector(".action-value");

const actions = [
  "→ Click Sign In",
  "→ Read page structure",
  "→ Protect sensitive data",
  "→ Execute locally"
];

let actionIndex = 0;

function updateAction() {
  if (!actionValue) {
    return;
  }

  actionValue.style.opacity = "0";

  setTimeout(() => {
    actionValue.textContent = actions[actionIndex];

    actionValue.style.opacity = "1";

    actionIndex++;

    if (actionIndex >= actions.length) {
      actionIndex = 0;
    }
  }, 250);
}

if (actionValue) {
  actionValue.style.transition = "opacity 0.25s ease";

  setInterval(updateAction, 2200);
}


/* ---------------------------------------------------------
   Install Extension button
--------------------------------------------------------- */

const downloadButton = document.getElementById("downloadBtn");

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    window.open(
      "https://github.com/kanakagg2901/-AI-vision-engine",
      "_blank"
    );
  });
}

/* ---------------------------------------------------------
   Mouse movement effect on browser mockup
--------------------------------------------------------- */

const agentWindow = document.querySelector(".agent-window");

if (agentWindow && window.innerWidth > 900) {

  agentWindow.addEventListener("mousemove", (event) => {

    const rect = agentWindow.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const rotateY =
      ((x / rect.width) - 0.5) * 4;

    const rotateX =
      ((y / rect.height) - 0.5) * -4;

    agentWindow.style.transform =
      `perspective(1200px)
       rotateY(${rotateY}deg)
       rotateX(${rotateX}deg)`;
  });


  agentWindow.addEventListener("mouseleave", () => {

    agentWindow.style.transform =
      "perspective(1200px) rotateY(-3deg) rotateX(0deg)";
  });
}


/* ---------------------------------------------------------
   Page loaded
--------------------------------------------------------- */

console.log(
  "%cAEGIS",
  "font-size:24px;font-weight:bold;"
);

console.log(
  "Privacy-preserving visual agent initialized."
);