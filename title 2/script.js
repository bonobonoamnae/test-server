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
  const el = document.querySelector(".storybasil");
  if (!el) return;

  const fullText = el.textContent.trim();
  el.textContent = "";

  const clamp = (x) => Math.max(0, Math.min(1, x));

  function update() {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;

    // 화면 아래쪽 80% 지점에서 시작
    const start = vh * 0.8;

    // 화면 위쪽 20% 지점에서 완료
    const end = vh * 0.2;

    const progress = clamp((start - rect.top) / (start - end));

    const length = Math.floor(progress * fullText.length);

    el.textContent = fullText.slice(0, length);
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);

  update();
});