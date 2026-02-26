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

