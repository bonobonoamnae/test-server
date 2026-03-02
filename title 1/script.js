const wrap = document.getElementById("menuWrap");
const title = document.getElementById("toggleTitle");
const boxes = document.getElementById("optionBoxes");

let manuallyToggled = false;

wrap.addEventListener("mouseenter", () => {
  if (!manuallyToggled) boxes.classList.add("show");
});

wrap.addEventListener("mouseleave", () => {
  if (!manuallyToggled) boxes.classList.remove("show");
});

title.addEventListener("click", () => {
  manuallyToggled = !manuallyToggled;
  boxes.classList.toggle("show", manuallyToggled);
});




document.addEventListener("DOMContentLoaded", () => {
  const el = document.querySelector(".storymalcha");
  if (!el) return;

  const full = el.textContent.trim();
  el.textContent = "";

  function type(speed = 35) {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      el.textContent = full.slice(0, i);
      if (i >= full.length) clearInterval(timer);
    }, speed);
  }

  const io = new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      type(35);
      obs.disconnect();
    }
  }, { threshold: 0.3 });

  io.observe(el);
});